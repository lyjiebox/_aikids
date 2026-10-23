/**
 * ============================================================
 * storage.js — localStorage 读写（V3.6 唯一入口）
 * ============================================================
 *
 * 负责作品、设置、自定义模型的本地持久化。
 * 所有数据在读取时经过 storage-schema.js 规范化：
 * - 旧作品保留原 ID，补齐 schemaVersion / ownerId / visibility
 * - 旧设置原样返回（默认值仍由 AppContext 合并）
 * - 旧自定义模型保持 V3.2 的容错规则
 *
 * 存储 Key：
 * - aikids-works    → 作品列表（Work[]）
 * - aikids-settings → 家长设置（ParentSettings）
 * - aikids-models   → 自定义模型（CustomModel[]，含 API Key）
 *
 * 所有读写操作都有 try/catch 保护：
 * - localStorage 满 → 静默失败，不影响应用运行
 * - JSON 解析失败  → 返回空数据
 *
 * 页面与 Context 不得直接访问这些 Key；换存储实现时只改本文件。
 */

import {
  MAX_CUSTOM_MODELS,
  STORAGE_KEYS,
  normalizeCustomModel,
  normalizeSettings,
  normalizeSnapshot,
  normalizeWork,
} from "./storage-schema";

const WORKS_KEY = STORAGE_KEYS.works;
const SETTINGS_KEY = STORAGE_KEYS.settings;
const MODELS_KEY = STORAGE_KEYS.models;

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
    return normalizeSnapshot({ works: parsed }).works;
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
    const list = normalizeSnapshot({ works }).works;
    localStorage.setItem(WORKS_KEY, JSON.stringify(list));
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
    return normalizeSettings(JSON.parse(raw));
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch (e) {
    console.error("[storage] saveSettings failed:", e);
  }
}

// ============================================================
// 自定义模型（V3.2）
// ============================================================

function normalizeModelList(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const models = [];

  for (const item of input) {
    const model = normalizeCustomModel(item);
    if (!model || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push(model);
    if (models.length >= MAX_CUSTOM_MODELS) break;
  }

  return models;
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

    return normalizeModelList(parsed);
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
    const list = normalizeModelList(models).slice(0, MAX_CUSTOM_MODELS);
    localStorage.setItem(MODELS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("[storage] saveCustomModels failed:", e);
  }
}

// ============================================================
// 快照（导出 / 导入 / V5.1 迁移共用）
// ============================================================

/**
 * 读取完整本地快照（已规范化）
 * @returns {{schemaVersion: number, works: Array, settings: Object, models: Array}}
 */
export function loadSnapshot() {
  return normalizeSnapshot({
    works: loadWorks(),
    settings: loadSettings(),
    models: loadCustomModels(),
  });
}

/**
 * 一次性写入完整快照（导入 / 恢复后使用）
 * @param {{works?: Array, settings?: Object, models?: Array}} snapshot
 */
export function saveSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  saveWorks(normalized.works);
  saveSettings(normalized.settings);
  saveCustomModels(normalized.models);
  return normalized;
}

/**
 * 读取单条作品（规范化后）
 * @param {unknown} raw
 */
export function normalizeStoredWork(raw) {
  return normalizeWork(raw);
}
