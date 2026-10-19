/**
 * V3.3 Remix UI 自动化验收（Chrome DevTools Protocol）
 *
 * 前置：
 *   1. node temp/v3.3/stub-remix-server.mjs
 *   2. 本地 server/ 指向 stub（见 api-uat.mjs）
 *   3. npm run dev（http://localhost:3000）
 *   4. Chrome：--headless=new --remote-debugging-port=9333
 *   5. node temp/v3.3/ui-remix-uat.mjs
 */

import { sourceGame } from './fixtures.mjs';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const APP = process.env.APP || 'http://localhost:3000';
const STUB = 'http://localhost:4998';

const results = [];
let ws;
let nextId = 0;
const pending = new Map();
let lastDialogMessage = '';

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('没有可用的 Chrome page target');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    // 自动关闭 alert，并记录文案
    if (message.method === 'Page.javascriptDialogOpening') {
      lastDialogMessage = message.params?.message || '';
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
    const text =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      'evaluate failed';
    throw new Error(text);
  }
  return result.result.value;
}

async function waitFor(expression, label, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // 页面可能正在导航
    }
    await sleep(150);
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

async function reload() {
  await send('Page.reload', { ignoreCache: true });
  await waitFor(
    `document.readyState === 'complete' && !!document.querySelector('#root')`,
    '刷新页面'
  );
}

function setTextareaExpr(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  })()`;
}

async function getWorks() {
  return evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]')`);
}

async function seedOriginal() {
  const work = {
    id: 'ui-original',
    title: '星星收集大冒险',
    templateId: 'animal',
    userPrompt: '做一个收集星星的游戏',
    gameHtml: sourceGame,
    engine: 'volcengine',
    modelId: 'deepseek',
    modelName: 'DeepSeek V4 Pro',
    modelSource: 'env',
    createdAt: Date.now() - 10000,
    playCount: 0,
    generationTime: 3,
    remixCount: 0,
  };
  await evaluate(
    `localStorage.setItem('aikids-works', ${JSON.stringify(JSON.stringify([work]))}); true`
  );
}

async function openRemixModal() {
  await evaluate(`(() => {
    const btn = document.querySelector('.remix-btn');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await waitFor(`!!document.querySelector('.remix-modal-card')`, 'Remix 弹窗');
  await sleep(100);
}

async function confirmRemix(instruction) {
  await evaluate(setTextareaExpr('.remix-modal-input', instruction));
  await sleep(100);
  await evaluate(`(() => {
    const btn = document.querySelector('.remix-modal-btn-confirm');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

async function getLastRequest() {
  const res = await fetch(`${STUB}/last-request`);
  return res.json();
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  await connect();
  await navigate('/');
  await evaluate('localStorage.clear(); sessionStorage.clear(); true');
  await seedOriginal();
  await reload();

  // ------------------------------------------------------------
  // UI-01 Remix 弹窗信息
  // ------------------------------------------------------------
  await navigate('/play/ui-original');
  await waitFor(`!!document.querySelector('.remix-btn')`, '播放页 Remix 按钮');
  await openRemixModal();

  {
    const modal = await evaluate(`(() => {
      const card = document.querySelector('.remix-modal-card');
      const source = document.querySelector('.remix-modal-source');
      const preserve = document.querySelector('.remix-modal-preserve');
      const hint = document.querySelector('.remix-modal-source-hint');
      const quick = document.querySelectorAll('.remix-quick-idea');
      return {
        text: card ? card.innerText : '',
        sourceText: source ? source.innerText : '',
        preserveText: preserve ? preserve.innerText : '',
        hintText: hint ? hint.innerText : '',
        quickCount: quick.length,
      };
    })()`);

    record(
      'UI-01a',
      '弹窗展示原游戏标题',
      modal.sourceText.includes('基于《星星收集大冒险》改编'),
      modal.sourceText
    );
    record(
      'UI-01b',
      '弹窗展示将保留的结构标签',
      modal.preserveText.includes('点击') &&
        modal.preserveText.includes('得分') &&
        modal.preserveText.includes('胜负'),
      modal.preserveText
    );
    record(
      'UI-01c',
      '弹窗说明只改要求的部分',
      modal.hintText.includes('不会重新生成一个完全不同的游戏'),
      modal.hintText
    );
    record(
      'UI-01d',
      '提供快捷改编想法',
      modal.quickCount === 4,
      `count=${modal.quickCount}`
    );
  }

  // ------------------------------------------------------------
  // UI-02 完整源码透传 + 生成
  // ------------------------------------------------------------
  await confirmRemix('加一个 Boss');

  // 等待离开原作品播放页
  await waitFor(
    `location.pathname.startsWith('/play/') && location.pathname !== '/play/ui-original'`,
    '生成后跳转新作品',
    30000
  );
  await waitFor(`!!document.querySelector('.play-remix-badge')`, '改编来源标识', 15000);
  await sleep(500);

  {
    const captured = await getLastRequest();
    const messages = captured.messages || [];
    const user = String(
      messages.find((message) => message.role === 'user')?.content || ''
    );
    record(
      'UI-02a',
      '请求携带完整原游戏源码',
      user.includes('<game_source>') &&
        user.includes('星星收集大冒险') &&
        user.includes('let score = 0;') &&
        user.includes('setInterval'),
      `promptLen=${user.length}`
    );
    record(
      'UI-02b',
      '请求携带游戏档案与原标题',
      user.includes('- 标题：星星收集大冒险') &&
        user.includes('核心交互：点击') &&
        user.includes('得分系统：有') &&
        /本次改编要求：\s*加一个 Boss/.test(user),
      ''
    );
    record(
      'UI-02c',
      'Remix 请求使用 16384 输出上限',
      captured.max_tokens === 16384,
      String(captured.max_tokens)
    );
  }

  // ------------------------------------------------------------
  // UI-03 作品元数据
  // ------------------------------------------------------------
  let remixedWork;
  {
    const works = await getWorks();
    remixedWork = works.find((work) => work.remixFrom === 'ui-original');
    record(
      'UI-03a',
      '生成并保存了改编作品',
      Boolean(remixedWork) && works.length === 2,
      `works=${works.length}`
    );
    record(
      'UI-03b',
      '作品记录完整 Remix 元数据',
      remixedWork?.remixFromTitle === '星星收集大冒险' &&
        remixedWork?.remixMode === 'full' &&
        remixedWork?.remixInstruction === '加一个 Boss' &&
        remixedWork?.remixProfile?.interactions?.includes('点击') &&
        remixedWork?.remixAudit?.preserved === true,
      JSON.stringify({
        fromTitle: remixedWork?.remixFromTitle,
        mode: remixedWork?.remixMode,
        audit: remixedWork?.remixAudit,
      })
    );
    record(
      'UI-03c',
      '改编游戏保留原结构并加入变化',
      remixedWork?.gameHtml?.includes('BOSS') &&
        remixedWork?.gameHtml?.includes('星星收集大冒险') &&
        remixedWork?.gameHtml !== sourceGame,
      `htmlLen=${remixedWork?.gameHtml?.length}`
    );
    record(
      'UI-03d',
      '作品标题保留原游戏标题',
      remixedWork?.title === '星星收集大冒险',
      remixedWork?.title
    );
  }

  // ------------------------------------------------------------
  // UI-04 播放页来源展示
  // ------------------------------------------------------------
  {
    const badge = await evaluate(
      `document.querySelector('.play-remix-badge')?.innerText || ''`
    );
    record(
      'UI-04a',
      '播放页显示改编来源与保留标识',
      badge.includes('改编自《星星收集大冒险》') &&
        badge.includes('已保留原玩法'),
      badge
    );
  }

  // ------------------------------------------------------------
  // UI-05 作品列表来源展示
  // ------------------------------------------------------------
  await navigate('/gallery');
  await waitFor(`!!document.querySelector('.game-card')`, '作品列表');
  {
    const text = await evaluate(`(() => {
      const tags = Array.from(document.querySelectorAll('.remix-tag')).map((el) => el.innerText);
      const preserved = Array.from(document.querySelectorAll('.remix-preserved-tag')).map((el) => el.innerText);
      return { tags, preserved };
    })()`);
    record(
      'UI-05a',
      '作品列表显示改编来源',
      text.tags.some((item) => item.includes('改编自') && item.includes('星星收集大冒险')),
      text.tags.join('|')
    );
    record(
      'UI-05b',
      '作品列表显示保留原玩法',
      text.preserved.some((item) => item.includes('保留原玩法')),
      text.preserved.join('|')
    );
  }

  // ------------------------------------------------------------
  // UI-06 失败回退：不新增重复作品
  // ------------------------------------------------------------
  {
    const before = await getWorks();
    await evaluate(`(() => {
      const models = [{
        id: 'custom-fail',
        name: '失败测试模型',
        baseUrl: 'http://localhost:4998/v1/chat/completions',
        model: 'remix-force-500',
        apiKey: 'test-key',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }];
      localStorage.setItem('aikids-models', JSON.stringify(models));
      sessionStorage.setItem('aikids-selected-model', 'custom-fail');
      return true;
    })()`);

    lastDialogMessage = '';
    await navigate('/play/ui-original');
    await waitFor(`!!document.querySelector('.remix-btn')`, '失败测试播放页');
    await openRemixModal();
    await confirmRemix('加一个 Boss');

    await waitFor(
      `location.pathname === '/play/ui-original'`,
      '失败后回到原作品',
      30000
    );
    await sleep(500);

    const after = await getWorks();
    record(
      'UI-06a',
      '模型失败时提示保留原游戏',
      /保留原游戏/.test(lastDialogMessage),
      lastDialogMessage
    );
    record(
      'UI-06b',
      '模型失败时不新增重复作品',
      after.length === before.length,
      `before=${before.length}, after=${after.length}`
    );
    record(
      'UI-06c',
      '失败后回到原作品播放页',
      (await evaluate('location.pathname')) === '/play/ui-original',
      await evaluate('location.pathname')
    );

    // 恢复默认环境变量模型
    await evaluate(`sessionStorage.removeItem('aikids-selected-model'); true`);
  }

  // ------------------------------------------------------------
  // UI-07 源作品删除后仍显示来源标题
  // ------------------------------------------------------------
  {
    await navigate('/gallery');
    await waitFor(`document.querySelectorAll('.game-card').length === 2`, '删除前作品列表');

    // 通过右键菜单删除源作品（走真实 UI 与 reducer，避免直接改 storage 被状态覆盖）
    await evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('.game-card'));
      const original = cards.find((card) =>
        card.innerText.includes('星星收集大冒险') &&
        !card.innerText.includes('改编自')
      );
      if (!original) return false;
      original.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await waitFor(`!!document.querySelector('.delete-modal')`, '删除确认弹窗');
    await evaluate(`(() => {
      const btn = document.querySelector('.delete-modal .modal-btn.confirm');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await waitFor(`document.querySelectorAll('.game-card').length === 1`, '删除源作品');

    const text = await evaluate(`(() => {
      const tags = Array.from(document.querySelectorAll('.remix-tag')).map((el) => el.innerText);
      return tags;
    })()`);
    record(
      'UI-07a',
      '源作品删除后仍显示改编来源',
      text.some(
        (item) => item.includes('改编自') && item.includes('星星收集大冒险')
      ),
      text.join('|')
    );
  }

  // ------------------------------------------------------------
  // UI-08 移动端布局
  // ------------------------------------------------------------
  {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await navigate(`/play/${remixedWork.id}`);
    await waitFor(`!!document.querySelector('.remix-btn')`, '移动端播放页');
    await openRemixModal();

    const layout = await evaluate(`(() => {
      const card = document.querySelector('.remix-modal-card');
      const rect = card.getBoundingClientRect();
      const confirm = document.querySelector('.remix-modal-btn-confirm');
      const confirmRect = confirm.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: window.innerWidth,
        height: window.innerHeight,
        confirmVisible: confirmRect.width > 0 && confirmRect.height > 0,
      };
    })()`);

    record(
      'UI-08a',
      '移动端弹窗不溢出视口',
      layout.left >= 0 &&
        layout.top >= 0 &&
        layout.right <= layout.width + 1 &&
        layout.bottom <= layout.height + 1 &&
        layout.confirmVisible,
      JSON.stringify(layout)
    );

    await send('Emulation.clearDeviceMetricsOverride');
  }

  // ------------------------------------------------------------
  // UI-09 旧客户端 context（仅 preview）兼容
  // ------------------------------------------------------------
  {
    await evaluate(`(() => {
      sessionStorage.removeItem('aikids-selected-model');
      localStorage.removeItem('aikids-models');
      const legacyContext = {
        remixFrom: 'legacy-original',
        remixInstruction: '加一个 Boss',
        originalTitle: '旧版游戏',
        originalUserPrompt: '旧版描述',
        originalGameHtmlPreview: ${JSON.stringify(sourceGame.slice(0, 300))},
        templateId: 'free',
      };
      sessionStorage.setItem('aikids-remix-context', JSON.stringify(legacyContext));
      return true;
    })()`);

    const before = await getWorks();
    await send('Page.navigate', { url: `${APP}/create?remix=1` });
    await waitFor(
      `location.pathname.startsWith('/play/') && location.pathname !== '/play/ui-original'`,
      '旧客户端 Remix 生成完成',
      30000
    );
    await sleep(500);

    const works = await getWorks();
    const legacyWork = works.find((work) => work.remixFrom === 'legacy-original');
    record(
      'UI-09a',
      '仅 preview 的旧客户端仍可生成',
      Boolean(legacyWork) && works.length === before.length + 1,
      `before=${before.length}, after=${works.length}`
    );
    record(
      'UI-09b',
      '旧客户端作品记录 preview 模式',
      legacyWork?.remixMode === 'preview',
      String(legacyWork?.remixMode)
    );
  }

  // ============================================================
  // 汇总
  // ============================================================
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n===== UI 自动化：${passed}/${results.length} 通过，${failed} 失败 =====`
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
