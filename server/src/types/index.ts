/**
 * ============================================================
 * 共享契约类型（V3.5 单一事实来源）
 * ============================================================
 *
 * 本文件同时被以下位置使用：
 * - server/src/**（本地 Hono 服务）
 * - api-src/**（Vercel 入口源码，构建时打包到 api/*.ts）
 *
 * 约束：
 * 1. 本文件不 import 任何 service，避免循环依赖。
 * 2. 错误码、请求/响应、模型、Remix、指标类型只在这里定义。
 * 3. 新增字段时同步更新 docs/design-v3.5.md 与契约测试。
 */

// ============================================================
// 错误码
// ============================================================

export const ERROR_CODES = {
  /** 请求体不是合法 JSON */
  INVALID_JSON: 'INVALID_JSON',
  /** JSON 合法但不是对象 */
  INVALID_BODY: 'INVALID_BODY',
  /** userPrompt 缺失/空白 */
  EMPTY_PROMPT: 'EMPTY_PROMPT',
  /** 未捕获的服务端错误 */
  GENERATION_FAILED: 'GENERATION_FAILED',

  /** 自定义模型配置不合法 */
  MODEL_CONFIG_INVALID: 'MODEL_CONFIG_INVALID',
  /** 未知内置模型 */
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  /** 内置模型缺少环境变量 */
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  /** 模型测试未提供模型参数 */
  MISSING_MODEL: 'MISSING_MODEL',
  /** 没有任何可用模型 */
  NO_MODEL: 'NO_MODEL',

  /** 模型调用失败（通用） */
  MODEL_CALL_FAILED: 'MODEL_CALL_FAILED',
  /** 调用超时 */
  TIMEOUT: 'TIMEOUT',
  /** 无法连接上游 */
  NETWORK: 'NETWORK',
  /** 鉴权失败 */
  AUTH: 'AUTH',
  /** 地址/模型不存在 */
  NOT_FOUND: 'NOT_FOUND',
  /** 限流/额度不足 */
  RATE_LIMIT: 'RATE_LIMIT',
  /** 上游 5xx */
  UPSTREAM_5XX: 'UPSTREAM_5XX',
  /** 上游其他错误 */
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  /** 上游返回非 JSON */
  BAD_RESPONSE: 'BAD_RESPONSE',
  /** 上游返回空内容 */
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  /** 模型输出无法解析为游戏 */
  OUTPUT_PARSE_FAILED: 'OUTPUT_PARSE_FAILED',

  /** 未知错误 */
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================================
// 模型
// ============================================================

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

export interface CallOptions {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

/** OpenAI 兼容接口返回的 token 用量 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelTestResult {
  ok: boolean;
  latencyMs: number;
  modelName: string;
  source: ModelSource | 'none';
  reply?: string;
  message?: string;
  code?: ErrorCode;
  status?: number;
}

// ============================================================
// Remix
// ============================================================

export type RemixSourceMode = 'full' | 'outline' | 'preview' | 'none';

/** 响应/作品中的 Remix 模式（fallback 表示已保留原游戏） */
export type RemixMode = RemixSourceMode | 'fallback';

export interface GameProfile {
  title: string;
  templateId: string;
  templateName: string;
  render: 'canvas' | 'dom' | 'unknown';
  interactions: string[];
  mechanics: string[];
  hasScore: boolean;
  hasWinLose: boolean;
  hasTimer: boolean;
  hasMobileViewport: boolean;
  hasSoundCue: boolean;
  lineCount: number;
  charCount: number;
}

export interface RemixPromptInput {
  templateId?: string;
  originalTitle?: string;
  originalUserPrompt?: string;
  originalGameHtml?: string;
  originalGameHtmlPreview?: string;
  remixInstruction: string;
}

export interface RemixPromptResult {
  systemPrompt: string;
  userPrompt: string;
  profile: GameProfile;
  sourceMode: RemixSourceMode;
  sourceChars: number;
  includedChars: number;
  maxTokens: number;
}

export interface RemixAudit {
  sourceMode: Exclude<RemixSourceMode, 'none'>;
  titlePreserved: boolean;
  renderPreserved: boolean;
  interactionsPreserved: boolean;
  scorePreserved: boolean;
  winLosePreserved: boolean;
  preserved: boolean;
  changed: boolean;
}

export interface RemixFallbackResult {
  title: string;
  html: string;
}

// ============================================================
// 生成请求 / 响应
// ============================================================

export interface GenerateRequest {
  templateId?: string;
  userPrompt: string;
  ageRange?: [number, number];
  remixFrom?: string;
  remixInstruction?: string;
  /** V3.3：原游戏完整 HTML（新客户端） */
  originalGameHtml?: string;
  /** V3.3：原游戏 HTML 片段（V2 旧客户端兼容） */
  originalGameHtmlPreview?: string;
  /** V3.3：原标题 */
  originalTitle?: string;
  /** V3.3：原创作描述 */
  originalUserPrompt?: string;
  /** V3.2：内置模型 ID */
  modelId?: string;
  /** V3.2：兼容旧字段，等同 modelId */
  model?: string;
  /** V3.2：自定义模型配置 */
  modelConfig?: unknown;
}

export interface GenerateData {
  title: string;
  gameHtml: string;
  engine?: 'volcengine' | 'mock';
  model?: string;
  modelName?: string;
  modelSource?: ModelSource;
  warning?: string;
  /** V3.3：本次 Remix 使用的源码模式 */
  remixMode?: RemixMode;
  /** V3.3：原游戏档案 */
  remixProfile?: GameProfile;
  /** V3.3：改编结果结构审计 */
  remixAudit?: RemixAudit;
  /** V3.3：模型不可用，已保留原游戏 */
  remixFallback?: boolean;
}

export interface GenerateSuccessResponse {
  success: true;
  data: GenerateData;
}

export interface GenerateErrorResponse {
  success: false;
  code: ErrorCode;
  message: string;
}

export type GenerateResponse = GenerateSuccessResponse | GenerateErrorResponse;

// ============================================================
// 指标
// ============================================================

export interface GenerationMetricEvent {
  event: 'generate';
  /** 是否由真实模型成功生成（非降级） */
  ok: boolean;
  mode: 'create' | 'remix';
  status: number;
  engine: 'volcengine' | 'mock';
  modelId: string;
  modelSource: ModelSource | 'none';
  totalMs: number;
  upstreamMs?: number;
  promptChars: number;
  includedChars?: number;
  sourceMode?: RemixSourceMode;
  usage?: TokenUsage;
  estimatedPromptTokens?: number;
  estimatedCompletionTokens?: number;
  errorCode?: ErrorCode;
  timestamp: string;
}
