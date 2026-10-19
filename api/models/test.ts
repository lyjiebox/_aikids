/**
 * ============================================================
 * Vercel Serverless Function: POST /api/models/test
 * ============================================================
 *
 * 测试模型配置能否完成调用并返回文本。
 * 不生成游戏、不写作品、不消耗 Mock。
 */

import { Hono } from 'hono';
import { testModel } from '../_model';

const app = new Hono();

app.post('*', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { success: false, message: '请求参数格式错误' },
      400
    );
  }

  const record =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const result = await testModel({
    modelId: record.modelId,
    model: record.model,
    modelConfig: record.modelConfig,
  });

  if (result.ok) {
    return c.json({
      success: true,
      data: {
        ok: true,
        latencyMs: result.latencyMs,
        modelName: result.modelName,
        source: result.source,
        reply: result.reply,
      },
    });
  }

  return c.json({
    success: false,
    message: result.message || '模型测试失败',
    data: {
      latencyMs: result.latencyMs,
      status: result.status,
      code: result.code,
      modelName: result.modelName,
      source: result.source,
    },
  });
});

export const POST = (request: Request) => app.fetch(request);
