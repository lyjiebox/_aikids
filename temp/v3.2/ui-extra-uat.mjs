/**
 * V3.2 补充 UI 验收：新标签页、移动端布局、旧作品兼容
 *
 * 运行：node temp/v3.2/ui-extra-uat.mjs
 * 前置：Chrome CDP 9222、Vite 3000、后端 4000
 */

const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3000';

const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectTo(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
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
  };

  const waitFor = async (expression, label, timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        // 导航中
      }
      await sleep(120);
    }
    throw new Error(`等待超时：${label}`);
  };

  const navigate = async (path) => {
    await send('Page.navigate', { url: `${APP}${path}` });
    await waitFor(
      `document.readyState === 'complete' && !!document.querySelector('#root')`,
      path
    );
  };

  await send('Page.enable');
  await send('Runtime.enable');
  return { ws, send, evaluate, waitFor, navigate };
}

function setSelectExpr(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`;
}

async function main() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const mainTarget = targets.find((target) => target.type === 'page');
  const mainPage = await connectTo(mainTarget);
  const { evaluate, waitFor, navigate, send } = mainPage;

  // 清空并进入首页
  await navigate('/');
  await evaluate('localStorage.clear(); sessionStorage.clear(); true');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!document.querySelector('.model-picker-select')`, '首页');
  await evaluate(setSelectExpr('.model-picker-select', 'doubao'));
  await waitFor(`sessionStorage.getItem('aikids-selected-model') === 'doubao'`, '选择 doubao');

  // ------------------------------------------------------------
  // 新标签页回到「环境变量」
  // ------------------------------------------------------------
  const newTarget = await (
    await fetch(`${CDP}/json/new?${encodeURIComponent(APP + '/')}`, {
      method: 'PUT',
    })
  ).json();
  const newPage = await connectTo(newTarget);
  await newPage.waitFor(`!!document.querySelector('.model-picker-select')`, '新标签页首页');
  const newTabState = await newPage.evaluate(`(() => ({
    value: document.querySelector('.model-picker-select').value,
    selected: sessionStorage.getItem('aikids-selected-model'),
  }))()`);
  record(
    '6.1.9',
    '新标签页默认回到环境变量',
    newTabState.value === '' && newTabState.selected === null,
    `value=${newTabState.value}`
  );
  newPage.ws.close();
  await fetch(`${CDP}/json/close/${newTarget.id}`);

  // ------------------------------------------------------------
  // 移动端布局
  // ------------------------------------------------------------
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate('/');
  await waitFor(`!!document.querySelector('.model-picker')`, '移动端首页');
  const homeOverflow = await evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    pickerWidth: document.querySelector('.model-picker').getBoundingClientRect().width,
  }))()`);
  record(
    '6.1.13',
    '移动端首页无横向溢出',
    homeOverflow.scrollWidth <= homeOverflow.innerWidth + 1,
    `${homeOverflow.scrollWidth}/${homeOverflow.innerWidth}`
  );

  await navigate('/settings/models');
  await waitFor(`!!document.querySelector('.models-page')`, '模型配置页');
  // 同一会话已验证过则不会是家长验证；否则解一次
  const isGate = await evaluate(`!!document.querySelector('.parentgate-question')`);
  if (isGate) {
    const question = await evaluate(`document.querySelector('.parentgate-question').textContent`);
    const match = question.match(/(\d+)\s*\+\s*(\d+)/);
    const answer = Number(match[1]) + Number(match[2]);
    await evaluate(`(() => {
      const el = document.querySelector('.parentgate-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(String(answer))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await evaluate(`document.querySelector('.parentgate-btn-confirm').click(); true`);
    await waitFor(`!!document.querySelector('.models-page:not(.auth)')`, '验证后');
  }
  await waitFor(`!!document.querySelector('.models-page:not(.auth)')`, '模型配置内容');
  const modelsOverflow = await evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    advanced: [...document.querySelectorAll('.advanced-row')].length,
  }))()`);
  record(
    '6.2.22',
    '移动端模型配置页无横向溢出',
    modelsOverflow.scrollWidth <= modelsOverflow.innerWidth + 1,
    `${modelsOverflow.scrollWidth}/${modelsOverflow.innerWidth}`
  );
  record('6.4.5', '移动端高级配置占位完整', modelsOverflow.advanced === 3, `rows=${modelsOverflow.advanced}`);

  await send('Emulation.clearDeviceMetricsOverride');

  // ------------------------------------------------------------
  // 旧作品兼容
  // ------------------------------------------------------------
  await evaluate(`localStorage.setItem('aikids-works', JSON.stringify([{
    id: 'old-work-1',
    title: '旧版作品',
    templateId: 'animal',
    userPrompt: '旧作品',
    gameHtml: '<!DOCTYPE html><html><body>old</body></html>',
    engine: 'mock',
    createdAt: Date.now(),
    playCount: 2
  }])); true`);
  await navigate('/gallery');
  await waitFor(`!!document.querySelector('.game-card')`, '旧作品卡片');
  const oldWork = await evaluate(`(() => ({
    title: document.querySelector('.game-card-title')?.textContent,
    hasModel: document.body.textContent.includes('🤖'),
  }))()`);
  record(
    '6.3.2',
    '旧作品无模型字段仍正常展示',
    oldWork.title === '旧版作品' && oldWork.hasModel === false,
    `title=${oldWork.title}`
  );

  // ------------------------------------------------------------
  // 设置 / 作品刷新持久化（StrictMode 回归）
  // ------------------------------------------------------------
  await navigate('/settings');
  await waitFor(`!!document.querySelector('.settings-page')`, '设置页');
  if (await evaluate(`!!document.querySelector('.parentgate-question')`)) {
    const question = await evaluate(`document.querySelector('.parentgate-question').textContent`);
    const match = question.match(/(\d+)\s*\+\s*(\d+)/);
    const answer = Number(match[1]) + Number(match[2]);
    await evaluate(`(() => {
      const el = document.querySelector('.parentgate-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(String(answer))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await evaluate(`document.querySelector('.parentgate-btn-confirm').click(); true`);
  }
  await waitFor(`!!document.querySelector('.setting-slider')`, '设置内容');
  await evaluate(`(() => {
    const el = document.querySelector('.setting-slider');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '45');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(`JSON.parse(localStorage.getItem('aikids-settings') || '{}').dailyTimeLimit === 45`, '设置保存');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!document.querySelector('.setting-slider')`, '刷新后设置页');
  const settingsAfterReload = await evaluate(`(() => ({
    stored: JSON.parse(localStorage.getItem('aikids-settings') || '{}').dailyTimeLimit,
    ui: Number(document.querySelector('.setting-slider').value),
  }))()`);
  record(
    '8.6.2',
    '设置刷新后仍存在',
    settingsAfterReload.stored === 45 && settingsAfterReload.ui === 45,
    `${settingsAfterReload.stored}/${settingsAfterReload.ui}`
  );

  await navigate('/gallery');
  await waitFor(`!!document.querySelector('.game-card')`, '刷新前作品');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!document.querySelector('.game-card')`, '刷新后作品');
  const worksAfterReload = await evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]').length`);
  record(
    '8.6.1',
    '作品刷新后仍存在',
    worksAfterReload === 1,
    `count=${worksAfterReload}`
  );

  mainPage.ws.close();

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\n===== 补充 UI：${passed}/${results.length} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('补充 UI 测试异常:', error);
  process.exitCode = 1;
});
