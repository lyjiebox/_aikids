/**
 * ============================================================
 * telemetry.js — 本地事件缓冲（V3.6）
 * ============================================================
 *
 * 只写 localStorage，不上报服务端，不发任何网络请求。
 * 事件用于：
 * - V4.4 本地 telemetry 面板
 * - V5.1 迁移前评估（有多少作品、失败率、模型分布）
 *
 * 隐私约束：
 * - 不记录 Prompt 全文、游戏 HTML、API Key、接口完整地址
 * - 消息截断并脱敏
 * - 只保留 200 条，超出丢最旧
 */

import {
  APP_ID,
  STORAGE_KEYS,
  TELEMETRY_EXPORT_KIND,
  createId,
} from "./storage-schema";

export const TELEMETRY_SCHEMA_VERSION = 1;
export const TELEMETRY_MAX_EVENTS = 200;

const STORAGE_KEY = STORAGE_KEYS.telemetry;

export const TELEMETRY_EVENT_TYPES = [
  "generate",
  "play",
  "remix",
  "failure",
];

const EVENT_TYPE_SET = new Set(TELEMETRY_EVENT_TYPES);
const MODES = new Set(["create", "remix"]);
const ENGINES = new Set(["volcengine", "mock"]);
const SOURCES = new Set(["env", "custom"]);
const SCOPES = new Set(["generate", "remix", "import", "storage"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function asEnum(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function asBool(value) {
  return typeof value === "boolean" ? value : undefined;
}

function asNonNegativeInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** 脱敏消息：去掉 Key / Bearer / 换行，截断到 160 字符 */
export function sanitizeMessage(value) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function sanitizePayload(type, payload) {
  const source = isPlainObject(payload) ? payload : {};
  const result = {};

  if (type === "generate") {
    const mode = asEnum(source.mode, MODES);
    if (mode) result.mode = mode;
    const ok = asBool(source.ok);
    if (ok !== undefined) result.ok = ok;
    const fallback = asBool(source.fallback);
    if (fallback !== undefined) result.fallback = fallback;
    const engine = asEnum(source.engine, ENGINES);
    if (engine) result.engine = engine;
    const modelId = asText(source.modelId, 100);
    if (modelId) result.modelId = modelId;
    const modelName = asText(source.modelName, 60);
    if (modelName) result.modelName = modelName;
    const modelSource = asEnum(source.modelSource, SOURCES);
    if (modelSource) result.modelSource = modelSource;
    const templateId = asText(source.templateId, 60);
    if (templateId) result.templateId = templateId;
    const durationMs = asNonNegativeInt(source.durationMs);
    if (durationMs !== undefined) result.durationMs = durationMs;
    const remixMode = asText(source.remixMode, 40);
    if (remixMode) result.remixMode = remixMode;
    const preserved = asBool(source.preserved);
    if (preserved !== undefined) result.preserved = preserved;
  } else if (type === "play") {
    const workId = asText(source.workId, 120);
    if (workId) result.workId = workId;
    const templateId = asText(source.templateId, 60);
    if (templateId) result.templateId = templateId;
    const isRemix = asBool(source.isRemix);
    if (isRemix !== undefined) result.isRemix = isRemix;
  } else if (type === "remix") {
    const workId = asText(source.workId, 120);
    if (workId) result.workId = workId;
    const instructionChars = asNonNegativeInt(source.instructionChars);
    if (instructionChars !== undefined) result.instructionChars = instructionChars;
  } else if (type === "failure") {
    const scope = asEnum(source.scope, SCOPES);
    if (scope) result.scope = scope;
    const code = asText(source.code, 60);
    if (code) result.code = code;
    const message = sanitizeMessage(source.message);
    if (message) result.message = message;
    const durationMs = asNonNegativeInt(source.durationMs);
    if (durationMs !== undefined) result.durationMs = durationMs;
  }

  return result;
}

/**
 * 记录一条本地事件。
 * @param {"generate"|"play"|"remix"|"failure"} type
 * @param {Object} [payload]
 * @param {number} [now]
 * @returns {Object|null} 事件对象；存储失败返回 null
 */
export function recordTelemetryEvent(type, payload = {}, now = Date.now()) {
  if (!EVENT_TYPE_SET.has(type)) return null;

  const event = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    id: createId(),
    type,
    at: new Date(now).toISOString(),
    ...sanitizePayload(type, payload),
  };

  try {
    const events = loadTelemetryEvents();
    events.push(event);
    const trimmed = events.slice(-TELEMETRY_MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return event;
  } catch (error) {
    // 隐私模式 / quota 满：静默失败，不影响主流程
    console.error("[telemetry] record failed:", error);
    return null;
  }
}

/** 读取本地事件（已过滤非法条目，最多 200 条） */
export function loadTelemetryEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((event) => isPlainObject(event) && EVENT_TYPE_SET.has(event.type))
      .slice(-TELEMETRY_MAX_EVENTS);
  } catch (error) {
    console.error("[telemetry] load failed:", error);
    return [];
  }
}

/** 当前事件条数 */
export function getTelemetryCount() {
  return loadTelemetryEvents().length;
}

/** 清空本地事件 */
export function clearTelemetryEvents() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("[telemetry] clear failed:", error);
    return false;
  }
}

/**
 * 构建诊断日志导出内容（本地文件，不上报）。
 * @param {number} [now]
 */
export function buildTelemetryExport(now = Date.now()) {
  return {
    kind: TELEMETRY_EXPORT_KIND,
    app: APP_ID,
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    events: loadTelemetryEvents(),
  };
}
