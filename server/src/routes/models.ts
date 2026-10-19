/**
 * ============================================================
 * 模型相关路由（本地开发后端）
 * ============================================================
 *
 * GET  /api/models       内置模型目录 + 默认模型（脱敏）
 * POST /api/models/test  测试模型配置能否完成调用并返回文本
 */

import { Hono } from 'hono';
import { getModelCatalog, testModel } from '../services/model';

const modelsRoute = new Hono();

/** 获取内置模型目录 */
modelsRoute.get('/', (c) => {
  return c.json({
    success: true,
    data: getModelCatalog(),
  });
});

/** 测试模型（只验证调用与返回，不生成游戏） */
modelsRoute.post('/test', async (c) => {
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

export default modelsRoute;
