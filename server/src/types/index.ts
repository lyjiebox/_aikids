// 后端类型定义

export type GenerateRequest = {
  templateId?: string;
  userPrompt: string;
  ageRange?: [number, number];
};

export type GenerateResponse = {
  success: boolean;
  data?: {
    gameHtml: string;
    title: string;
  };
  message?: string;
};
