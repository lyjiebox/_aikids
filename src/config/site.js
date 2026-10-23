/**
 * ============================================================
 * site.js — 全局配置
 * ============================================================
 * 
 * 集中管理站点级可配置项：
 * - SITE_CONFIG: 应用名称、API 地址
 * - DEFAULT_SETTINGS: 家长设置的默认值
 * - TEMPLATES: 游戏模板列表（V3.6 起由 shared/config/templates.ts 提供）
 *
 * 模板、Prompt、模型清单的外部配置统一放在 shared/config/，
 * 修改后需要重新构建（npm run build / build:api / build:server）。
 */

import { GAME_TEMPLATES } from '../../shared/config/templates';

/** 站点基础配置 */
export const SITE_CONFIG = {
  appName: "AI 魔法游戏",
  apiBaseUrl: "/api",
};

/** 家长设置默认值 */
export const DEFAULT_SETTINGS = {
  dailyTimeLimit: 30,           // 每日使用时长（分钟）
  sessionTimeLimit: 20,         // 单次使用时长（分钟）
  allowVoiceInput: true,        // 是否允许语音输入
  contentFilterLevel: "strict", // 内容过滤级别：strict（严格）/ moderate（适中）
};

/**
 * 游戏模板列表（对外保持 V3.1 起的字段与导入路径）
 *
 * 数据源：shared/config/templates.ts
 * 每个模板包含 id / name / icon / promptHint / category，
 * 服务端另用其中的 aiHint 作为 Prompt 前缀。
 */
export const TEMPLATES = GAME_TEMPLATES;
