/**
 * V3.2 前端 SSR 冒烟测试
 *
 * 用 Vite 的 SSR 模块加载器把页面渲染成 HTML，
 * 验证组件导入、Hooks、路由上下文没有运行时错误。
 *
 * 运行：node temp/v3.2/ssr-smoke.mjs
 */

import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const vite = await createServer({
  root: process.cwd(),
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
});

const { AppProvider } = await vite.ssrLoadModule('/src/context/AppContext.jsx');
const Home = (await vite.ssrLoadModule('/src/pages/Home.jsx')).default;
const Create = (await vite.ssrLoadModule('/src/pages/Create.tsx')).default;
const Settings = (await vite.ssrLoadModule('/src/pages/Settings.jsx')).default;
const Models = (await vite.ssrLoadModule('/src/pages/Models.jsx')).default;

const results = [];

function render(element) {
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      React.createElement(AppProvider, null, element)
    )
  );
}

function check(name, fn, expected = []) {
  try {
    const html = fn();
    const missing = expected.filter((text) => !html.includes(text));
    const ok = missing.length === 0;
    results.push({ name, ok });
    console.log(
      `${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — 缺少：${missing.join(' / ')}`}`
    );
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`❌ ${name} — ${error.message}`);
  }
}

check('Home 渲染（含模型选择区）', () => render(React.createElement(Home)), [
  '生成模型',
  '环境变量',
  '说出你的游戏创意',
]);

check('Create 渲染（含当前模型提示）', () => render(React.createElement(Create)), [
  '创作游戏',
  '当前模型',
  '开始生成',
]);

check('Settings 渲染（家长验证）', () => render(React.createElement(Settings)), [
  '家长验证',
]);

check('Models 渲染（家长验证）', () => render(React.createElement(Models)), [
  '家长验证',
]);

await vite.close();

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\n===== SSR 冒烟：${passed}/${results.length} 通过，${failed} 失败 =====`);
if (failed > 0) process.exitCode = 1;
