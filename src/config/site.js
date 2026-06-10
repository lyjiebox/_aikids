/**
 * ============================================================
 * site.js — 全局配置
 * ============================================================
 * 
 * 集中管理所有可配置项，方便统一修改：
 * - SITE_CONFIG: 应用名称、API 地址
 * - DEFAULT_SETTINGS: 家长设置的默认值
 * - TEMPLATES: 游戏模板列表（首页展示 + 创作页选择）
 */

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
 * 游戏模板列表
 * 
 * 每个模板包含：
 * - id: 唯一标识，用于 API 请求和路由参数
 * - name: 显示名称（中文）
 * - icon: emoji 图标
 * - promptHint: 传给 AI 的提示前缀（增强生成效果）
 * - category: 分类（animal/vehicle/fantasy/other）
 */
export const TEMPLATES = [
  {
    id: "free",
    name: "自由创作",
    icon: "✨",
    promptHint: "根据孩子的自由想象生成游戏",
    category: "other",
  },
  {
    id: "animal",
    name: "动物乐园",
    icon: "🐰",
    promptHint: "生成以动物为主题的游戏，如打地鼠、喂兔子等",
    category: "animal",
  },
  {
    id: "vehicle",
    name: "汽车王国",
    icon: "🚗",
    promptHint: "生成以交通工具为主题的游戏，如赛车、停车等",
    category: "vehicle",
  },
  {
    id: "princess",
    name: "公主城堡",
    icon: "🏰",
    promptHint: "生成以公主/城堡为主题的游戏，如收集宝石、装扮等",
    category: "fantasy",
  },
  {
    id: "dinosaur",
    name: "恐龙世界",
    icon: "🦕",
    promptHint: "生成以恐龙为主题的游戏，如找恐龙、孵化恐龙蛋等",
    category: "fantasy",
  },
  {
    id: "space",
    name: "太空冒险",
    icon: "🚀",
    promptHint: "生成以太空为主题的游戏，如开飞船、打陨石等",
    category: "other",
  },
];
