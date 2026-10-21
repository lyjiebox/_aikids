/**
 * ============================================================
 * 生成路由（V3.5 薄适配层）
 * ============================================================
 *
 * 只负责：读 JSON → 调用编排服务 → 按结果返回。
 * 校验、模型解析、降级、指标全部在 services/generate.ts。
 */

import { Hono, type Context } from 'hono';
import type { GenerateResponse } from '../types';
import {
  handleGenerateRequest,
  invalidJsonOutcome,
} from '../services/generate';

export async function generateHandler(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    const outcome = invalidJsonOutcome();
    return c.json(outcome.body, outcome.status);
  }

  const outcome = await handleGenerateRequest(body);
  return c.json(outcome.body as GenerateResponse, outcome.status);
}

const generateRoute = new Hono();

generateRoute.post('/', generateHandler);

export default generateRoute;
