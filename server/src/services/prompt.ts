/**
 * ============================================================
 * Prompt 层（V3.5）
 * ============================================================
 *
 * 职责：
 * 1. 普通创作的 System Prompt（V3.1 规则，保持稳定）
 * 2. 模板提示前缀
 * 3. 普通生成的输出上限 / 温度常量
 *
 * V3.6：Prompt 文本、输出参数与模板提示统一放在
 * shared/config/{prompts,templates}.ts；本文件只负责组装，
 * 并保留原有导出名，避免调用方与测试断裂。
 *
 * Remix 的专用 System Prompt 与 User Prompt 在 services/remix.ts，
 * 由 services/generate.ts 负责拼接。
 */

import type { GenerateRequest } from '../types';
import {
  GENERATION_MAX_TOKENS,
  GENERATION_TEMPERATURE,
  SYSTEM_PROMPT,
} from '../../../shared/config/prompts';
import { TEMPLATE_PROMPT_HINTS } from '../../../shared/config/templates';

export { GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE, SYSTEM_PROMPT };

/** 模板提示前缀（来自 shared/config/templates.ts） */
export const TEMPLATE_HINTS: Record<string, string> = TEMPLATE_PROMPT_HINTS;

/**
 * 普通创作：模板提示前缀 + 用户描述。
 * 保持 V3.1/V3.2 的字符串拼接行为（含中文句号）。
 */
export function buildUserPrompt(input: {
  templateId?: string;
  userPrompt: string;
}): string {
  const hint = input.templateId ? TEMPLATE_HINTS[input.templateId] : undefined;
  return hint ? `${hint}。${input.userPrompt}` : input.userPrompt;
}

/** 普通创作的完整 Prompt */
export function buildGenerationPrompt(req: GenerateRequest): {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt({
      templateId: req.templateId,
      userPrompt: req.userPrompt,
    }),
    maxTokens: GENERATION_MAX_TOKENS,
  };
}
