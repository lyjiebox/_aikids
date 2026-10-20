/**
 * 构建产物冒烟：启动 vite preview，请求首页与 SPA 路由。
 *
 * 用途：在 CI 中替代「Vercel 预览冒烟」的最低成本版本，
 * 验证 dist/ 可被静态服务器正确提供且 SPA fallback 生效。
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';

const root = process.cwd();
const distIndex = path.join(root, 'dist/index.html');

if (!fs.existsSync(distIndex)) {
  console.error('❌ dist/index.html 不存在，请先运行 npm run build');
  process.exit(1);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const port = await getFreePort();
const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
const child = spawn(
  process.execPath,
  [viteBin, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env }
);

let log = '';
child.stdout.on('data', (chunk) => {
  log += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  log += chunk.toString();
});

async function waitForReady(baseUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return;
    } catch {
      // 继续等待
    }
    await sleep(200);
  }
  throw new Error(`vite preview 未就绪：\n${log.slice(-1000)}`);
}

const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`✅ ${name}`);
  } else {
    failures.push(name);
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForReady(baseUrl);

  const home = await fetch(`${baseUrl}/`);
  const homeText = await home.text();
  check('首页返回 200', home.status === 200, `status=${home.status}`);
  check('首页包含挂载点', homeText.includes('id="root"') || homeText.includes("id='root'"));

  const create = await fetch(`${baseUrl}/create`);
  const createText = await create.text();
  check('SPA 路由 /create 返回 200', create.status === 200, `status=${create.status}`);
  check('SPA 路由返回 HTML', createText.includes('<div id="root"'));

  const assetMatch = homeText.match(/src="([^"]+\.js)"/);
  if (assetMatch) {
    const asset = await fetch(`${baseUrl}${assetMatch[1]}`);
    check('首页 JS 资源可访问', asset.status === 200, `asset=${assetMatch[1]}, status=${asset.status}`);
  } else {
    check('首页包含 JS 资源引用', false, '未找到 <script src="*.js">');
  }

  const notFound = await fetch(`${baseUrl}/__smoke_missing_asset__.js`);
  check('缺失静态资源不返回 5xx', notFound.status < 500, `status=${notFound.status}`);
} catch (error) {
  console.error(`❌ 冒烟失败：${error.message}`);
  failures.push('preview');
} finally {
  child.kill('SIGTERM');
  await sleep(300);
  if (!child.killed) child.kill('SIGKILL');
}

if (failures.length > 0) {
  console.error(`\n❌ 冒烟失败：${failures.join(' / ')}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ smoke OK');
}
