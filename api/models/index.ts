/**
 * ============================================================
 * Vercel Serverless Function: GET /api/models
 * ============================================================
 *
 * 返回环境变量定义的内置模型目录（脱敏）与默认模型。
 */

import { Hono } from 'hono';
import { getModelCatalog } from '../_model';

const app = new Hono();

app.get('*', (c) => {
  return c.json({
    success: true,
    data: getModelCatalog(),
  });
});

export const GET = (request: Request) => app.fetch(request);
