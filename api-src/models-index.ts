/**
 * Vercel 入口源码：GET /api/models
 *
 * 构建时由 scripts/build-api.mjs 打包成自包含的 api/models/index.ts。
 */

import { Hono } from 'hono';
import { modelCatalogHandler } from '../server/src/routes/models';

const app = new Hono();

app.get('*', modelCatalogHandler);

export const GET = (request: Request) => app.fetch(request);
