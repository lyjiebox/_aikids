/**
 * V3.3 线上 Vercel UI 验收（Chrome CDP）
 *
 * 前置：
 *   1. Vercel 已部署 V3.3
 *   2. Chrome 以 --headless=new --remote-debugging-port=9333 启动
 * 运行：node temp/v3.3/vercel-ui-check.mjs
 *
 * 会真实调用线上模型，耗时约 1-2 分钟。
 */

import { writeFileSync } from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const APP = process.env.APP || 'https://www.boxaikids.top';

const sourceGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>云朵收集小游戏</title>
  <style>
    body { margin:0; background:linear-gradient(#87ceeb,#e0f7ff); min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:system-ui,sans-serif; }
    #score { position:fixed; top:16px; left:16px; font-size:26px; font-weight:bold; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,.25); }
    #target { font-size:88px; cursor:pointer; user-select:none; }
    #hint { position:fixed; bottom:20px; color:#fff; font-size:15px; }
    #over { position:fixed; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; background:rgba(0,0,0,.55); color:#fff; }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div id="target">☁️</div>
  <div id="hint">点击云朵得分，收集 8 朵胜利，30 秒内没收集完就失败</div>
  <div id="over"><h1 id="result">胜利！</h1><button id="restart">再玩一次</button></div>
  <!-- SFX: collect -->
  <script>
    let score = 0;
    let timeLeft = 30;
    let playing = true;
    const target = document.getElementById('target');
    const scoreEl = document.getElementById('score');
    const overEl = document.getElementById('over');
    const resultEl = document.getElementById('result');

    function endGame(win) {
      if (!playing) return;
      playing = false;
      resultEl.textContent = win ? '胜利！' : '失败！';
      overEl.style.display = 'flex';
    }

    target.addEventListener('click', () => {
      if (!playing) return;
      score += 1;
      scoreEl.textContent = '得分：' + score;
      if (score >= 8) endGame(true);
    });

    setInterval(() => {
      if (!playing) return;
      timeLeft -= 1;
      if (timeLeft <= 0) endGame(false);
    }, 1000);

    document.getElementById('restart').addEventListener('click', () => {
      score = 0; timeLeft = 30; playing = true;
      scoreEl.textContent = '得分：0';
      overEl.style.display = 'none';
    });
  </script>
</body>
</html>`;

const results = [];
let ws;
let nextId = 0;
const pending = new Map();
let lastDialog = '';

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') {
      lastDialog = message.params?.message || '';
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      return;
    }
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text
    );
  }
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // 页面导航中
    }
    await sleep(300);
  }
  throw new Error(`等待超时：${label}`);
}

async function navigate(path) {
  await send('Page.navigate', { url: `${APP}${path}` });
  await waitFor(
    `document.readyState === 'complete' && !!document.querySelector('#root')`,
    `导航到 ${path}`
  );
}

async function screenshot(file) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`[screenshot] ${file}`);
}

async function main() {
  await connect();
  await navigate('/');
  await evaluate('localStorage.clear(); sessionStorage.clear(); true');

  const work = {
    id: 'prod-ui-original',
    title: '云朵收集小游戏',
    templateId: 'free',
    userPrompt: '做一个点击收集云朵的游戏，30 秒内收集 8 朵胜利',
    gameHtml: sourceGame,
    engine: 'volcengine',
    modelName: 'Doubao Seed 2.0 Pro',
    modelSource: 'env',
    createdAt: Date.now() - 10000,
    playCount: 0,
    remixCount: 0,
  };
  await evaluate(
    `localStorage.setItem('aikids-works', ${JSON.stringify(JSON.stringify([work]))}); true`
  );
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!document.querySelector('#root')`, '刷新');

  await navigate('/play/prod-ui-original');
  await waitFor(`!!document.querySelector('.remix-btn')`, '线上 Remix 按钮');
  await evaluate(`document.querySelector('.remix-btn').click(); true`);
  await waitFor(`!!document.querySelector('.remix-modal-card')`, '线上 Remix 弹窗');
  await sleep(300);
  await screenshot('temp/v3.3/vercel-remix-modal.png');

  {
    const modal = await evaluate(`(() => ({
      source: document.querySelector('.remix-modal-source')?.innerText || '',
      hint: document.querySelector('.remix-modal-source-hint')?.innerText || '',
    }))()`);
    record(
      'PROD-UI-01a',
      '线上弹窗展示原游戏信息',
      modal.source.includes('基于《云朵收集小游戏》改编') &&
        modal.source.includes('点击') &&
        modal.source.includes('得分'),
      modal.source
    );
    record(
      'PROD-UI-01b',
      '线上弹窗说明只改要求的部分',
      modal.hint.includes('不会重新生成一个完全不同的游戏'),
      modal.hint
    );
  }

  await evaluate(`(() => {
    const el = document.querySelector('.remix-modal-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '把云朵换成彩虹，并加一个会扣分的闪电');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  await evaluate(`document.querySelector('.remix-modal-btn-confirm').click(); true`);

  await waitFor(
    `location.pathname.startsWith('/play/') && location.pathname !== '/play/prod-ui-original'`,
    '线上 Remix 生成完成'
  );
  await waitFor(`!!document.querySelector('.play-remix-badge')`, '线上改编标识');
  await sleep(1000);
  await screenshot('temp/v3.3/vercel-remix-play.png');

  {
    const works = await evaluate(
      `JSON.parse(localStorage.getItem('aikids-works') || '[]')`
    );
    const remixed = works.find((item) => item.remixFrom === 'prod-ui-original');
    record(
      'PROD-UI-02a',
      '线上生成并保存 Remix 作品',
      Boolean(remixed) && works.length === 2,
      `works=${works.length}`
    );
    record(
      'PROD-UI-02b',
      '线上作品含 Remix 元数据',
      remixed?.remixFromTitle === '云朵收集小游戏' &&
        remixed?.remixMode === 'full' &&
        remixed?.remixAudit?.preserved === true,
      JSON.stringify({
        mode: remixed?.remixMode,
        audit: remixed?.remixAudit,
      })
    );
    record(
      'PROD-UI-02c',
      '线上改编落到了指令且保留原结构',
      typeof remixed?.gameHtml === 'string' &&
        (remixed.gameHtml.includes('🌈') || remixed.gameHtml.includes('彩虹')) &&
        (remixed.gameHtml.includes('⚡') || remixed.gameHtml.includes('闪电')) &&
        remixed.gameHtml.includes('score'),
      `htmlLen=${remixed?.gameHtml?.length}`
    );

    const badge = await evaluate(
      `document.querySelector('.play-remix-badge')?.innerText || ''`
    );
    record(
      'PROD-UI-03a',
      '线上播放页显示改编来源与保留标识',
      badge.includes('改编自《云朵收集小游戏》') &&
        badge.includes('已保留原玩法'),
      badge
    );
  }

  await navigate('/gallery');
  await waitFor(`!!document.querySelector('.game-card')`, '线上作品列表');
  {
    const tags = await evaluate(`(() => ({
      remix: Array.from(document.querySelectorAll('.remix-tag')).map((el) => el.innerText),
      preserved: Array.from(document.querySelectorAll('.remix-preserved-tag')).map((el) => el.innerText),
    }))()`);
    record(
      'PROD-UI-04a',
      '线上作品列表显示来源与保留标签',
      tags.remix.some((item) => item.includes('改编自')) &&
        tags.preserved.some((item) => item.includes('保留原玩法')),
      `${tags.remix.join('|')} / ${tags.preserved.join('|')}`
    );
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n===== 线上 UI：${passed}/${results.length} 通过，${failed} 失败 =====`
  );
  if (failed > 0) {
    console.log('\n失败项：');
    for (const item of results.filter((entry) => !entry.ok)) {
      console.log(`- ${item.id} ${item.name} — ${item.detail}`);
    }
    process.exitCode = 1;
  }
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  try {
    ws?.close();
  } catch {
    // ignore
  }
});
