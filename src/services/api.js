/**
 * ============================================================
 * api.js — 后端 API 调用封装
 * ============================================================
 * 
 * 自动根据环境选择 API 地址：
 * - 开发环境（npm run dev）→ http://localhost:4000/api/generate
 * - 生产环境（Vercel）    → /api/generate（同域，走 Vercel Serverless）
 * 
 * 使用方式：
 *   import { generateGame } from '../services/api';
 *   const result = await generateGame({ templateId, userPrompt });
 */

/** 根据环境自动选择 API 地址 */
const getApiUrl = () => {
  // Vite 的 import.meta.env.PROD 在 npm run build 后为 true
  if (import.meta.env.PROD) {
    return "/api/generate";  // 生产环境：同域请求，走 Vercel Rewrites
  }
  return "http://localhost:4000/api/generate";  // 开发环境：直连本地后端
};

/**
 * 调用 AI 生成游戏
 * 
 * @param {Object} req - 请求参数
 * @param {string} req.templateId - 模板 ID（可选）
 * @param {string} req.userPrompt - 用户语音/文字输入
 * @returns {Promise<{ success: boolean, data?: { title, gameHtml, engine }, message?: string }>}
 */
export async function generateGame(req) {
  const url = getApiUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) {
    throw new Error("API请求失败");
  }
  
  return res.json();
}
