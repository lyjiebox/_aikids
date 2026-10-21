/**
 * 集成测试用本地后端生命周期管理。
 *
 * - 动态端口，避免与开发中的 4000 冲突
 * - 以 server/ 为 cwd 启动 src/index.ts（与 npm run dev 一致）
 * - 显式覆盖模型环境变量，确保不读取真实 .env / 不消耗真实额度
 * - 测试结束自动 SIGTERM，超时 SIGKILL
 */

import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';

const root = process.cwd();
const tsxCli = path.join(root, 'node_modules/tsx/dist/cli.mjs');
const serverEntry = path.join(root, 'server/src/index.ts');

const MODEL_ENV_KEYS = [
  'VOLCENGINE_API_KEY',
  'VOLCENGINE_BASE_URL',
  'DOUBAO_ENDPOINT_ID',
  'DEEPSEEK_ENDPOINT_ID',
  'VOLCENGINE_ENDPOINT_ID',
  'GAME_MODEL',
  'ALLOWED_MODEL_HOSTS',
  'ALLOW_LOCAL_MODEL_HOSTS',
  'MODEL_TIMEOUT_MS',
  'MODEL_TEST_TIMEOUT_MS',
  'PORT',
  'VERCEL',
];

export function getFreePort() {
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

export function buildTestEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of MODEL_ENV_KEYS) delete env[key];
  delete env.NODE_OPTIONS;
  return { ...env, NODE_ENV: 'test', ...overrides };
}

/**
 * @param {{
 *   stubUrl?: string,
 *   gameModel?: string,
 *   noModel?: boolean,
 *   real?: boolean,
 *   port?: number,
 *   readyTimeoutMs?: number,
 * }} [options]
 */
export async function startBackend(options = {}) {
  const port = options.port ?? (await getFreePort());
  const noModel = Boolean(options.noModel);
  const readyTimeoutMs = options.readyTimeoutMs ?? 20000;

  // real：读取真实 .env（用于性能基线），不覆盖模型环境变量
  const env = options.real
    ? (() => {
        const next = { ...process.env };
        delete next.NODE_OPTIONS;
        delete next.VERCEL;
        return {
          ...next,
          NODE_ENV: 'bench',
          PORT: String(port),
          METRICS_ENABLED: '1',
        };
      })()
    : buildTestEnv({
        PORT: String(port),
        VOLCENGINE_API_KEY: noModel ? '' : 'test-key',
        VOLCENGINE_BASE_URL: options.stubUrl || '',
        DOUBAO_ENDPOINT_ID: noModel ? '' : 'ep-doubao-test',
        DEEPSEEK_ENDPOINT_ID: noModel ? '' : 'ep-deepseek-test',
        GAME_MODEL: noModel ? '' : options.gameModel || 'deepseek',
        ALLOW_LOCAL_MODEL_HOSTS: '1',
        MODEL_TEST_TIMEOUT_MS: '2000',
        MODEL_TIMEOUT_MS: '15000',
        METRICS_ENABLED: '1',
      });

  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: path.join(root, 'server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + readyTimeoutMs;

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`本地后端启动失败：\n${log.slice(-2000)}`);
    }
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) {
        return {
          baseUrl,
          port,
          getLog: () => log,
          stop: () => stopChild(child),
        };
      }
    } catch {
      // 继续等待
    }
    await sleep(150);
  }

  child.kill('SIGKILL');
  throw new Error(`本地后端在 ${readyTimeoutMs}ms 内未就绪：\n${log.slice(-2000)}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const timeout = sleep(3000).then(() => 'timeout');
  const result = await Promise.race([exited, timeout]);
  if (result === 'timeout') {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

export async function postJson(baseUrl, apiPath, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}
