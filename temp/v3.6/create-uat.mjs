/**
 * V3.6 创作 / UUID / telemetry UI UAT（Chrome Headless + CDP）
 *
 * 前置：
 * - 前端 :3000 已启动
 * - 后端 :4000 以「无可用模型」启动（生成会走本地 Mock，不消耗额度）
 *
 * 运行：node temp/v3.6/create-uat.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const PROFILE = path.resolve('temp/v3.6/chrome-create-profile');
const BASE = 'http://127.0.0.1:3000';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(path.resolve('temp/v3.6/crash'), { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--crash-dumps-dir=${path.resolve('temp/v3.6/crash')}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const failures = [];
function check(name, condition, detail = '') {
  if (condition) console.log(`✅ ${name}`);
  else {
    failures.push(`${name}${detail ? `：${detail}` : ''}`);
    console.log(`❌ ${name}${detail ? `：${detail}` : ''}`);
  }
}

async function waitForEndpoint(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error(`CDP 未就绪：${url}`);
}

await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
const targets = await waitForEndpoint(`http://127.0.0.1:${PORT}/json/list`);
const page = targets.find((target) => target.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let messageId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Page.javascriptDialogOpening') {
    cmd('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    return;
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
};

function cmd(method, params = {}) {
  const id = ++messageId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cmd('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `页面执行失败：${result.exceptionDetails.text} ${
        result.exceptionDetails.exception?.description || ''
      }`
    );
  }
  return result.result.value;
}

async function navigate(url) {
  await cmd('Page.navigate', { url });
  await sleep(1200);
}

await cmd('Page.enable');
await cmd('Runtime.enable');

await navigate(`${BASE}/`);
await evaluate(`localStorage.clear(); sessionStorage.clear(); true;`);

await navigate(`${BASE}/create?templateId=animal`);
const createInfo = await evaluate(`(() => ({
  textarea: Boolean(document.querySelector('textarea.text-input-large')),
  text: document.body.innerText,
}))()`);
check('创作页可选模板并渲染输入框', createInfo.textarea);
check('URL 预选模板进入创作页', createInfo.text.includes('动物乐园') || createInfo.text.includes('选主题'));

await evaluate(`
(() => {
  const textarea = document.querySelector('textarea.text-input-large');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, '做一个接星星的小游戏，接到 10 分就胜利');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return textarea.value;
})()
`);
await sleep(300);

await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('开始生成'));
  button.click();
  return true;
})()`);
await sleep(3000);

const created = await evaluate(`(() => {
  const works = JSON.parse(localStorage.getItem('aikids-works') || '[]');
  const telemetry = JSON.parse(localStorage.getItem('aikids-telemetry') || '[]');
  return {
    work: works[0] || null,
    count: works.length,
    telemetry,
    path: location.pathname,
  };
})()`);

check('Mock 生成成功并保存 1 个作品', created.count === 1, JSON.stringify(created.work?.id));
check('新作品 ID 为 UUID v4', UUID_RE.test(created.work?.id || ''), created.work?.id || '');
check(
  '新作品补齐 schema / owner / visibility',
  created.work?.schemaVersion === 1 &&
    created.work?.ownerId === null &&
    created.work?.visibility === 'private'
);
check('生成成功跳转播放页', created.path === `/play/${created.work?.id}`, created.path);
check(
  '记录 generate telemetry（Mock / ok=false）',
  created.telemetry.some(
    (event) =>
      event.type === 'generate' &&
      event.mode === 'create' &&
      event.engine === 'mock' &&
      event.ok === false
  ),
  JSON.stringify(created.telemetry.filter((event) => event.type === 'generate'))
);
check(
  'generate telemetry 不包含 Prompt / HTML',
  !JSON.stringify(created.telemetry).includes('接星星') &&
    !JSON.stringify(created.telemetry).includes('<html')
);

// Remix：确认时先记录 remix 事件；无模型时后端保留原游戏
await evaluate(`document.querySelector('.remix-btn').click(); true;`);
await sleep(400);
const modalOpen = await evaluate(`Boolean(document.querySelector('.remix-modal-input'))`);
check('播放页可打开 Remix 弹窗', modalOpen);

await evaluate(`
(() => {
  const input = document.querySelector('.remix-modal-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, '把星星换成宝石');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input.value;
})()
`);
await sleep(300);
await evaluate(`document.querySelector('.remix-modal-btn-confirm').click(); true;`);
await sleep(1500);

const remixEvents = await evaluate(`
  JSON.parse(localStorage.getItem('aikids-telemetry') || '[]')
    .filter((event) => event.type === 'remix')
`);
check(
  '确认 Remix 记录 remix 事件（只记长度）',
  remixEvents.length === 1 &&
    remixEvents[0].instructionChars === '把星星换成宝石'.length &&
    !JSON.stringify(remixEvents).includes('宝石'),
  JSON.stringify(remixEvents)
);

await sleep(2500);
const afterRemix = await evaluate(`(() => {
  const works = JSON.parse(localStorage.getItem('aikids-works') || '[]');
  const telemetry = JSON.parse(localStorage.getItem('aikids-telemetry') || '[]');
  return {
    count: works.length,
    path: location.pathname,
    generateEvents: telemetry.filter((event) => event.type === 'generate'),
  };
})()`);
check('无模型 Remix 不产生重复作品', afterRemix.count === 1, String(afterRemix.count));
check(
  'Remix 失败/保留原游戏也记录 generate 事件',
  afterRemix.generateEvents.some((event) => event.mode === 'remix'),
  JSON.stringify(afterRemix.generateEvents)
);

ws.close();
chrome.kill('SIGTERM');
await sleep(300);

console.log('');
if (failures.length > 0) {
  console.error(`❌ 创作 UI UAT 失败 ${failures.length} 项：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('✅ 创作 UI UAT 全部通过');
