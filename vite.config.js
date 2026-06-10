/**
 * ============================================================
 * Vite 构建配置
 * ============================================================
 * 
 * 开发环境：
 * - 前端运行在 localhost:3000
 * - /api/* 请求代理到 localhost:4000（后端 Hono 服务）
 * 
 * 生产环境：
 * - Vite build 输出到 dist/
 * - Vercel 自动识别并部署
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // 开发环境代理：将 /api 请求转发到本地后端
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
