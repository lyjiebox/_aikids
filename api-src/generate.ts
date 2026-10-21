/**
 * Vercel 入口源码：POST /api/generate
 *
 * 这里只创建 Hono 实例并挂载共享 handler；
 * 构建时由 scripts/build-api.mjs 打包成自包含的 api/generate.ts。
 */

import { Hono } from 'hono';
import { generateHandler } from '../server/src/routes/generate';

const app = new Hono();

app.post('*', generateHandler);

/** Vercel 要求使用命名 HTTP 方法导出 */
export const POST = (request: Request) => app.fetch(request);
