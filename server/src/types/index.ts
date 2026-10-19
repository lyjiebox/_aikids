// 后端类型定义

import type { ModelSource } from '../services/model';
import type {
  GameProfile,
  RemixAudit,
  RemixMode,
} from '../services/remix';

export type GenerateRequest = {
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
};

export type GenerateResponse = {
  success: boolean;
  data?: {
    gameHtml: string;
    title: string;
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
    remixAudit?: RemixAudit | null;
    /** V3.3：模型不可用，已保留原游戏 */
    remixFallback?: boolean;
  };
  message?: string;
};
