// 核心类型定义

export type GameTemplate = {
  id: string;
  name: string;
  icon: string;
  promptHint: string;
  category: "animal" | "vehicle" | "fantasy" | "nature" | "other";
};

export type GameWork = {
  id: string;
  title: string;
  templateId: string;
  userPrompt: string;
  gameHtml: string;
  thumbnailUrl?: string;
  createdAt: number;
  playCount: number;
};

export type ParentSettings = {
  dailyTimeLimit: number;
  sessionTimeLimit: number;
  allowVoiceInput: boolean;
  contentFilterLevel: "strict" | "moderate";
};

export type AppState = {
  works: GameWork[];
  settings: ParentSettings;
  currentPage: string;
  isGenerating: boolean;
  generationProgress: string;
};
