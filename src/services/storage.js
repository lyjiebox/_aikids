/**
 * ============================================================
 * storage.js — localStorage 封装
 * ============================================================
 * 
 * 负责作品和设置的本地持久化存储。
 * 
 * 存储 Key：
 * - aikids-works    → 作品列表（GameWork[]）
 * - aikids-settings → 家长设置（ParentSettings）
 * - aikids-models   → 自定义模型（CustomModel[]，V3.2）
 * 
 * 所有读写操作都有 try/catch 保护：
 * - localStorage 满 → 静默失败，不影响应用运行
 * - JSON 解析失败  → 返回空数组/空对象
 */

const WORKS_KEY = "aikids-works";
const SETTINGS_KEY = "aikids-settings";
const MODELS_KEY = "aikids-models";
const MAX_CUSTOM_MODELS = 20;

/**
 * 从 localStorage 加载作品列表
 * @returns {Array} 作品数组，解析失败返回 []
 */
export function loadWorks() {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // V2.0 旧数据兼容：补全 remixCount 默认 0
    return parsed.map(work => ({
      ...work,
      remixCount: work.remixCount ?? 0
    }));
  } catch (e) {
    console.error("[storage] loadWorks failed:", e);
    return [];
  }
}

/**
 * 保存作品列表到 localStorage
 * @param {Array} works - 作品数组
 */
export function saveWorks(works) {
  try {
    localStorage.setItem(WORKS_KEY, JSON.stringify(works));
  } catch (e) {
    console.error("[storage] saveWorks failed:", e);
  }
}

/**
 * 从 localStorage 加载家长设置
 * @returns {Object} 设置对象，解析失败返回 {}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error("[storage] loadSettings failed:", e);
    return {};
  }
}

/**
 * 保存家长设置到 localStorage
 * @param {Object} settings - 设置对象
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("[storage] saveSettings failed:", e);
  }
}

// ============================================================
// 自定义模型（V3.2）
// ============================================================

/**
 * 规范化单条自定义模型，非法数据返回 null
 * @param {*} raw
 * @returns {Object|null}
 */
function normalizeCustomModel(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : "";

  if (!id || !name || !baseUrl || !model) return null;

  return {
    id,
    name: name.slice(0, 30),
    baseUrl,
    model: model.slice(0, 200),
    apiKey,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

/**
 * 从 localStorage 加载自定义模型
 * 容错：非法条目丢弃、重复 ID 去重、最多 20 条
 * @returns {Array} 自定义模型数组
 */
export function loadCustomModels() {
  try {
    const raw = localStorage.getItem(MODELS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    const models = [];

    for (const item of parsed) {
      const model = normalizeCustomModel(item);
      if (!model || seen.has(model.id)) continue;
      seen.add(model.id);
      models.push(model);
      if (models.length >= MAX_CUSTOM_MODELS) break;
    }

    return models;
  } catch (e) {
    console.error("[storage] loadCustomModels failed:", e);
    return [];
  }
}

/**
 * 保存自定义模型到 localStorage
 * @param {Array} models
 */
export function saveCustomModels(models) {
  try {
    const list = Array.isArray(models)
      ? models.slice(0, MAX_CUSTOM_MODELS)
      : [];
    localStorage.setItem(MODELS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("[storage] saveCustomModels failed:", e);
  }
}
