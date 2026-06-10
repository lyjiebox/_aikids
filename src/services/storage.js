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
 * 
 * 所有读写操作都有 try/catch 保护：
 * - localStorage 满 → 静默失败，不影响应用运行
 * - JSON 解析失败  → 返回空数组/空对象
 */

const WORKS_KEY = "aikids-works";
const SETTINGS_KEY = "aikids-settings";

/**
 * 从 localStorage 加载作品列表
 * @returns {Array} 作品数组，解析失败返回 []
 */
export function loadWorks() {
  try {
    const raw = localStorage.getItem(WORKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
