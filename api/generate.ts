/**
 * ============================================================
 * Vercel Serverless Function: POST /api/generate
 * ============================================================
 *
 * 这是部署在 Vercel 上的后端 API，负责：
 * 1. 接收前端的游戏生成请求（模板ID + 用户语音/文字输入）
 * 2. 解析请求中的模型（内置 modelId / 自定义 modelConfig / 环境变量默认）
 * 3. 调用 OpenAI 兼容的 Chat Completions API 生成 HTML5 儿童游戏
 * 4. AI 调用失败时降级到本地 Mock 游戏模板
 * 5. 返回游戏 HTML 代码 + 引擎标识 + 实际使用的模型
 *
 * 依赖的环境变量（在 Vercel Settings 中配置）：
 *   VOLCENGINE_API_KEY       - 火山方舟 API Key
 *   VOLCENGINE_BASE_URL      - 可选，内置模型接口地址（默认火山方舟）
 *   DEEPSEEK_ENDPOINT_ID     - DeepSeek V4 Pro 推理接入点 ID（ep-xxx）
 *   DOUBAO_ENDPOINT_ID       - Doubao Seed 2.0 Pro 推理接入点 ID（ep-xxx）
 *   VOLCENGINE_ENDPOINT_ID   - 可选，Doubao 旧变量回退
 *   GAME_MODEL               - 默认模型：deepseek | doubao（可选）
 *   ALLOWED_MODEL_HOSTS      - 自定义模型域名白名单（逗号分隔，可选）
 *   ALLOW_LOCAL_MODEL_HOSTS  - 是否允许 localhost（仅本地测试）
 *   MODEL_TIMEOUT_MS         - 生成超时（默认 280000）
 *
 * 超时配置：vercel.json 中 generate maxDuration=300，test maxDuration=60。
 */
import { Hono } from 'hono';

// ===== BEGIN inlined model core (source: api/_model.ts) =====
/**
 * ============================================================
 * 模型注册与调用（Vercel 内联源）
 * ============================================================
 *
 * 职责：
 * 1. 读取环境变量中的内置模型（Doubao / DeepSeek）
 * 2. 校验并解析请求中的自定义模型配置
 * 3. 解析默认模型（GAME_MODEL → 第一个可用内置模型）
 * 4. 统一调用 OpenAI 兼容的 Chat Completions 接口
 * 5. 提供模型测试（只验证调用与返回，不生成游戏）
 *
 * 重要：Vercel 的 Node File Trace 不会把 api/ 下的跨文件
 * 相对导入打包进 sibling function，运行时会出现
 * ERR_MODULE_NOT_FOUND / FUNCTION_INVOCATION_FAILED。
 * 因此本文件仅作为内联源，由 temp/v3.2/inline-api-model.mjs
 * 复制到以下三个自包含函数文件，请勿直接 import：
 *   - api/generate.ts
 *   - api/models/index.ts
 *   - api/models/test.ts
 * 本文件与 server/src/services/model.ts 保持对等。
 * 所有环境变量都在函数内部读取，确保 .env 已加载。
 */

export type ModelSource = 'env' | 'custom';

export interface EnvModelInfo {
  id: string;
  name: string;
  source: 'env';
  available: boolean;
  unavailableReason?: string;
  baseUrl: string;
  modelPreview: string;
  hasApiKey: boolean;
  isDefault: boolean;
}

export interface CustomModelPayload {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ResolvedModel {
  id: string;
  name: string;
  source: ModelSource;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ModelCatalog {
  models: EnvModelInfo[];
  defaultModelId: string | null;
  defaultModelName: string | null;
  hasServerApiKey: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelTestResult {
  ok: boolean;
  latencyMs: number;
  modelName: string;
  source: ModelSource | 'none';
  reply?: string;
  message?: string;
  code?: string;
  status?: number;
}

/** 请求中的模型配置不合法（参数问题，应返回 400） */
export class ModelConfigError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MODEL_CONFIG_INVALID') {
    super(message);
    this.name = 'ModelConfigError';
    this.code = code;
  }
}

/** 调用模型失败（上游/网络/超时，可降级 Mock） */
export class ModelCallError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly latencyMs: number;

  constructor(
    message: string,
    options: { code?: string; status?: number; latencyMs?: number } = {}
  ) {
    super(message);
    this.name = 'ModelCallError';
    this.code = options.code || 'MODEL_CALL_FAILED';
    this.status = options.status;
    this.latencyMs = options.latencyMs ?? 0;
  }
}

// ============================================================
// 常量
// ============================================================

const DEFAULT_ARK_BASE_URL =
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const DEFAULT_ALLOWED_HOSTS = [
  'ark.cn-beijing.volces.com',
  'api.deepseek.com',
  'api.openai.com',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
];

interface EnvModelDef {
  id: string;
  name: string;
  endpointEnvVars: string[];
  primaryEndpointEnv: string;
}

const ENV_MODEL_DEFS: EnvModelDef[] = [
  {
    id: 'doubao',
    name: 'Doubao Seed 2.0 Pro',
    endpointEnvVars: ['DOUBAO_ENDPOINT_ID', 'VOLCENGINE_ENDPOINT_ID'],
    primaryEndpointEnv: 'DOUBAO_ENDPOINT_ID',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V4 Pro',
    endpointEnvVars: ['DEEPSEEK_ENDPOINT_ID'],
    primaryEndpointEnv: 'DEEPSEEK_ENDPOINT_ID',
  },
];

interface InternalEnvModel {
  info: EnvModelInfo;
  endpoint: string;
  apiKey: string;
}

// ============================================================
// 环境变量读取（全部延迟到调用时，确保 .env 已加载）
// ============================================================

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function getServerApiKey(): string {
  return readEnv('VOLCENGINE_API_KEY');
}

function getArkBaseUrl(): string {
  return readEnv('VOLCENGINE_BASE_URL') || DEFAULT_ARK_BASE_URL;
}

function getEndpoint(def: EnvModelDef): string {
  for (const key of def.endpointEnvVars) {
    const value = readEnv(key);
    if (value) return value;
  }
  return '';
}

function getAllowedHosts(): string[] {
  const raw = readEnv('ALLOWED_MODEL_HOSTS');
  if (!raw) return DEFAULT_ALLOWED_HOSTS;
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
}

function isLocalHostsAllowed(): boolean {
  const value = readEnv('ALLOW_LOCAL_MODEL_HOSTS').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

// ============================================================
// 工具函数
// ============================================================

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isLocalHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string
): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 200);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

// ============================================================
// 内置模型
// ============================================================

function buildEnvModels(): InternalEnvModel[] {
  const apiKey = getServerApiKey();
  const baseUrl = getArkBaseUrl();

  return ENV_MODEL_DEFS.map((def) => {
    const endpoint = getEndpoint(def);
    const available = Boolean(endpoint && apiKey);

    let unavailableReason: string | undefined;
    if (!endpoint) {
      unavailableReason = `未配置 ${def.primaryEndpointEnv}`;
    } else if (!apiKey) {
      unavailableReason = '未配置 VOLCENGINE_API_KEY';
    }

    const info: EnvModelInfo = {
      id: def.id,
      name: def.name,
      source: 'env',
      available,
      baseUrl,
      modelPreview: maskSecret(endpoint),
      hasApiKey: Boolean(apiKey),
      isDefault: false,
    };
    if (unavailableReason) info.unavailableReason = unavailableReason;

    return { info, endpoint, apiKey };
  });
}

function toResolvedModel(model: InternalEnvModel): ResolvedModel {
  return {
    id: model.info.id,
    name: model.info.name,
    source: 'env',
    baseUrl: model.info.baseUrl,
    model: model.endpoint,
    apiKey: model.apiKey,
  };
}

/**
 * 解析默认模型：GAME_MODEL（可用时）→ 第一个可用内置模型 → null
 */
export function resolveDefaultModel(): ResolvedModel | null {
  const available = buildEnvModels().filter((model) => model.info.available);
  if (available.length === 0) return null;

  const preferredId = readEnv('GAME_MODEL').toLowerCase();
  const preferred = preferredId
    ? available.find((model) => model.info.id === preferredId)
    : undefined;

  return toResolvedModel(preferred || available[0]);
}

/**
 * 获取内置模型目录（脱敏，不含完整 endpoint / API Key）
 */
export function getModelCatalog(): ModelCatalog {
  const defaultModel = resolveDefaultModel();
  const models = buildEnvModels().map((model) => ({
    ...model.info,
    isDefault: model.info.id === defaultModel?.id,
  }));

  return {
    models,
    defaultModelId: defaultModel?.id ?? null,
    defaultModelName: defaultModel?.name ?? null,
    hasServerApiKey: Boolean(getServerApiKey()),
  };
}

// ============================================================
// 自定义模型校验
// ============================================================

function validateBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ModelConfigError('接口地址不是合法的 URL');
  }

  if (url.username || url.password) {
    throw new ModelConfigError('接口地址不能包含账号密码');
  }

  const hostname = normalizeHostname(url.hostname);
  const local = isLocalHostname(hostname);
  const allowLocal = isLocalHostsAllowed();

  if (local && !allowLocal) {
    throw new ModelConfigError(
      '本地接口地址未开启：请设置 ALLOW_LOCAL_MODEL_HOSTS=1（仅建议本地测试）'
    );
  }

  // 本地地址在显式开启后直接放行（含任意端口）
  if (local && allowLocal) {
    return url;
  }

  const hosts = getAllowedHosts();
  const fullHost = url.host.toLowerCase().replace(/\.$/, '');
  const allowed = hosts.some(
    (entry) => entry === fullHost || entry === hostname
  );

  if (!allowed) {
    throw new ModelConfigError(
      '接口地址不在白名单内，请使用支持的模型服务地址'
    );
  }

  if (url.protocol !== 'https:') {
    throw new ModelConfigError('接口地址必须使用 HTTPS');
  }

  return url;
}

function resolveCustomModel(input: unknown): ResolvedModel {
  const record = asRecord(input);
  if (!record) {
    throw new ModelConfigError('模型配置格式错误');
  }

  const name = readString(record, 'name');
  if (!name || name.length > 30) {
    throw new ModelConfigError('模型名称长度需为 1-30 个字符');
  }

  const baseUrl = readString(record, 'baseUrl');
  if (!baseUrl) {
    throw new ModelConfigError('请填写接口地址');
  }
  const url = validateBaseUrl(baseUrl);

  const model = readString(record, 'model');
  if (!model || model.length > 200) {
    throw new ModelConfigError('模型 ID / 接入点长度需为 1-200 个字符');
  }

  let apiKey = readString(record, 'apiKey');
  if (apiKey.length > 500) {
    throw new ModelConfigError('API Key 长度不能超过 500 个字符');
  }

  if (!apiKey) {
    // 仅火山方舟域名允许回退服务端默认 Key
    if (normalizeHostname(url.hostname) === 'ark.cn-beijing.volces.com') {
      apiKey = getServerApiKey();
    }
    if (!apiKey) {
      throw new ModelConfigError(
        '缺少 API Key：非火山方舟接口需在模型配置中填写 API Key'
      );
    }
  }

  const rawId = readString(record, 'id');
  const id = rawId ? rawId.slice(0, 100) : 'custom';

  return { id, name, source: 'custom', baseUrl, model, apiKey };
}

/**
 * 解析请求中的模型。
 *
 * - 携带 modelConfig → 自定义模型
 * - 携带 modelId / model → 内置模型（不可用则抛 ModelConfigError）
 * - 都没携带 → 默认模型（GAME_MODEL）
 * - 没有任何可用模型 → null（由调用方 Mock 兜底）
 */
export function resolveRequestModel(input: {
  modelId?: unknown;
  model?: unknown;
  modelConfig?: unknown;
}): ResolvedModel | null {
  if (input.modelConfig !== undefined && input.modelConfig !== null) {
    return resolveCustomModel(input.modelConfig);
  }

  const rawId =
    typeof input.modelId === 'string'
      ? input.modelId
      : typeof input.model === 'string'
        ? input.model
        : '';
  const id = rawId.trim().toLowerCase();

  if (id) {
    const envModel = buildEnvModels().find((model) => model.info.id === id);
    if (!envModel) {
      throw new ModelConfigError(`未知模型：${rawId.trim()}`, 'MODEL_NOT_FOUND');
    }
    if (!envModel.info.available) {
      throw new ModelConfigError(
        `模型「${envModel.info.name}」未配置：${
          envModel.info.unavailableReason || '缺少环境变量'
        }`,
        'MODEL_UNAVAILABLE'
      );
    }
    return toResolvedModel(envModel);
  }

  return resolveDefaultModel();
}

// ============================================================
// Chat Completions 调用
// ============================================================

export interface CallOptions {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export async function callChatCompletion(
  model: ResolvedModel,
  messages: ChatMessage[],
  options: CallOptions
): Promise<{ text: string; latencyMs: number }> {
  const started = Date.now();
  const timeoutMs = Math.max(1000, options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(model.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify({
          model: model.model,
          messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        }),
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (isAbortError(error)) {
        throw new ModelCallError(
          `请求超时（${Math.round(timeoutMs / 1000)} 秒）`,
          { code: 'TIMEOUT', latencyMs }
        );
      }
      throw new ModelCallError(
        '无法连接模型接口（请检查地址或重定向设置）',
        { code: 'NETWORK', latencyMs }
      );
    }

    const latencyMs = Date.now() - started;

    if (!response.ok) {
      let detail = '';
      try {
        detail = redact(await response.text());
      } catch {
        detail = '';
      }
      if (response.status === 401 || response.status === 403) {
        throw new ModelCallError('鉴权失败，请检查 API Key', {
          code: 'AUTH',
          status: response.status,
          latencyMs,
        });
      }
      if (response.status === 404) {
        throw new ModelCallError('接口地址或模型 ID 不存在', {
          code: 'NOT_FOUND',
          status: response.status,
          latencyMs,
        });
      }
      if (response.status === 429) {
        throw new ModelCallError('请求过于频繁或额度不足', {
          code: 'RATE_LIMIT',
          status: response.status,
          latencyMs,
        });
      }
      if (response.status >= 500) {
        throw new ModelCallError('模型服务暂时不可用', {
          code: 'UPSTREAM_5XX',
          status: response.status,
          latencyMs,
        });
      }
      throw new ModelCallError(
        `模型接口返回错误（HTTP ${response.status}）${
          detail ? `：${detail}` : ''
        }`,
        { code: 'UPSTREAM_ERROR', status: response.status, latencyMs }
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ModelCallError('模型返回内容不是合法 JSON', {
        code: 'BAD_RESPONSE',
        status: response.status,
        latencyMs,
      });
    }

    const record = asRecord(data);
    const choices = record?.choices;
    const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const message = firstChoice ? asRecord(firstChoice.message) : null;
    const content = message?.content;
    const finishReason = firstChoice?.finish_reason;

    if (typeof content !== 'string' || !content.trim()) {
      // 推理模型（如 DeepSeek V4 Pro）会先消耗 reasoning tokens，
      // max_tokens 太小时 content 为空且 finish_reason=length。
      const messageText =
        finishReason === 'length'
          ? '模型未返回最终文本（可能被 max_tokens 截断）'
          : '模型未返回内容';
      throw new ModelCallError(messageText, {
        code: 'EMPTY_RESPONSE',
        status: response.status,
        latencyMs,
      });
    }

    return { text: content, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 模型测试（只验证调用与返回，不生成游戏）
// ============================================================

function getTestTimeoutMs(): number {
  const raw = Number(readEnv('MODEL_TEST_TIMEOUT_MS'));
  if (!Number.isFinite(raw) || raw <= 0) return 20000;
  return Math.min(Math.max(raw, 1000), 60000);
}

export function getGenerationTimeoutMs(): number {
  const raw = Number(readEnv('MODEL_TIMEOUT_MS'));
  if (!Number.isFinite(raw) || raw <= 0) return 280000;
  return Math.min(Math.max(raw, 5000), 295000);
}

export async function testModel(input: {
  modelId?: unknown;
  model?: unknown;
  modelConfig?: unknown;
}): Promise<ModelTestResult> {
  const hasModelInput =
    Boolean(input.modelId) ||
    Boolean(input.model) ||
    (input.modelConfig !== undefined && input.modelConfig !== null);

  if (!hasModelInput) {
    return {
      ok: false,
      latencyMs: 0,
      modelName: '',
      source: 'none',
      message: '缺少模型参数：请提供 modelId 或 modelConfig',
      code: 'MISSING_MODEL',
    };
  }

  let resolved: ResolvedModel | null;
  try {
    resolved = resolveRequestModel(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '模型配置不合法';
    const code =
      error instanceof ModelConfigError ? error.code : 'MODEL_CONFIG_INVALID';
    return {
      ok: false,
      latencyMs: 0,
      modelName: '',
      source: 'none',
      message,
      code,
    };
  }

  if (!resolved) {
    return {
      ok: false,
      latencyMs: 0,
      modelName: '',
      source: 'none',
      message: '未配置可用模型，请检查环境变量或添加自定义模型',
      code: 'NO_MODEL',
    };
  }

  try {
    const { text, latencyMs } = await callChatCompletion(
      resolved,
      [{ role: 'user', content: '请只回复：OK' }],
      {
        // 推理模型会先消耗 reasoning tokens，8 太小会导致 content 为空；
        // 256 足够覆盖推理开销，同时成本仍然很低。
        maxTokens: 256,
        temperature: 0,
        timeoutMs: getTestTimeoutMs(),
      }
    );

    return {
      ok: true,
      latencyMs,
      modelName: resolved.name,
      source: resolved.source,
      reply: text.trim().slice(0, 100),
    };
  } catch (error) {
    if (error instanceof ModelCallError) {
      return {
        ok: false,
        latencyMs: error.latencyMs,
        modelName: resolved.name,
        source: resolved.source,
        message: error.message,
        code: error.code,
        status: error.status,
      };
    }
    return {
      ok: false,
      latencyMs: 0,
      modelName: resolved.name,
      source: resolved.source,
      message: '模型测试失败',
      code: 'UNKNOWN',
    };
  }
}
// ===== END inlined model core =====

// ============================================================
// AI System Prompt - 告诉 AI 怎么生成儿童游戏
// ============================================================
const SYSTEM_PROMPT = `你是一个儿童游戏生成专家。你必须生成一个完整、可玩的 HTML5 游戏。

## 必须遵循的规则
1. **交互方式**：至少包含 3 种交互（点击、拖拽、键盘方向键等）
2. **得分系统**：必须有分数显示或进度条，左上角显示
3. **音效触发**：在关键事件处用注释标注音效触发点（如 <!-- SFX: jump -->）
4. **游戏时长**：一局 30-60 秒，结束后显示得分和重玩按钮
5. **胜利/失败**：必须有明确的胜利条件和失败条件
6. **默认类型**：如果用户描述不明确，默认生成「收集类」游戏（最受 3-10 岁儿童欢迎）
7. **移动端适配**：使用 touch 事件，viewport width=device-width，禁止页面缩放
8. **视觉风格**：明亮卡通、大按钮、圆角 UI、高对比度色彩

## 输出格式
严格输出 JSON：
{
  "title": "游戏名称（4-8个字）",
  "html": "完整的 HTML5 游戏代码"
}`;

// ============================================================
// 输出解析
// ============================================================

/**
 * 解析 AI 输出的文本，提取 JSON 游戏数据
 * 
 * AI 可能返回多种格式：
 * 1. 纯 JSON: {"title":"xxx","html":"..."}
 * 2. Markdown 代码块: ```json { ... } ```
 * 3. 普通代码块: ``` { ... } ```
 * 4. JSON 被截断时，尝试从已有内容提取 title 和 html
 * 
 * @throws 如果所有解析方式都失败
 */
function parseGameOutput(text: string): { title: string; html: string } {
  // 策略 1：直接解析 JSON
  try { return JSON.parse(text); } catch {}

  // 策略 2：提取 ```json ... ```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }

  // 策略 3：提取 ``` ... ```
  const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch {}
  }

  // 策略 4：JSON 被截断时，尝试用正则提取 title 和 html
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/);
  if (titleMatch && htmlMatch) {
    let html = htmlMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
    console.log('[generate] ⚠️ JSON 不完整，通过正则提取了 title 和 html');
    return { title: titleMatch[1], html };
  }

  // 策略 5：如果返回的是纯 HTML（没有 JSON 包裹），直接当 html 用
  const doctypeMatch = text.match(/<!DOCTYPE html>[\s\S]*/i);
  if (doctypeMatch) {
    const titleFromTag = text.match(/<title>([^<]*)<\/title>/i);
    console.log('[generate] ⚠️ AI 返回了纯 HTML，直接使用');
    return {
      title: titleFromTag ? titleFromTag[1] : 'AI 生成的游戏',
      html: doctypeMatch[0],
    };
  }

  throw new Error('无法解析 AI 输出');
}

// ============================================================
// Mock 兜底 - AI 不可用时的本地备用游戏
// ============================================================

/**
 * 生成本地 Mock 游戏
 * @param _prompt 用户输入（当前未使用，仅保留接口一致性）
 * @param templateId 模板 ID，匹配对应主题的预设游戏
 */
function generateMockGame(_prompt: string, templateId?: string) {
  const games = [
    {
      title: "跳跃的小兔子",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>跳跃的小兔子</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { 
      background: linear-gradient(135deg, #90ee90 0%, #87ceeb 100%);
      display:flex; align-items:center; justify-content:center; 
      min-height:100vh; font-family:system-ui, sans-serif;
    }
    .game { width:100%; max-width:500px; text-align:center; padding:20px; }
    .bunny { font-size:100px; cursor:pointer; display:inline-block; transition:transform 0.1s; }
    .bunny:active { transform:translateY(-20px) scale(1.1); }
    .score { font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="bunny" id="bunny">🐰</div>
  </div>
  <script>
    let score=0;const b=document.getElementById('bunny'),s=document.getElementById('score');
    b.addEventListener('click',()=>{score++;s.textContent=score;b.style.animation='none';setTimeout(()=>b.style.animation='',10)});
  </script>
</body>
</html>`
    },
    {
      title: "太空飞船大冒险",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>太空飞船大冒险</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { 
      background: linear-gradient(135deg, #0c0c1e 0%, #3a1c71 100%);
      display:flex; align-items:center; justify-content:center; 
      min-height:100vh; font-family:system-ui, sans-serif;
    }
    .game { width:100%; max-width:500px; text-align:center; padding:20px; }
    .rocket { font-size:100px; cursor:pointer; display:inline-block; transition:transform 0.1s; }
    .rocket:active { transform:translateY(-20px) scale(1.1); }
    .score { font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="rocket" id="rocket">🚀</div>
  </div>
  <script>
    let score=0;const r=document.getElementById('rocket'),s=document.getElementById('score');
    r.addEventListener('click',()=>{score++;s.textContent=score;r.style.animation='none';setTimeout(()=>r.style.animation='',10)});
  </script>
</body>
</html>`
    }
  ];
  
  if (templateId === 'animal') return games[0];
  if (templateId === 'space') return games[1];
  return games[Math.floor(Math.random() * games.length)];
}

// ============================================================
// 模板提示前缀
// ============================================================
const TEMPLATE_HINTS: Record<string, string> = {
  'animal': '这是一个关于动物的游戏',
  'vehicle': '这是一个关于交通工具/汽车的游戏',
  'princess': '这是一个关于公主/魔法的游戏',
  'dinosaur': '这是一个关于恐龙的游戏',
  'space': '这是一个关于太空的游戏'
};

// ============================================================
// Hono 路由处理
// ============================================================

const app = new Hono();

/**
 * POST /api/generate
 *
 * 请求体：{ templateId?, userPrompt, remixFrom?, remixInstruction?, ...,
 *           modelId?, model?, modelConfig? }
 * 响应体：{ success: true, data: { title, gameHtml, engine, model, modelName, modelSource } }
 *
 * 模型选择优先级：
 * 1. modelConfig（自定义模型）
 * 2. modelId / model（内置模型）
 * 3. 环境变量 GAME_MODEL（未选择时）
 * 4. 无可用模型 → Mock
 */
app.post('*', async (c) => {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await c.req.json();
      body =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : {};
    } catch {
      return c.json({ success: false, message: '请求参数格式错误' }, 400);
    }

    const {
      templateId,
      userPrompt,
      remixFrom,
      remixInstruction,
      originalUserPrompt,
      originalTitle,
      originalGameHtmlPreview,
      modelId,
      model: legacyModel,
      modelConfig,
    } = body;

    if (
      typeof userPrompt !== 'string' ||
      !userPrompt.trim()
    ) {
      return c.json(
        { success: false, message: '请先说出你的游戏创意！' },
        400
      );
    }

    const promptText = userPrompt as string;

    console.log('[generate] 请求:', {
      templateId,
      prompt: promptText.slice(0, 50),
      remix: Boolean(remixFrom),
      modelId: modelId || legacyModel || null,
      customModel: Boolean(modelConfig),
    });

    // 拼接最终 Prompt
    let finalPrompt = promptText;
    if (remixFrom && remixInstruction) {
      finalPrompt = `
原始游戏信息：
- 原始用户描述：${originalUserPrompt || ''}
- 原始游戏标题：${originalTitle || ''}
- 原始游戏 HTML 片段：${originalGameHtmlPreview || ''}

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个完整的新游戏。新游戏应体现用户的改编意图，同时保持适合 3-10 岁儿童的简洁玩法。
`;
    } else if (
      typeof templateId === 'string' &&
      TEMPLATE_HINTS[templateId]
    ) {
      finalPrompt = TEMPLATE_HINTS[templateId] + '。' + promptText;
    }

    // 解析模型：自定义 modelConfig > 内置 modelId/model > GAME_MODEL 默认模型
    let resolved;
    try {
      resolved = resolveRequestModel({
        modelId: modelId || legacyModel,
        modelConfig,
      });
    } catch (error) {
      if (error instanceof ModelConfigError) {
        return c.json({ success: false, message: error.message }, 400);
      }
      throw error;
    }

    // 没有任何可用模型 → Mock 兜底（与旧行为一致）
    if (!resolved) {
      console.log('[generate] 未配置可用模型，使用 Mock');
      const game = generateMockGame(promptText, templateId as string | undefined);
      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'mock',
          model: 'mock',
          modelName: '本地模板',
        },
      });
    }

    console.log(
      `[generate] 使用模型: ${resolved.name} (${resolved.source}), host=${safeHost(resolved.baseUrl)}`
    );

    try {
      const { text, latencyMs } = await callChatCompletion(
        resolved,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: finalPrompt },
        ],
        {
          maxTokens: 8192,
          temperature: 0.7,
          timeoutMs: getGenerationTimeoutMs(),
        }
      );

      console.log(
        `[generate] ${resolved.name} 响应耗时 ${latencyMs}ms，原始输出前 200 字符:`,
        text.slice(0, 200)
      );

      const game = parseGameOutput(text);
      console.log(`[generate] ✅ ${resolved.name} 生成成功:`, game.title);

      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'volcengine',
          model: resolved.id,
          modelName: resolved.name,
          modelSource: resolved.source,
        },
      });
    } catch (aiError) {
      const warning =
        aiError instanceof ModelCallError
          ? aiError.message
          : '模型调用失败';
      console.warn('[generate] ⚠️ 模型调用失败，降级 Mock:', warning);

      const game = generateMockGame(promptText, templateId as string | undefined);
      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'mock',
          model: 'mock',
          modelName: '本地模板',
          warning: `${warning}，已降级为本地模板`,
        },
      });
    }
  } catch (error) {
    console.error('[generate] 失败:', error);
    return c.json(
      { success: false, message: '生成失败，请稍后再试' },
      500
    );
  }
});

/** 只打印主机名，避免日志出现完整地址或密钥 */
function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-url';
  }
}

/** Vercel 要求使用命名 HTTP 方法导出 */
export const POST = (request: Request) => app.fetch(request);
