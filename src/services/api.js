/**
 * ============================================================
 * api.js — 后端 API 调用封装
 * ============================================================
 *
 * 自动根据环境选择 API 地址：
 * - 开发环境（npm run dev）→ http://localhost:4000/api
 * - 生产环境（Vercel）    → /api（同域，走 Vercel Serverless）
 *
 * 使用方式：
 *   import { generateGame, fetchModelCatalog, testModel } from '../services/api';
 *
 * V3.2 新增：
 * - fetchModelCatalog()：GET /models
 * - testModel()：POST /models/test（只验证调用与返回，不生成游戏）
 * - generateGame()：请求体可携带 modelId / modelConfig
 */

/** 根据环境自动选择 API 基础地址 */
export const getApiBaseUrl = () => {
  // Vite 的 import.meta.env.PROD 在 npm run build 后为 true
  if (import.meta.env.PROD) {
    return "/api"; // 生产环境：同域请求，走 Vercel Rewrites
  }
  return "http://localhost:4000/api"; // 开发环境：直连本地后端
};

/**
 * 带超时的 JSON 请求
 *
 * @param {string} path - 以 / 开头的 API 路径
 * @param {RequestInit} options - fetch 配置
 * @param {number} timeoutMs - 超时毫秒数
 */
async function requestJson(path, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error(
        (data && data.message) || `API 请求失败（${res.status}）`
      );
    }

    if (!data) {
      throw new Error("服务返回内容为空");
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("请求超时，请稍后再试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {Object} GenerateGameRequest
 * @property {string} [templateId] - 模板 ID
 * @property {string} userPrompt - 用户语音/文字输入
 * @property {string} [remixFrom] - 被改编作品的 ID
 * @property {string} [remixInstruction] - Remix 改编要求
 * @property {string} [originalTitle] - 原作品标题
 * @property {string} [originalUserPrompt] - 原作品创作描述
 * @property {string} [originalGameHtml] - 原游戏完整 HTML（V3.3）
 * @property {string} [originalGameHtmlPreview] - 原游戏 HTML 预览（旧客户端兼容）
 * @property {string} [modelId] - 内置/自定义模型 ID
 * @property {Object} [modelConfig] - 自定义模型配置
 */

/**
 * @typedef {Object} GenerateGameData
 * @property {string} title
 * @property {string} gameHtml
 * @property {string} [engine]
 * @property {string} [model]
 * @property {string} [modelName]
 * @property {string} [modelSource]
 * @property {string} [warning]
 * @property {string} [remixMode]
 * @property {Object} [remixProfile]
 * @property {Object} [remixAudit]
 * @property {boolean} [remixFallback]
 */

/**
 * @typedef {Object} GenerateGameResponse
 * @property {boolean} success
 * @property {GenerateGameData} [data]
 * @property {string} [message]
 */

/**
 * 调用 AI 生成游戏
 *
 * @param {GenerateGameRequest} req - 请求参数
 * @returns {Promise<GenerateGameResponse>}
 */
export async function generateGame(req) {
  return requestJson(
    "/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    },
    300000
  );
}

/**
 * 获取内置模型目录（脱敏）
 * @returns {Promise<{ success: boolean, data: { models, defaultModelId, defaultModelName, hasServerApiKey }, message?: string }>}
 */
export async function fetchModelCatalog() {
  return requestJson("/models", { method: "GET" }, 8000);
}

/**
 * 测试模型（只验证调用与返回，不生成游戏）
 *
 * @param {Object} payload - { modelId } 或 { modelConfig }
 * @returns {Promise<{ success: boolean, data?: { ok, latencyMs, modelName, source, reply }, message?: string }>}
 */
export async function testModel(payload) {
  return requestJson(
    "/models/test",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    25000
  );
}
