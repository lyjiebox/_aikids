/**
 * ============================================================
 * 生成指标（V3.5）
 * ============================================================
 *
 * 目标：用一行结构化日志回答「多快、成功率、用了多少 token」。
 *
 * 约束：
 * - 不记录 Prompt 全文、游戏源码、API Key、接口地址；
 * - 指标只用于本地/平台日志与基线脚本，不进入 API 响应；
 * - 日志格式固定为 `[metrics] {json}`，便于 grep / 解析。
 */

import type { GenerationMetricEvent, TokenUsage } from '../types';

/** 1 token ≈ 1.5 字符（中英混排的保守近似，仅在上游无 usage 时使用） */
export const CHARS_PER_TOKEN = 1.5;

/**
 * nearest-rank 分位数：
 * - 空数组返回 0
 * - p=50, [1,2,3,4] → 2
 * - p=90, [1,2,3,4] → 4
 */
export function percentile(values: number[], p: number): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(Math.max(p, 0), 100);
  const rank = Math.ceil((clamped / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

/** 按字符数估算 token（仅用于上游未返回 usage 的场景） */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** 估算文本 token 数（仅用于上游未返回 usage 的场景） */
export function estimateTokens(text: string): number {
  if (typeof text !== 'string' || !text) return 0;
  return estimateTokensFromChars(text.length);
}

export interface CostPrices {
  /** 每 1K 输入 token 的价格（CNY） */
  inputPer1k?: number | null;
  /** 每 1K 输出 token 的价格（CNY） */
  outputPer1k?: number | null;
}

/**
 * 按可配置单价估算成本。
 * 两个单价都未配置时返回 null（不伪造价格）。
 */
export function estimateCost(
  usage: TokenUsage,
  prices: CostPrices
): number | null {
  const input = prices.inputPer1k;
  const output = prices.outputPer1k;
  const hasInput = typeof input === 'number' && Number.isFinite(input);
  const hasOutput = typeof output === 'number' && Number.isFinite(output);
  if (!hasInput && !hasOutput) return null;

  const inputPrice = hasInput ? (input as number) : 0;
  const outputPrice = hasOutput ? (output as number) : 0;
  const cost =
    (usage.promptTokens / 1000) * inputPrice +
    (usage.completionTokens / 1000) * outputPrice;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** 指标是否启用（默认启用；METRICS_ENABLED=0/false 关闭） */
export function metricsEnabled(): boolean {
  const value = (process.env.METRICS_ENABLED || '').trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'no');
}

/** 输出一行结构化指标；关闭时静默 */
export function emitGenerationMetric(event: GenerationMetricEvent): void {
  if (!metricsEnabled()) return;
  console.log(`[metrics] ${JSON.stringify(event)}`);
}

/** 从指标事件中安全读取 token（优先真实 usage） */
export function resolveMetricTokens(event: GenerationMetricEvent): {
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
} {
  if (event.usage) {
    return {
      promptTokens: event.usage.promptTokens,
      completionTokens: event.usage.completionTokens,
      estimated: false,
    };
  }
  return {
    promptTokens: event.estimatedPromptTokens ?? 0,
    completionTokens: event.estimatedCompletionTokens ?? 0,
    estimated: true,
  };
}
