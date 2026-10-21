/**
 * Vercel 入口源码：POST /api/models/test
 *
 * 构建时由 scripts/build-api.mjs 打包成自包含的 api/models/test.ts。
 */

import { Hono } from 'hono';
import { modelTestHandler } from '../server/src/routes/models';

const app = new Hono();

app.post('*', modelTestHandler);

export const POST = (request: Request) => app.fetch(request);
