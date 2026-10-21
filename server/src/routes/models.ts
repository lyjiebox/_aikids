/**
 * ============================================================
 * 模型路由（V3.5 薄适配层）
 * ============================================================
 *
 * GET  /api/models       内置模型目录 + 默认模型（脱敏）
 * POST /api/models/test  测试模型配置能否完成调用并返回文本
 *
 * 业务逻辑全部在 services/model.ts；本文件只做 HTTP 适配。
 */

import { Hono, type Context } from 'hono';
import { getModelCatalog, testModel } from '../services/model';

/** 获取内置模型目录 */
export function modelCatalogHandler(c: Context): Response {
  return c.json({
    success: true,
    data: getModelCatalog(),
  });
}

/** 测试模型（只验证调用与返回，不生成游戏） */
export async function modelTestHandler(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        success: false,
        code: 'INVALID_JSON',
        message: '请求参数格式错误',
      },
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
    code: result.code ?? 'UNKNOWN',
    message: result.message || '模型测试失败',
    data: {
      latencyMs: result.latencyMs,
      status: result.status,
      code: result.code,
      modelName: result.modelName,
      source: result.source,
    },
  });
}

const modelsRoute = new Hono();

modelsRoute.get('/', modelCatalogHandler);
modelsRoute.post('/test', modelTestHandler);

export default modelsRoute;
