/**
 * ============================================================
 * 模型注册与调用（V3.5 唯一实现）
 * ============================================================
 *
 * 职责：
 * 1. 读取环境变量中的内置模型（Doubao / DeepSeek）
 * 2. 校验并解析请求中的自定义模型配置
 * 3. 解析默认模型（GAME_MODEL → 第一个可用内置模型）
 * 4. 统一调用 OpenAI 兼容的 Chat Completions 接口
 * 5. 提供模型测试（只验证调用与返回，不生成游戏）
 *
 * V3.5 起本文件是唯一实现：`api/` 由 scripts/build-api.mjs
 * 从本文件与 api-src/ 一起打包生成，不再手工同步副本。
 * 所有环境变量都在函数内部读取，确保 server/src/loadEnv.ts
 * 先加载 .env 后再取值。
 */

import {
  ModelCallError,
  ModelConfigError,
} from '../errors';
import {
  ERROR_CODES,
  type CallOptions,
  type ChatMessage,
  type CustomModelPayload,
  type EnvModelInfo,
  type ModelCatalog,
  type ModelSource,
  type ModelTestResult,
  type ResolvedModel,
  type TokenUsage,
} from '../types';
import {
  BUILTIN_MODEL_DEFS,
  DEFAULT_ALLOWED_MODEL_HOSTS,
  DEFAULT_ARK_BASE_URL,
  type BuiltinModelDef,
} from '../../../shared/config/models';

// 兼容 V3.4 的导入路径（server/src/types 已迁移到共享类型）
export type {
  CallOptions,
  ChatMessage,
  CustomModelPayload,
  EnvModelInfo,
  ModelCatalog,
  ModelSource,
  ModelTestResult,
  ResolvedModel,
  TokenUsage,
} from '../types';
export { ModelCallError, ModelConfigError } from '../errors';

// ============================================================
// 常量
// ============================================================

// 内置模型清单、默认地址、白名单统一来自 shared/config/models.ts。
// 环境变量在运行时读取，确保 server/src/loadEnv.ts 先加载 .env。
const ENV_MODEL_DEFS: BuiltinModelDef[] = BUILTIN_MODEL_DEFS;

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

function getEndpoint(def: BuiltinModelDef): string {
  for (const key of def.endpointEnvVars) {
    const value = readEnv(key);
    if (value) return value;
  }
  return '';
}

function getAllowedHosts(): string[] {
  const raw = readEnv('ALLOWED_MODEL_HOSTS');
  if (!raw) return DEFAULT_ALLOWED_MODEL_HOSTS;
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

function readTokenCount(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** 从 Chat Completions 响应中提取 usage；缺失/非法时返回 undefined */
export function parseTokenUsage(payload: unknown): TokenUsage | undefined {
  const record = asRecord(payload);
  const usage = asRecord(record?.usage);
  if (!usage) return undefined;

  const promptTokens = readTokenCount(usage, 'prompt_tokens');
  const completionTokens = readTokenCount(usage, 'completion_tokens');
  if (promptTokens === undefined && completionTokens === undefined) {
    return undefined;
  }

  const totalTokens =
    readTokenCount(usage, 'total_tokens') ??
    (promptTokens ?? 0) + (completionTokens ?? 0);

  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens,
  };
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
      throw new ModelConfigError(
        `未知模型：${rawId.trim()}`,
        ERROR_CODES.MODEL_NOT_FOUND
      );
    }
    if (!envModel.info.available) {
      throw new ModelConfigError(
        `模型「${envModel.info.name}」未配置：${
          envModel.info.unavailableReason || '缺少环境变量'
        }`,
        ERROR_CODES.MODEL_UNAVAILABLE
      );
    }
    return toResolvedModel(envModel);
  }

  return resolveDefaultModel();
}

// ============================================================
// Chat Completions 调用
// ============================================================

export async function callChatCompletion(
  model: ResolvedModel,
  messages: ChatMessage[],
  options: CallOptions
): Promise<{ text: string; latencyMs: number; usage?: TokenUsage }> {
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
          { code: ERROR_CODES.TIMEOUT, latencyMs }
        );
      }
      throw new ModelCallError(
        '无法连接模型接口（请检查地址或重定向设置）',
        { code: ERROR_CODES.NETWORK, latencyMs }
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
          code: ERROR_CODES.AUTH,
          status: response.status,
          latencyMs,
        });
      }
      if (response.status === 404) {
        throw new ModelCallError('接口地址或模型 ID 不存在', {
          code: ERROR_CODES.NOT_FOUND,
          status: response.status,
          latencyMs,
        });
      }
      if (response.status === 429) {
        throw new ModelCallError('请求过于频繁或额度不足', {
          code: ERROR_CODES.RATE_LIMIT,
          status: response.status,
          latencyMs,
        });
      }
      if (response.status >= 500) {
        throw new ModelCallError('模型服务暂时不可用', {
          code: ERROR_CODES.UPSTREAM_5XX,
          status: response.status,
          latencyMs,
        });
      }
      throw new ModelCallError(
        `模型接口返回错误（HTTP ${response.status}）${
          detail ? `：${detail}` : ''
        }`,
        {
          code: ERROR_CODES.UPSTREAM_ERROR,
          status: response.status,
          latencyMs,
        }
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ModelCallError('模型返回内容不是合法 JSON', {
        code: ERROR_CODES.BAD_RESPONSE,
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
        code: ERROR_CODES.EMPTY_RESPONSE,
        status: response.status,
        latencyMs,
      });
    }

    return {
      text: content,
      latencyMs,
      usage: parseTokenUsage(data),
    };
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
      code: ERROR_CODES.MISSING_MODEL,
    };
  }

  let resolved: ResolvedModel | null;
  try {
    resolved = resolveRequestModel(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '模型配置不合法';
    const code =
      error instanceof ModelConfigError
        ? error.code
        : ERROR_CODES.MODEL_CONFIG_INVALID;
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
      code: ERROR_CODES.NO_MODEL,
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
      code: ERROR_CODES.UNKNOWN,
    };
  }
}
