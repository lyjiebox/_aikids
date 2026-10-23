/**
 * V3.6 Settings 导出/导入 UI UAT（Chrome Headless + CDP）
 *
 * 运行：node temp/v3.6/ui-uat.mjs
 * 依赖：本地后端 :4000、前端 :3000 已启动
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const PROFILE = path.resolve('temp/v3.6/chrome-profile');
const DOWNLOADS = path.resolve('temp/v3.6/downloads');
const BASE = process.env.UAT_BASE || 'http://127.0.0.1:3000';

fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(DOWNLOADS, { recursive: true, force: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });

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
  if (condition) {
    console.log(`✅ ${name}`);
  } else {
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

const version = await waitForEndpoint(`http://127.0.0.1:${PORT}/json/version`);
const targets = await waitForEndpoint(`http://127.0.0.1:${PORT}/json/list`);
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('未找到页面 target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let messageId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
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
await cmd('Page.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: DOWNLOADS,
});

const legacyWorkA = {
  id: '1700000000000',
  title: '旧星星收集',
  templateId: 'space',
  userPrompt: '接星星',
  gameHtml: '<html><body>star</body></html>',
  createdAt: 1690000000000,
  playCount: 0,
  remixCount: 0,
};
const legacyWorkB = {
  id: '1700000000001',
  title: '旧打地鼠',
  templateId: 'animal',
  userPrompt: '打地鼠',
  gameHtml: '<html><body>mole</body></html>',
  createdAt: 1690000001000,
  playCount: 0,
  remixCount: 0,
};
const model = {
  id: 'custom-demo',
  name: 'DeepSeek 演示',
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  apiKey: 'sk-demo-not-real',
  createdAt: 1690000000000,
  updatedAt: 1690000000000,
};

await navigate(`${BASE}/`);
await evaluate(`
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('aikids-works', ${JSON.stringify(
    JSON.stringify([legacyWorkA, legacyWorkB])
  )});
  localStorage.setItem('aikids-models', ${JSON.stringify(
    JSON.stringify([model])
  )});
  localStorage.setItem('aikids-settings', JSON.stringify({ dailyTimeLimit: 30, sessionTimeLimit: 20, allowVoiceInput: true, contentFilterLevel: 'strict' }));
  sessionStorage.setItem('aikids-parent-verified', '1');
  true;
`);

await navigate(`${BASE}/settings`);
const settingsInfo = await evaluate(`(() => {
  const section = document.querySelector('.backup-section');
  const text = document.body.innerText;
  return {
    hasSection: Boolean(section),
    hasWarning: text.includes('备份文件包含自定义模型的 API Key'),
    hasTelemetry: text.includes('本地诊断日志'),
    workCount: JSON.parse(localStorage.getItem('aikids-works') || '[]').length,
  };
})()`);

check('Settings 显示数据备份区块', settingsInfo.hasSection);
check('Settings 显示 API Key 警告', settingsInfo.hasWarning);
check('Settings 显示本地诊断日志', settingsInfo.hasTelemetry);
check('种子数据为 2 个旧作品', settingsInfo.workCount === 2);

// 导出全部数据
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('导出全部数据'));
  button.click();
  return true;
})()`);
await sleep(1200);

const downloads = fs
  .readdirSync(DOWNLOADS)
  .filter((name) => name.startsWith('aikids-backup-'));
check('点击导出生成备份文件', downloads.length === 1, downloads.join(','));

let backup = null;
if (downloads.length === 1) {
  backup = JSON.parse(
    fs.readFileSync(path.join(DOWNLOADS, downloads[0]), 'utf8')
  );
  check('备份 kind 正确', backup.kind === 'aikids-export');
  check('备份含 2 个作品', backup.data.works.length === 2);
  check(
    '备份含自定义模型 API Key',
    backup.data.models[0]?.apiKey === 'sk-demo-not-real'
  );
  check(
    '旧作品 ID 保留在备份中',
    backup.data.works.some((work) => work.id === '1700000000000')
  );
}

// 合并导入：1 个新作品 + 1 个重复作品 + 1 个新模型
const incoming = {
  kind: 'aikids-export',
  app: 'aikids',
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  data: {
    works: [
      { id: 'w-new-1', title: '导入的新作品', templateId: 'free', gameHtml: '<html></html>' },
      legacyWorkA,
    ],
    settings: { dailyTimeLimit: 45 },
    models: [
      {
        id: 'custom-imported',
        name: '导入模型',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
        apiKey: 'sk-imported-key',
      },
    ],
  },
};

await evaluate(`
(() => {
  const payload = ${JSON.stringify(JSON.stringify(incoming))};
  const dt = new DataTransfer();
  dt.items.add(new File([payload], 'merge-test.json', { type: 'application/json' }));
  const input = document.querySelector('.backup-file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
`);
await sleep(800);

const modalInfo = await evaluate(`(() => ({
  hasModal: Boolean(document.querySelector('.backup-modal')),
  text: document.querySelector('.backup-modal')?.innerText || '',
}))()`);
check('导入后弹出入库确认框', modalInfo.hasModal);
check(
  '弹窗显示文件作品/模型数量',
  modalInfo.text.includes('2 个作品') && modalInfo.text.includes('1 个自定义模型'),
  modalInfo.text.replace(/\n/g, ' | ')
);

await evaluate(`(() => {
  const button = [...document.querySelectorAll('.backup-modal button')].find((item) => item.textContent.includes('合并导入'));
  button.click();
  return true;
})()`);
await sleep(800);

const afterMerge = await evaluate(`(() => {
  const works = JSON.parse(localStorage.getItem('aikids-works') || '[]');
  const models = JSON.parse(localStorage.getItem('aikids-models') || '[]');
  const settings = JSON.parse(localStorage.getItem('aikids-settings') || '{}');
  return {
    workIds: works.map((work) => work.id),
    modelIds: models.map((item) => item.id),
    dailyTimeLimit: settings.dailyTimeLimit,
    message: document.querySelector('.backup-message')?.innerText || '',
    newWorkSchema: works.find((work) => work.id === 'w-new-1'),
    legacy: works.find((work) => work.id === '1700000000000'),
  };
})()`);

check('合并导入保留旧作品', afterMerge.workIds.includes('1700000000000'));
check('合并导入保留旧 ID 不变', Boolean(afterMerge.legacy));
check('合并导入新增 1 个作品', afterMerge.workIds.includes('w-new-1'));
check('合并导入跳过重复作品', afterMerge.workIds.length === 3, afterMerge.workIds.join(','));
check('合并导入新增 1 个模型', afterMerge.modelIds.includes('custom-imported'));
check('合并导入设置生效', afterMerge.dailyTimeLimit === 45);
check(
  '合并摘要有新增/跳过计数',
  afterMerge.message.includes('新增') && afterMerge.message.includes('跳过'),
  afterMerge.message
);
check(
  '导入作品被补 schema 字段',
  afterMerge.newWorkSchema?.schemaVersion === 1 &&
    afterMerge.newWorkSchema?.visibility === 'private' &&
    afterMerge.newWorkSchema?.ownerId === null
);

// 非法导入：数据不变 + 行内错误
const beforeBad = await evaluate(
  `localStorage.getItem('aikids-works')`
);
await evaluate(`
(() => {
  const dt = new DataTransfer();
  dt.items.add(new File(['{bad json'], 'bad.json', { type: 'application/json' }));
  const input = document.querySelector('.backup-file-input');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
`);
await sleep(600);
const afterBad = await evaluate(`(() => ({
  works: localStorage.getItem('aikids-works'),
  message: document.querySelector('.backup-message')?.innerText || '',
  telemetry: JSON.parse(localStorage.getItem('aikids-telemetry') || '[]'),
}))()`);
check('非法导入不修改作品', afterBad.works === beforeBad);
check(
  '非法导入显示错误',
  afterBad.message.includes('解析失败'),
  afterBad.message
);
check(
  '非法导入记录 failure telemetry',
  afterBad.telemetry.some(
    (event) => event.type === 'failure' && event.scope === 'import'
  )
);

// 试玩事件
await navigate(`${BASE}/play/1700000000000`);
await sleep(800);
const playTelemetry = await evaluate(`
  JSON.parse(localStorage.getItem('aikids-telemetry') || '[]')
    .filter((event) => event.type === 'play')
`);
check(
  '进入播放页记录 play 事件',
  playTelemetry.some((event) => event.workId === '1700000000000'),
  JSON.stringify(playTelemetry)
);

// 诊断日志导出
await navigate(`${BASE}/settings`);
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '导出日志');
  button.click();
  return true;
})()`);
await sleep(1200);
const telemetryFiles = fs
  .readdirSync(DOWNLOADS)
  .filter((name) => name.startsWith('aikids-telemetry-'));
check('点击导出生成诊断日志文件', telemetryFiles.length === 1);
if (telemetryFiles.length === 1) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(DOWNLOADS, telemetryFiles[0]), 'utf8')
  );
  check('诊断日志 kind 正确', payload.kind === 'aikids-telemetry');
  check(
    '诊断日志不含游戏 HTML / Prompt / Key',
    !JSON.stringify(payload).includes('<html>') &&
      !JSON.stringify(payload).includes('sk-') &&
      !JSON.stringify(payload).includes('接星星')
  );
}

ws.close();
chrome.kill('SIGTERM');
await sleep(300);

console.log('');
if (failures.length > 0) {
  console.error(`❌ UI UAT 失败 ${failures.length} 项：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('✅ UI UAT 全部通过');
