/**
 * ============================================================
 * AI 游戏生成服务（V3.5 兼容层）
 * ============================================================
 *
 * V3.5 起生成逻辑拆到：
 * - services/prompt.ts  System Prompt / 模板提示
 * - services/parse.ts   输出解析
 * - services/mock.ts    本地兜底
 * - services/generate.ts 编排与降级
 *
 * 本文件只保留 V3.4 的导入路径，方便手工脚本与旧代码继续使用。
 */

export {
  generateGameWithAI,
  executeGeneration,
  prepareGeneration,
  handleGenerateRequest,
  parseGenerateRequest,
  invalidJsonOutcome,
  type GameGenerationResult,
  type PreparedGeneration,
  type GenerateOutcome,
  type RequestValidation,
} from './generate';

export type { GenerateRequest as GameGenerationRequest } from '../types';
