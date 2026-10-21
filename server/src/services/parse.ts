/**
 * ============================================================
 * 模型输出解析（V3.5）
 * ============================================================
 *
 * 支持的输出格式（与 V3.1–V3.4 一致）：
 * 1. 纯 JSON: {"title":"xxx","html":"..."}
 * 2. Markdown 代码块: ```json { ... } ```
 * 3. 普通代码块: ``` { ... } ```
 * 4. JSON 被截断时，用正则提取 title 和 html
 * 5. 纯 HTML（没有 JSON 包裹）
 *
 * V3.5 统一为：解析失败抛 GameParseError，由编排层决定降级；
 * 不再在 server/ 返回内置默认游戏、在 api/ 返回 500。
 */

import { GameParseError } from '../errors';

export interface ParsedGame {
  title: string;
  html: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractTitleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 60) : '';
}

/**
 * 把任意 JSON 值规范化为 { title, html }。
 * html 为空时返回 null，让调用方继续尝试其他策略。
 */
function normalizeGame(value: unknown): ParsedGame | null {
  const record = asRecord(value);
  if (!record) return null;

  const html = typeof record.html === 'string' ? record.html : '';
  if (!html.trim()) return null;

  const rawTitle = typeof record.title === 'string' ? record.title.trim() : '';
  const title =
    rawTitle || extractTitleFromHtml(html) || 'AI 生成的游戏';

  return { title, html };
}

/** 解析 JSON 字符串；失败返回 null */
function tryParseJson(text: string): ParsedGame | null {
  try {
    return normalizeGame(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * 解析 AI 输出的文本，提取 JSON 游戏数据。
 *
 * @throws {GameParseError} 所有解析方式都失败时
 */
export function parseGameOutput(text: string): ParsedGame {
  if (typeof text !== 'string' || !text.trim()) {
    throw new GameParseError('模型未返回内容', 'empty');
  }

  // 策略 1：直接解析 JSON
  const direct = tryParseJson(text);
  if (direct) return direct;

  // 策略 2：提取 ```json ... ```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    const parsed = tryParseJson(jsonMatch[1]);
    if (parsed) return parsed;
  }

  // 策略 3：提取 ``` ... ```
  const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    const parsed = tryParseJson(codeMatch[1]);
    if (parsed) return parsed;
  }

  // 策略 4：JSON 被截断时，尝试用正则提取 title 和 html
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  const htmlMatch = text.match(
    /"html"\s*:\s*"([\s\S]*?)(?:"\s*\}|"\s*$|$)/
  );
  if (titleMatch && htmlMatch) {
    const html = htmlMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
    if (html.trim()) {
      return { title: titleMatch[1], html };
    }
  }

  // 策略 5：如果返回的是纯 HTML（没有 JSON 包裹），直接当 html 用
  const doctypeMatch = text.match(/<!DOCTYPE html>[\s\S]*/i);
  if (doctypeMatch) {
    const html = doctypeMatch[0];
    return {
      title: extractTitleFromHtml(html) || 'AI 生成的游戏',
      html,
    };
  }

  throw new GameParseError('无法解析 AI 输出', 'no-strategy-matched');
}
