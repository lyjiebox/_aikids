/**
 * ============================================================
 * model-utils.js — 模型相关纯函数（V3.2）
 * ============================================================
 *
 * 负责：
 * - 模型表单校验（名称 / 地址 / 模型 ID / Key / 重名）
 * - 自定义模型 ID 生成
 * - 当前选择读取与写入（sessionStorage）
 * - 当前模型展示文案、生成请求参数组装
 *
 * 不依赖 React，方便单元测试与复用。
 *
 * V3.6：常用接口预设移到 shared/config/models.ts，
 * 这里保留同名导出，Models 页导入路径不变。
 */

import {
  DEFAULT_MODEL_BASE_URL as SHARED_DEFAULT_MODEL_BASE_URL,
  MODEL_PRESETS as SHARED_MODEL_PRESETS,
} from '../../shared/config/models';

export const MAX_CUSTOM_MODELS = 20;

/** 常用接口地址预设（来自 shared/config/models.ts） */
export const MODEL_PRESETS = SHARED_MODEL_PRESETS;

export const DEFAULT_MODEL_BASE_URL = SHARED_DEFAULT_MODEL_BASE_URL;

const SELECTED_MODEL_KEY = "aikids-selected-model";

/** 生成自定义模型 ID */
export function generateModelId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `custom-${timestamp}-${random}`;
}

/** 脱敏展示 API Key */
export function maskApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") return "";
  if (apiKey.length <= 4) return "••••";
  return `••••${apiKey.slice(-4)}`;
}

/** 从 URL 中提取主机名（含端口），失败返回空字符串 */
export function getHostFromUrl(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "";
  }
}

/** 是否为本地地址 */
export function isLocalUrl(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * 校验自定义模型表单
 *
 * @param {Object} draft - { name, baseUrl, model, apiKey }
 * @param {Object} context - { envModels, customModels, editingId }
 * @returns {{ ok: boolean, errors: Object, value?: Object }}
 */
export function validateCustomModel(draft, context = {}) {
  const envModels = Array.isArray(context.envModels) ? context.envModels : [];
  const customModels = Array.isArray(context.customModels) ? context.customModels : [];
  const editingId = context.editingId || null;

  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const baseUrl = typeof draft.baseUrl === "string" ? draft.baseUrl.trim() : "";
  const model = typeof draft.model === "string" ? draft.model.trim() : "";
  const apiKey = typeof draft.apiKey === "string" ? draft.apiKey.trim() : "";

  const errors = {};

  // 名称
  if (!name) {
    errors.name = "请填写模型名称";
  } else if (name.length > 30) {
    errors.name = "模型名称不能超过 30 个字符";
  } else {
    const nameKey = name.toLowerCase();
    const duplicateCustom = customModels.some(
      (item) =>
        item.id !== editingId &&
        String(item.name || "").trim().toLowerCase() === nameKey
    );
    const duplicateEnv = envModels.some(
      (item) => String(item.name || "").trim().toLowerCase() === nameKey
    );
    if (duplicateCustom || duplicateEnv) {
      errors.name = "模型名称已存在，请换一个";
    }
  }

  // 接口地址
  if (!baseUrl) {
    errors.baseUrl = "请填写接口地址";
  } else {
    let url = null;
    try {
      url = new URL(baseUrl);
    } catch {
      errors.baseUrl = "接口地址不是合法的 URL";
    }
    if (url) {
      const local = isLocalUrl(baseUrl);
      if (url.username || url.password) {
        errors.baseUrl = "接口地址不能包含账号密码";
      } else if (url.protocol !== "https:" && !local) {
        errors.baseUrl = "接口地址必须使用 https://";
      }
    }
  }

  // 模型 ID
  if (!model) {
    errors.model = "请填写模型 ID / 接入点";
  } else if (model.length > 200) {
    errors.model = "模型 ID 不能超过 200 个字符";
  }

  // API Key
  if (apiKey.length > 500) {
    errors.apiKey = "API Key 不能超过 500 个字符";
  }

  // 重复接口 + 模型
  if (!errors.baseUrl && !errors.model) {
    const normalize = (value) => value.trim().toLowerCase().replace(/\/+$/, "");
    const key = `${normalize(baseUrl)}::${normalize(model)}`;
    const duplicate = customModels.some(
      (item) =>
        item.id !== editingId &&
        `${normalize(String(item.baseUrl || ""))}::${normalize(
          String(item.model || "")
        )}` === key
    );
    if (duplicate) {
      errors.baseUrl = "相同的接口地址和模型 ID 已存在";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: {},
    value: { name, baseUrl, model, apiKey },
  };
}

/** 读取当前会话选择的模型 ID */
export function loadSelectedModelId() {
  try {
    return sessionStorage.getItem(SELECTED_MODEL_KEY) || null;
  } catch {
    return null;
  }
}

/** 保存当前会话选择的模型 ID（null 表示环境变量） */
export function saveSelectedModelId(modelId) {
  try {
    if (modelId) {
      sessionStorage.setItem(SELECTED_MODEL_KEY, modelId);
    } else {
      sessionStorage.removeItem(SELECTED_MODEL_KEY);
    }
  } catch {
    // 静默失败，不影响生成
  }
}

/**
 * 根据 ID 查找模型
 * @returns {{ model: Object, kind: 'env'|'custom' }|null}
 */
export function findModelById(modelsState, modelId) {
  if (!modelId || !modelsState) return null;

  const custom = (modelsState.custom || []).find((item) => item.id === modelId);
  if (custom) return { model: custom, kind: "custom" };

  const env = (modelsState.env || []).find((item) => item.id === modelId);
  if (env) return { model: env, kind: "env" };

  return null;
}

/**
 * 当前模型展示文案
 * - 已选择：模型名
 * - 未选择：环境变量（默认：XXX） / 环境变量
 */
export function getCurrentModelLabel(modelsState, selectedId) {
  const found = findModelById(modelsState, selectedId);
  if (found) return found.model.name;

  const defaultName = modelsState?.defaultModelName;
  return defaultName ? `环境变量（${defaultName}）` : "环境变量";
}

/**
 * 组装生成请求中的模型参数
 * - 环境变量：{}
 * - 内置模型：{ modelId }
 * - 自定义模型：{ modelId, modelConfig }
 */
export function getModelRequestParams(modelsState, selectedId) {
  const found = findModelById(modelsState, selectedId);
  if (!found) return {};

  if (found.kind === "env") {
    if (!found.model.available) return {};
    return { modelId: found.model.id };
  }

  const item = found.model;
  return {
    modelId: item.id,
    modelConfig: {
      id: item.id,
      name: item.name,
      baseUrl: item.baseUrl,
      model: item.model,
      apiKey: item.apiKey || "",
    },
  };
}
