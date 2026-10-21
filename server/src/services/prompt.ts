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
 * Remix 的专用 System Prompt 与 User Prompt 在 services/remix.ts，
 * 由 services/generate.ts 负责拼接。
 */

import type { GenerateRequest } from '../types';

/** 普通生成的输出上限（V3.2 起的契约值） */
export const GENERATION_MAX_TOKENS = 8192;

/** 生成温度（V3.2 起的契约值） */
export const GENERATION_TEMPERATURE = 0.7;

// ============================================================
// System Prompt — 告诉 AI 如何生成儿童游戏
// ============================================================
export const SYSTEM_PROMPT = `你是一个儿童游戏生成专家。你必须生成一个完整、可玩的 HTML5 游戏。

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
// 模板提示前缀
// ============================================================
export const TEMPLATE_HINTS: Record<string, string> = {
  animal: '这是一个关于动物的游戏',
  vehicle: '这是一个关于交通工具/汽车的游戏',
  princess: '这是一个关于公主/魔法的游戏',
  dinosaur: '这是一个关于恐龙的游戏',
  space: '这是一个关于太空的游戏',
};

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
