// 后端类型定义

import type { ModelSource } from '../services/model';

export type GenerateRequest = {
  templateId?: string;
  userPrompt: string;
  ageRange?: [number, number];
  remixFrom?: string;
  remixInstruction?: string;
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
  };
  message?: string;
};
