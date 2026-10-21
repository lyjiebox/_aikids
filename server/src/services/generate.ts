/**
 * ============================================================
 * 生成编排（V3.5）
 * ============================================================
 *
 * 这是唯一决定「怎么生成、失败怎么降级」的地方：
 *   校验 → Remix 准备 → 模型解析 → 调用 → 解析 → 审计 → 降级 → 指标
 *
 * 路由层只负责读 JSON 与返回；api/ 由本文件打包生成。
 */

import {
  GameParseError,
  ModelCallError,
  ModelConfigError,
} from '../errors';
import {
  ERROR_CODES,
  type ErrorCode,
  type GenerateRequest,
  type GenerateResponse,
  type GenerationMetricEvent,
  type RemixAudit,
  type RemixFallbackResult,
  type RemixPromptResult,
  type RemixSourceMode,
  type ResolvedModel,
  type TokenUsage,
} from '../types';
import {
  buildRemixFallback,
  buildRemixPrompt,
  auditRemixOutput,
} from './remix';
import {
  callChatCompletion,
  getGenerationTimeoutMs,
  resolveRequestModel,
} from './model';
import {
  GENERATION_MAX_TOKENS,
  GENERATION_TEMPERATURE,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from './prompt';
import { parseGameOutput } from './parse';
import { createMockGame } from './mock';
import {
  emitGenerationMetric,
  estimateTokens,
  estimateTokensFromChars,
} from './metrics';

// ============================================================
// 请求校验
// ============================================================

export type RequestValidation =
  | { ok: true; value: GenerateRequest }
  | { ok: false; code: ErrorCode; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

/** 类型不符的可选字段按「未提供」处理，保持旧客户端兼容 */
export function parseGenerateRequest(input: unknown): RequestValidation {
  const record = asRecord(input);
  if (!record) {
    return {
      ok: false,
      code: ERROR_CODES.INVALID_BODY,
      message: '请求参数格式错误',
    };
  }

  const userPrompt = record.userPrompt;
  if (
    typeof userPrompt !== 'string' ||
    !userPrompt.trim()
  ) {
    return {
      ok: false,
      code: ERROR_CODES.EMPTY_PROMPT,
      message: '请先说出你的游戏创意！',
    };
  }

  const value: GenerateRequest = { userPrompt };

  for (const key of [
    'templateId',
    'remixFrom',
    'remixInstruction',
    'originalGameHtml',
    'originalGameHtmlPreview',
    'originalTitle',
    'originalUserPrompt',
    'modelId',
    'model',
  ] as const) {
    const field = readString(record, key);
    if (field !== undefined) value[key] = field;
  }

  const ageRange = record.ageRange;
  if (
    Array.isArray(ageRange) &&
    ageRange.length === 2 &&
    typeof ageRange[0] === 'number' &&
    typeof ageRange[1] === 'number'
  ) {
    value.ageRange = [ageRange[0], ageRange[1]];
  }

  if (record.modelConfig !== undefined) {
    value.modelConfig = record.modelConfig;
  }

  return { ok: true, value };
}

// ============================================================
// Prompt 准备（普通 / Remix）
// ============================================================

export interface PreparedGeneration {
  isRemix: boolean;
  remix: RemixPromptResult | null;
  remixFallback: RemixFallbackResult | null;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}

/**
 * Remix 判定：remixFrom + 非空 remixInstruction 同时存在。
 * 这是 V3.2 起前端就满足的条件；统一后不再出现「只有 remixFrom 就保留原游戏」的旧 server 行为。
 */
export function prepareGeneration(req: GenerateRequest): PreparedGeneration {
  const isRemix = Boolean(
    req.remixFrom && req.remixInstruction && req.remixInstruction.trim()
  );

  const remix = isRemix
    ? buildRemixPrompt({
        templateId: req.templateId,
        originalTitle: req.originalTitle,
        originalUserPrompt: req.originalUserPrompt,
        originalGameHtml: req.originalGameHtml,
        originalGameHtmlPreview: req.originalGameHtmlPreview,
        remixInstruction: req.remixInstruction as string,
      })
    : null;

  const remixFallback = isRemix
    ? buildRemixFallback({
        originalGameHtml: req.originalGameHtml,
        originalTitle: req.originalTitle,
      })
    : null;

  return {
    isRemix,
    remix,
    remixFallback,
    systemPrompt: remix
      ? `${SYSTEM_PROMPT}\n\n${remix.systemPrompt}`
      : SYSTEM_PROMPT,
    userPrompt: remix
      ? remix.userPrompt
      : buildUserPrompt({
          templateId: req.templateId,
          userPrompt: req.userPrompt,
        }),
    maxTokens: remix ? remix.maxTokens : GENERATION_MAX_TOKENS,
  };
}

// ============================================================
// 执行生成
// ============================================================

export interface GameGenerationResult {
  title: string;
  html: string;
  modelId: string;
  modelName: string;
  modelSource: ResolvedModel['source'];
  engine: 'volcengine';
  remixMode?: RemixSourceMode;
  remixProfile?: RemixPromptResult['profile'];
  remixAudit?: RemixAudit;
  usage?: TokenUsage;
  upstreamMs?: number;
  /** 模型原始输出字符数（仅用于指标估算，不返回给客户端） */
  rawOutputChars?: number;
}

/**
 * 调用模型并解析结果。
 * 失败时抛 ModelCallError / GameParseError，由 handleGenerateRequest 统一降级。
 */
export async function executeGeneration(
  req: GenerateRequest,
  model: ResolvedModel,
  prepared: PreparedGeneration
): Promise<GameGenerationResult> {
  console.log(
    `[generate] 使用模型: ${model.name} (${model.source}), host=${safeHost(model.baseUrl)}`
  );
  if (prepared.remix) {
    console.log('[generate] Remix 模式:', {
      sourceMode: prepared.remix.sourceMode,
      sourceChars: prepared.remix.profile.charCount,
      includedChars: prepared.remix.includedChars,
      maxTokens: prepared.remix.maxTokens,
      title: prepared.remix.profile.title,
    });
  }

  const { text, latencyMs, usage } = await callChatCompletion(
    model,
    [
      { role: 'system', content: prepared.systemPrompt },
      { role: 'user', content: prepared.userPrompt },
    ],
    {
      maxTokens: prepared.maxTokens,
      temperature: GENERATION_TEMPERATURE,
      timeoutMs: getGenerationTimeoutMs(),
    }
  );

  const game = parseGameOutput(text);

  const remixAudit = prepared.remix
    ? auditRemixOutput(
        prepared.remix.profile,
        req.originalGameHtml || req.originalGameHtmlPreview || '',
        game.html,
        game.title,
        prepared.remix.sourceMode === 'none'
          ? undefined
          : prepared.remix.sourceMode
      )
    : undefined;

  return {
    ...game,
    modelId: model.id,
    modelName: model.name,
    modelSource: model.source,
    engine: 'volcengine',
    ...(prepared.remix
      ? {
          remixMode: prepared.remix.sourceMode,
          remixProfile: prepared.remix.profile,
        }
      : {}),
    ...(remixAudit ? { remixAudit } : {}),
    ...(usage ? { usage } : {}),
    upstreamMs: latencyMs,
    rawOutputChars: text.length,
  };
}

/** 兼容 V3.4 的手工冒烟脚本：准备 + 执行 */
export async function generateGameWithAI(
  req: GenerateRequest,
  model: ResolvedModel
): Promise<GameGenerationResult> {
  return executeGeneration(req, model, prepareGeneration(req));
}

// ============================================================
// HTTP 结果与指标
// ============================================================

export type GenerateStatus = 200 | 400 | 500;

export interface GenerateOutcome {
  status: GenerateStatus;
  body: GenerateResponse;
  metric: GenerationMetricEvent;
}

interface MetricDefaults {
  mode: 'create' | 'remix';
  promptChars: number;
  includedChars?: number;
  sourceMode?: RemixSourceMode;
}

function buildMetric(
  defaults: MetricDefaults,
  overrides: Partial<GenerationMetricEvent> & {
    ok: boolean;
    status: number;
    totalMs: number;
  }
): GenerationMetricEvent {
  return {
    event: 'generate',
    mode: defaults.mode,
    promptChars: defaults.promptChars,
    ...(defaults.includedChars !== undefined
      ? { includedChars: defaults.includedChars }
      : {}),
    ...(defaults.sourceMode ? { sourceMode: defaults.sourceMode } : {}),
    engine: 'mock',
    modelId: 'mock',
    modelSource: 'none',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function finish(
  outcome: Omit<GenerateOutcome, 'metric'>,
  metric: GenerationMetricEvent
): GenerateOutcome {
  emitGenerationMetric(metric);
  return { ...outcome, metric };
}

/** 非法 JSON 的统一结果（路由层解析失败时调用） */
export function invalidJsonOutcome(): GenerateOutcome {
  const metric = buildMetric(
    { mode: 'create', promptChars: 0 },
    {
      ok: false,
      status: 400,
      totalMs: 0,
      errorCode: ERROR_CODES.INVALID_JSON,
    }
  );
  return finish(
    {
      status: 400,
      body: {
        success: false,
        code: ERROR_CODES.INVALID_JSON,
        message: '请求参数格式错误',
      },
    },
    metric
  );
}

function errorOutcome(
  status: 400,
  code: ErrorCode,
  message: string,
  defaults: MetricDefaults,
  startedAt: number,
  extra: Partial<GenerationMetricEvent> = {}
): GenerateOutcome {
  const metric = buildMetric(defaults, {
    ok: false,
    status,
    totalMs: Date.now() - startedAt,
    errorCode: code,
    ...extra,
  });
  return finish(
    { status, body: { success: false, code, message } },
    metric
  );
}

/**
 * 生成请求的唯一入口。
 * 返回状态码 + 响应体 + 指标；不抛异常（未捕获错误统一 500）。
 */
export async function handleGenerateRequest(
  rawBody: unknown
): Promise<GenerateOutcome> {
  const startedAt = Date.now();
  let defaults: MetricDefaults = { mode: 'create', promptChars: 0 };

  try {
    const validation = parseGenerateRequest(rawBody);
    if (!validation.ok) {
      return errorOutcome(
        400,
        validation.code,
        validation.message,
        defaults,
        startedAt
      );
    }

    const req = validation.value;
    const prepared = prepareGeneration(req);
    defaults = {
      mode: prepared.isRemix ? 'remix' : 'create',
      promptChars: prepared.userPrompt.length,
      ...(prepared.remix
        ? {
            includedChars: prepared.remix.includedChars,
            sourceMode: prepared.remix.sourceMode,
          }
        : {}),
    };

    let resolved: ResolvedModel | null;
    try {
      resolved = resolveRequestModel({
        modelId: req.modelId,
        model: req.model,
        modelConfig: req.modelConfig,
      });
    } catch (error) {
      if (error instanceof ModelConfigError) {
        return errorOutcome(
          400,
          error.code,
          error.message,
          defaults,
          startedAt
        );
      }
      throw error;
    }

    // 没有任何可用模型 → Remix 保留原游戏，普通生成降级本地模板
    if (!resolved) {
      console.log('[generate] 未配置可用模型，使用 Remix 保留/本地模板兜底');

      if (prepared.remixFallback) {
        return finish(
          {
            status: 200,
            body: {
              success: true,
              data: {
                title: prepared.remixFallback.title,
                gameHtml: prepared.remixFallback.html,
                engine: 'mock',
                model: 'mock',
                modelName: '原游戏',
                warning: '未配置可用模型，已保留原游戏，未应用本次改编',
                remixMode: 'fallback',
                remixFallback: true,
              },
            },
          },
          buildMetric(defaults, {
            ok: false,
            status: 200,
            totalMs: Date.now() - startedAt,
            errorCode: ERROR_CODES.NO_MODEL,
          })
        );
      }

      const game = createMockGame(req.templateId);
      return finish(
        {
          status: 200,
          body: {
            success: true,
            data: {
              title: game.title,
              gameHtml: game.html,
              engine: 'mock',
              model: 'mock',
              modelName: '本地模板',
            },
          },
        },
        buildMetric(defaults, {
          ok: false,
          status: 200,
          totalMs: Date.now() - startedAt,
          errorCode: ERROR_CODES.NO_MODEL,
        })
      );
    }

    try {
      const result = await executeGeneration(req, resolved, prepared);
      const data: GenerateResponse = {
        success: true,
        data: {
          title: result.title,
          gameHtml: result.html,
          engine: 'volcengine',
          model: result.modelId,
          modelName: result.modelName,
          modelSource: result.modelSource,
          ...(prepared.remix
            ? {
                remixMode: result.remixMode,
                remixProfile: result.remixProfile,
                remixAudit: result.remixAudit,
              }
            : {}),
        },
      };

      const usage = result.usage;
      return finish(
        { status: 200, body: data },
        buildMetric(defaults, {
          ok: true,
          status: 200,
          engine: 'volcengine',
          modelId: result.modelId,
          modelSource: result.modelSource,
          totalMs: Date.now() - startedAt,
          ...(result.upstreamMs !== undefined
            ? { upstreamMs: result.upstreamMs }
            : {}),
          ...(usage
            ? { usage }
            : {
                estimatedPromptTokens: estimateTokens(
                  prepared.systemPrompt + prepared.userPrompt
                ),
                estimatedCompletionTokens: estimateTokensFromChars(
                  result.rawOutputChars ?? result.html.length
                ),
              }),
        })
      );
    } catch (error) {
      const warning =
        error instanceof ModelCallError || error instanceof GameParseError
          ? error.message
          : '模型调用失败';
      const errorCode =
        error instanceof ModelCallError || error instanceof GameParseError
          ? error.code
          : ERROR_CODES.UNKNOWN;

      console.warn('[generate] ⚠️ 生成失败，尝试降级:', warning);

      if (prepared.remixFallback) {
        return finish(
          {
            status: 200,
            body: {
              success: true,
              data: {
                title: prepared.remixFallback.title,
                gameHtml: prepared.remixFallback.html,
                engine: 'mock',
                model: 'mock',
                modelName: '原游戏',
                warning: `${warning}，已保留原游戏，未应用本次改编`,
                remixMode: 'fallback',
                remixFallback: true,
              },
            },
          },
          buildMetric(defaults, {
            ok: false,
            status: 200,
            totalMs: Date.now() - startedAt,
            errorCode,
          })
        );
      }

      const game = createMockGame(req.templateId);
      return finish(
        {
          status: 200,
          body: {
            success: true,
            data: {
              title: game.title,
              gameHtml: game.html,
              engine: 'mock',
              model: 'mock',
              modelName: '本地模板',
              warning: `${warning}，已降级为本地模板`,
            },
          },
        },
        buildMetric(defaults, {
          ok: false,
          status: 200,
          totalMs: Date.now() - startedAt,
          errorCode,
        })
      );
    }
  } catch (error) {
    console.error('[generate] 未捕获错误:', error);
    const metric = buildMetric(defaults, {
      ok: false,
      status: 500,
      totalMs: Date.now() - startedAt,
      errorCode: ERROR_CODES.GENERATION_FAILED,
    });
    return finish(
      {
        status: 500,
        body: {
          success: false,
          code: ERROR_CODES.GENERATION_FAILED,
          message: '魔法好像失灵了，再试一次吧！',
        },
      },
      metric
    );
  }
}

/** 只打印主机名，避免日志出现完整地址或密钥 */
function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-url';
  }
}
