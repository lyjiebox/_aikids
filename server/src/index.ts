import { loadLocalEnv } from './loadEnv';

loadLocalEnv();

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import generateRoute from "./routes/generate";

const app = new Hono();

// 启用 CORS
app.use("/*", cors());

// 健康检查
app.get("/", (c) => c.text("AI Kids Server - OK!"));

// 路由挂载
app.route("/api/generate", generateRoute);

// 端口监听
const port = Number(process.env.PORT) || 4000;
console.log(`[server] starting on port ${port} ...`);

serve({ fetch: app.fetch, port });
