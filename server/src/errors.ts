/**
 * ============================================================
 * 错误类型（V3.5 统一）
 * ============================================================
 *
 * 三类错误分别对应不同处理方式：
 * - ModelConfigError：请求参数问题 → 400，code 直接返回给客户端
 * - ModelCallError：上游/网络/超时 → 可降级 Mock 或保留原游戏
 * - GameParseError：模型输出无法解析 → 与调用失败同样降级
 */

import { ERROR_CODES, type ErrorCode } from './types';

/** 请求中的模型配置不合法（参数问题，应返回 400） */
export class ModelConfigError extends Error {
  readonly code: ErrorCode;

  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.MODEL_CONFIG_INVALID
  ) {
    super(message);
    this.name = 'ModelConfigError';
    this.code = code;
  }
}

/** 调用模型失败（上游/网络/超时，可降级 Mock） */
export class ModelCallError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly latencyMs: number;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      status?: number;
      latencyMs?: number;
    } = {}
  ) {
    super(message);
    this.name = 'ModelCallError';
    this.code = options.code || ERROR_CODES.MODEL_CALL_FAILED;
    this.status = options.status;
    this.latencyMs = options.latencyMs ?? 0;
  }
}

/** 模型输出无法解析为游戏（可降级 Mock 或保留原游戏） */
export class GameParseError extends Error {
  readonly code: ErrorCode = ERROR_CODES.OUTPUT_PARSE_FAILED;
  readonly detail?: string;

  constructor(message = '无法解析 AI 输出', detail?: string) {
    super(message);
    this.name = 'GameParseError';
    this.detail = detail;
  }
}
