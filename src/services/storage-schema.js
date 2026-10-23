/**
 * ============================================================
 * storage-schema.js — 存储数据模型与迁移（V3.6）
 * ============================================================
 *
 * 本文件只包含纯函数，不访问 localStorage / DOM：
 * - 作品、设置、自定义模型的规范化
 * - schemaVersion、UUID、ownerId、visibility
 * - 备份导出信封、导入解析、合并/覆盖
 * - V5.1 云端迁移数据构建
 *
 * 这样 Node 测试、迁移 CLI 与浏览器可以共用同一套规则。
 */

/** 当前本地数据 schema 版本 */
export const SCHEMA_VERSION = 1;

/** 备份文件标识 */
export const EXPORT_KIND = "aikids-export";
export const TELEMETRY_EXPORT_KIND = "aikids-telemetry";
export const CLOUD_MIGRATION_KIND = "aikids-cloud-migration";
export const APP_ID = "aikids";

export const STORAGE_KEYS = {
  works: "aikids-works",
  settings: "aikids-settings",
  models: "aikids-models",
  telemetry: "aikids-telemetry",
};

export const MAX_CUSTOM_MODELS = 20;

/** 字段长度上限，避免异常备份撑爆 localStorage */
export const LIMITS = {
  title: 120,
  templateId: 60,
  userPrompt: 4000,
  modelName: 60,
  remixInstruction: 2000,
  ownerId: 120,
  visibility: 20,
};

const VISIBILITIES = new Set(["private", "shared", "public"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value, max) {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function toOptionalText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function toCount(value) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  const cryptoObject = globalThis.crypto;

  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 生成 UUID v4。优先使用 crypto.randomUUID，缺失时退化为
 * getRandomValues / Math.random。
 */
export function createId() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  return fallbackUuid();
}

/** 新作品 ID（语义别名，方便未来换成云端 ID 方案） */
export function createWorkId() {
  return createId();
}

/**
 * 规范化单条作品。
 * - 旧作品保留原 ID（关键兼容约束）
 * - 缺失 ID 时生成 UUID
 * - 补齐 schemaVersion / ownerId / visibility
 * - 未知字段原样保留（前向兼容）
 */
export function normalizeWork(raw) {
  if (!isPlainObject(raw)) return null;

  const work = { ...raw };
  const rawId = typeof raw.id === "string" ? raw.id.trim() : "";
  work.id = rawId || createWorkId();

  const schemaVersion = Number(raw.schemaVersion);
  work.schemaVersion =
    Number.isFinite(schemaVersion) && schemaVersion > SCHEMA_VERSION
      ? Math.floor(schemaVersion)
      : SCHEMA_VERSION;

  work.ownerId =
    typeof raw.ownerId === "string" && raw.ownerId.trim()
      ? raw.ownerId.trim().slice(0, LIMITS.ownerId)
      : null;

  work.visibility =
    typeof raw.visibility === "string" && VISIBILITIES.has(raw.visibility)
      ? raw.visibility
      : "private";

  work.title = toText(raw.title, LIMITS.title) || "未命名游戏";
  work.templateId = toText(raw.templateId, LIMITS.templateId) || "free";
  work.userPrompt = toText(raw.userPrompt, LIMITS.userPrompt);
  // 游戏 HTML 不做长度截断：截断会永久破坏旧作品，导入文件整体另有 50MB 上限
  work.gameHtml = typeof raw.gameHtml === "string" ? raw.gameHtml : "";
  work.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  work.playCount = toCount(raw.playCount);
  work.remixCount = toCount(raw.remixCount);

  if (raw.generationTime !== undefined) {
    work.generationTime = toCount(raw.generationTime);
  }
  if (raw.remixFrom !== undefined) {
    work.remixFrom = toOptionalText(raw.remixFrom, 120) ?? undefined;
  }
  if (raw.remixInstruction !== undefined) {
    work.remixInstruction =
      toOptionalText(raw.remixInstruction, LIMITS.remixInstruction) ?? undefined;
  }
  if (raw.remixFromTitle !== undefined) {
    work.remixFromTitle = toOptionalText(raw.remixFromTitle, LIMITS.title);
  }
  if (raw.modelName !== undefined) {
    work.modelName = toOptionalText(raw.modelName, LIMITS.modelName);
  }

  return work;
}

/** 规范化家长设置：保持原对象结构，不注入默认值 */
export function normalizeSettings(raw) {
  if (!isPlainObject(raw)) return {};
  return { ...raw };
}

/**
 * 规范化单条自定义模型（规则与 V3.2 一致）。
 * API Key 属于备份内容，按产品决策保留。
 */
export function normalizeCustomModel(raw) {
  if (!isPlainObject(raw)) return null;

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

function normalizeWorkList(list) {
  const seen = new Set();
  const works = [];
  if (!Array.isArray(list)) return works;

  for (const item of list) {
    const work = normalizeWork(item);
    if (!work || seen.has(work.id)) continue;
    seen.add(work.id);
    works.push(work);
  }
  return works;
}

function normalizeModelList(list) {
  const seenIds = new Set();
  const seenTargets = new Set();
  const models = [];

  if (!Array.isArray(list)) return models;

  for (const item of list) {
    const model = normalizeCustomModel(item);
    if (!model) continue;

    const target = `${model.baseUrl.trim().toLowerCase().replace(/\/+$/, "")}::${model.model
      .trim()
      .toLowerCase()}`;
    if (seenIds.has(model.id) || seenTargets.has(target)) continue;

    seenIds.add(model.id);
    seenTargets.add(target);
    models.push(model);
    if (models.length >= MAX_CUSTOM_MODELS) break;
  }

  return models;
}

/**
 * 规范化完整快照。
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} input
 */
export function normalizeSnapshot(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    works: normalizeWorkList(source.works),
    settings: normalizeSettings(source.settings),
    models: normalizeModelList(source.models),
  };
}

/**
 * 构建备份文件内容。
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} snapshot
 * @param {number} [now] 时间戳，便于测试
 */
export function buildExportEnvelope(snapshot, now = Date.now()) {
  const normalized = normalizeSnapshot(snapshot);
  return {
    kind: EXPORT_KIND,
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: {
      works: normalized.works,
      settings: normalized.settings,
      models: normalized.models,
    },
  };
}

/**
 * 解析导入内容（字符串或已 JSON.parse 的对象）。
 * 支持：V3.6 备份 / 旧格式 {works,settings,models} / 裸作品数组。
 *
 * @returns {{ok: true, snapshot: object, meta: object} | {ok: false, code: string, message: string}}
 */
export function parseImportPayload(input) {
  let raw = input;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        code: "INVALID_JSON",
        message: "备份文件解析失败，请确认是 JSON 文件",
      };
    }
  }

  if (Array.isArray(raw)) {
    const snapshot = normalizeSnapshot({ works: raw });
    return {
      ok: true,
      snapshot,
      meta: {
        source: "works-array",
        schemaVersion: 0,
        exportedAt: null,
        rawWorks: raw.length,
        rawModels: 0,
      },
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "不是有效的备份文件",
    };
  }

  if (raw.kind !== undefined && raw.kind !== EXPORT_KIND) {
    return {
      ok: false,
      code: "INVALID_KIND",
      message: "不是 AI 魔法游戏的数据备份文件",
    };
  }

  const versionNumber = Number(raw.schemaVersion);
  if (Number.isFinite(versionNumber) && versionNumber > SCHEMA_VERSION) {
    return {
      ok: false,
      code: "VERSION_TOO_NEW",
      message: "备份来自更新版本的应用，请先升级后再导入",
    };
  }

  if (raw.kind === EXPORT_KIND) {
    const data = isPlainObject(raw.data) ? raw.data : null;
    if (!data) {
      return {
        ok: false,
        code: "INVALID_FORMAT",
        message: "备份文件缺少 data 字段",
      };
    }
    const snapshot = normalizeSnapshot(data);
    return {
      ok: true,
      snapshot,
      meta: {
        source: "envelope",
        schemaVersion: Number.isFinite(versionNumber) ? versionNumber : 0,
        exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
        rawWorks: Array.isArray(data.works) ? data.works.length : 0,
        rawModels: Array.isArray(data.models) ? data.models.length : 0,
      },
    };
  }

  // 旧格式：{ works, settings, models }
  const hasLegacyField =
    raw.works !== undefined || raw.settings !== undefined || raw.models !== undefined;
  if (!hasLegacyField) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: "不是有效的备份文件",
    };
  }

  const snapshot = normalizeSnapshot(raw);
  return {
    ok: true,
    snapshot,
    meta: {
      source: "legacy",
      schemaVersion: Number.isFinite(versionNumber) ? versionNumber : 0,
      exportedAt: null,
      rawWorks: Array.isArray(raw.works) ? raw.works.length : 0,
      rawModels: Array.isArray(raw.models) ? raw.models.length : 0,
    },
  };
}

/**
 * 合并或覆盖导入。
 *
 * merge（默认）：
 * - 作品按 id 去重，导入的新作品追加到列表前部
 * - 模型按 id 与 baseUrl+model 去重，最多 20 条
 * - 设置浅合并，导入字段优先
 *
 * replace：完全替换作品 / 设置 / 模型
 *
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} current
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} incoming
 * @param {"merge" | "replace"} [mode]
 */
export function mergeSnapshots(current, incoming, mode = "merge") {
  const base = normalizeSnapshot(current);
  const next = normalizeSnapshot(incoming);

  if (mode === "replace") {
    return {
      snapshot: {
        schemaVersion: SCHEMA_VERSION,
        works: next.works,
        settings: next.settings,
        models: next.models,
      },
      summary: {
        mode: "replace",
        worksAdded: next.works.length,
        worksSkipped: 0,
        modelsAdded: next.models.length,
        modelsSkipped: 0,
        settingsReplaced: true,
        totalWorks: next.works.length,
        totalModels: next.models.length,
      },
    };
  }

  const existingIds = new Set(base.works.map((work) => work.id));
  const addedWorks = [];
  let worksSkipped = 0;

  for (const work of next.works) {
    if (existingIds.has(work.id)) {
      worksSkipped += 1;
      continue;
    }
    existingIds.add(work.id);
    addedWorks.push(work);
  }

  const targetKey = (model) =>
    `${model.baseUrl.trim().toLowerCase().replace(/\/+$/, "")}::${model.model
      .trim()
      .toLowerCase()}`;
  const existingModelIds = new Set(base.models.map((model) => model.id));
  const existingTargets = new Set(base.models.map(targetKey));
  const addedModels = [];
  let modelsSkipped = 0;

  for (const model of next.models) {
    if (base.models.length + addedModels.length >= MAX_CUSTOM_MODELS) {
      modelsSkipped += 1;
      continue;
    }
    if (existingModelIds.has(model.id) || existingTargets.has(targetKey(model))) {
      modelsSkipped += 1;
      continue;
    }
    existingModelIds.add(model.id);
    existingTargets.add(targetKey(model));
    addedModels.push(model);
  }

  const works = [...addedWorks, ...base.works];
  const models = [...base.models, ...addedModels];

  return {
    snapshot: {
      schemaVersion: SCHEMA_VERSION,
      works,
      settings: { ...base.settings, ...next.settings },
      models,
    },
    summary: {
      mode: "merge",
      worksAdded: addedWorks.length,
      worksSkipped,
      modelsAdded: addedModels.length,
      modelsSkipped,
      settingsReplaced: Object.keys(next.settings).length > 0,
      totalWorks: works.length,
      totalModels: models.length,
    },
  };
}

/**
 * 构建 V5.1 云端迁移数据（本地文件，不上传）。
 *
 * - 保留本地作品 ID，作为云端幂等键（localId）
 * - 补齐 ownerId / visibility
 * - 自定义模型只保留非敏感字段，绝不包含 apiKey
 *
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} snapshot
 * @param {{ownerId?: string, now?: number}} [options]
 */
export function buildCloudMigration(snapshot, options = {}) {
  const normalized = normalizeSnapshot(snapshot);
  const ownerId =
    typeof options.ownerId === "string" && options.ownerId.trim()
      ? options.ownerId.trim().slice(0, LIMITS.ownerId)
      : "local-owner";
  const now = Number.isFinite(options.now) ? options.now : Date.now();

  return {
    kind: CLOUD_MIGRATION_KIND,
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    ownerId,
    migratedAt: new Date(now).toISOString(),
    works: normalized.works.map((work) => ({
      id: work.id,
      ownerId: work.ownerId || ownerId,
      visibility: work.visibility,
      schemaVersion: work.schemaVersion,
      title: work.title,
      templateId: work.templateId,
      gameHtml: work.gameHtml,
      createdAt: work.createdAt,
      ...(work.remixFrom ? { remixFrom: work.remixFrom } : {}),
      payload: work,
    })),
    models: normalized.models.map((model) => ({
      id: model.id,
      name: model.name,
      baseUrl: model.baseUrl,
      model: model.model,
    })),
  };
}
