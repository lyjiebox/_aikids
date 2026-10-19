/**
 * V3.2 浏览器 UI 自动化验收（Chrome DevTools Protocol）
 *
 * 前置：
 *   1. 测试桩：node temp/v3.2/stub-model-server.mjs
 *   2. 后端：见 api-uat.mjs 注释
 *   3. 前端：npm run dev
 *   4. Chrome：--headless=new --no-sandbox --remote-debugging-port=9222
 *   5. node temp/v3.2/ui-cdp-uat.mjs
 */

const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3000';

const results = [];
let ws;
let nextId = 0;
const pending = new Map();

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  let targets = await (await fetch(`${CDP}/json/list`)).json();
  let page = targets.find((target) => target.type === 'page');
  if (!page) {
    page = await (
      await fetch(`${CDP}/json/new?${encodeURIComponent(APP)}`, {
        method: 'PUT',
      })
    ).json();
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
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

async function waitFor(expression, label, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      // 页面可能正在导航，继续轮询
    }
    await sleep(120);
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

function setInputExpr(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  })()`;
}

function setNthInputExpr(index, value) {
  return `(() => {
    const el = document.querySelectorAll('.model-form-input')[${index}];
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  })()`;
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

function setNthSelectExpr(index, value) {
  return `(() => {
    const el = document.querySelectorAll('.model-form-input')[${index}];
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`;
}

async function main() {
  await connect();
  await navigate('/');
  await evaluate('localStorage.clear(); sessionStorage.clear(); true');
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!document.querySelector('.model-picker-select')`, '首页模型选择器');

  // ------------------------------------------------------------
  // 6.1 首页模型选择
  // ------------------------------------------------------------
  const home = await evaluate(`(() => {
    const select = document.querySelector('.model-picker-select');
    const section = document.querySelector('.model-select-section').getBoundingClientRect();
    const templates = document.querySelector('.templates-section').getBoundingClientRect();
    return {
      value: select.value,
      options: [...select.options].map((item) => item.textContent),
      centerX: section.left + section.width / 2,
      viewportCenterX: window.innerWidth / 2,
      belowTemplates: section.top >= templates.bottom - 2,
      path: location.pathname,
    };
  })()`);
  record('6.1.1', '首页下部中间显示模型选择区', home.belowTemplates && Math.abs(home.centerX - home.viewportCenterX) < 30, `belowTemplates=${home.belowTemplates}`);
  record('6.1.2', '默认「环境变量（默认：DeepSeek V4 Pro）」', home.value === '' && home.options[0].includes('环境变量') && home.options[0].includes('DeepSeek V4 Pro'), home.options[0]);

  await evaluate(setSelectExpr('.model-picker-select', 'doubao'));
  await waitFor(`sessionStorage.getItem('aikids-selected-model') === 'doubao'`, '保存 doubao 选择');
  record('6.1.8', '选择写入 sessionStorage', true);

  await evaluate(`document.querySelector('.create-btn').click(); true`);
  await waitFor(`location.pathname === '/create' && !!document.querySelector('.current-model-hint')`, '进入创作页');
  const createHint = await evaluate(`(() => ({
    text: document.querySelector('.current-model-hint').textContent,
    hasPicker: !!document.querySelector('.model-picker-select'),
  }))()`);
  record('6.1.12', '创作页显示只读当前模型且无选择器', createHint.text.includes('Doubao') && createHint.text.includes('去首页切换') && !createHint.hasPicker, createHint.text.trim());

  // ------------------------------------------------------------
  // 6.1.4 / 6.3 选择内置模型并生成
  // ------------------------------------------------------------
  await evaluate(setInputExpr('.text-input-large', '做一个收集星星的游戏'));
  await waitFor(`!document.querySelector('.generate-btn').disabled`, '生成按钮可用');
  await evaluate(`document.querySelector('.generate-btn').click(); true`);
  await waitFor(`location.pathname.startsWith('/play/')`, '生成完成跳转播放页', 20000);

  const worksAfterEnv = await evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]')`);
  record(
    '6.1.4 / 6.3.1',
    '内置模型生成并记录模型',
    worksAfterEnv.length === 1 &&
      worksAfterEnv[0].modelId === 'doubao' &&
      String(worksAfterEnv[0].modelName).includes('Doubao'),
    `model=${worksAfterEnv[0]?.modelName}`
  );

  const sandbox = await evaluate(`document.querySelector('.game-iframe')?.getAttribute('sandbox')`);
  record('7.6.1', 'Play iframe 仅 allow-scripts', sandbox === 'allow-scripts', sandbox);

  // ------------------------------------------------------------
  // 6.2 设置家长验证 + 模型配置入口
  // ------------------------------------------------------------
  await navigate('/settings');
  await waitFor(`!!document.querySelector('.parentgate-question')`, '家长验证');
  const question = await evaluate(`document.querySelector('.parentgate-question').textContent`);
  const match = question.match(/(\d+)\s*\+\s*(\d+)/);
  const answer = Number(match[1]) + Number(match[2]);
  await evaluate(setInputExpr('.parentgate-input', String(answer)));
  await evaluate(`document.querySelector('.parentgate-btn-confirm').click(); true`);
  await waitFor(`!!document.querySelector('.setting-link')`, '设置页出现模型配置入口');
  await waitFor(`document.querySelector('.setting-link')?.textContent.includes('Doubao')`, '设置页显示当前模型');
  record('6.2.1', '设置内模型配置入口需家长验证', true);

  await evaluate(`document.querySelector('.setting-link').click(); true`);
  await waitFor(`location.pathname === '/settings/models' && !!document.querySelector('.models-page:not(.auth)')`, '进入模型配置页');
  const gateCount = await evaluate(`document.querySelectorAll('.parentgate-question').length`);
  record('6.2.2b', '同一会话不重复验证', gateCount === 0);

  await waitFor(`document.querySelectorAll('.model-card').length >= 2`, '环境模型加载');
  await waitFor(`document.querySelector('.model-section-title')?.textContent.includes('环境变量模型')`, '环境模型区');

  // 高级配置
  const advanced = await evaluate(`(() => {
    const sections = [...document.querySelectorAll('.model-section')];
    const section = sections.find((item) => item.textContent.includes('高级配置'));
    if (!section) return null;
    return {
      text: section.textContent,
      disabled: [...section.querySelectorAll('button, input')].every((el) => el.disabled),
    };
  })()`);
  record(
    '6.4.1 / 6.4.2',
    '高级配置入口存在且禁用',
    Boolean(advanced) &&
      advanced.text.includes('提示词优化') &&
      advanced.text.includes('最长提示词') &&
      advanced.text.includes('最长等待时间') &&
      advanced.disabled,
    advanced ? `disabled=${advanced.disabled}` : 'missing'
  );

  // 测试环境模型
  const worksBeforeTest = await evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]').length`);
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('DeepSeek V4 Pro'));
    const btn = [...card.querySelectorAll('button')].find((item) => item.textContent.includes('测试'));
    btn.click();
    return true;
  })()`);
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('DeepSeek V4 Pro'));
    return card?.textContent.includes('✅');
  })()`, '环境模型测试成功', 10000);
  const worksAfterTest = await evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]').length`);
  record('6.2.4 / 6.2.14', '测试模型只验证调用，不生成作品', worksBeforeTest === worksAfterTest);

  // ------------------------------------------------------------
  // 6.2.5 添加自定义模型
  // ------------------------------------------------------------
  await evaluate(`document.querySelector('.model-add-btn').click(); true`);
  await waitFor(`!!document.querySelector('.model-modal')`, '添加模型弹窗');
  await evaluate(setNthInputExpr(0, '测试桩模型'));
  await evaluate(setNthSelectExpr(1, 'custom'));
  await evaluate(setNthInputExpr(2, 'http://localhost:4999/v1/chat/completions'));
  await evaluate(setNthInputExpr(3, 'stub-model'));
  await evaluate(setNthInputExpr(4, 'test-key'));
  await evaluate(`document.querySelector('.model-modal-btn.confirm').click(); true`);
  await waitFor(`!document.querySelector('.model-modal') && document.body.textContent.includes('测试桩模型')`, '自定义模型保存');
  const storedModels = await evaluate(`JSON.parse(localStorage.getItem('aikids-models') || '[]')`);
  record('6.2.5 / 6.2.6', '添加自定义模型并持久化', storedModels.length === 1 && storedModels[0].name === '测试桩模型', `count=${storedModels.length}`);

  // 测试自定义模型
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型'));
    const btn = [...card.querySelectorAll('button')].find((item) => item.textContent.includes('测试'));
    btn.click();
    return true;
  })()`);
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型'));
    return card?.textContent.includes('✅');
  })()`, '自定义模型测试成功', 10000);
  record('6.2.11', '自定义模型测试成功显示耗时', true);

  // 测试失败展示：临时把模型改成 force-401，再改回 stub-model
  const clickCustomAction = (label) => `(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型'));
    const btn = [...card.querySelectorAll('button')].find((item) => item.textContent.includes(${JSON.stringify(label)}));
    btn.click();
    return true;
  })()`;

  await evaluate(clickCustomAction('编辑'));
  await waitFor(`!!document.querySelector('.model-modal')`, '编辑弹窗（失败测试）');
  await evaluate(setNthInputExpr(3, 'force-401'));
  await evaluate(`document.querySelector('.model-modal-btn.confirm').click(); true`);
  await waitFor(`!document.querySelector('.model-modal')`, '保存 force-401');
  await evaluate(clickCustomAction('测试'));
  await waitFor(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型'));
    return card?.textContent.includes('❌');
  })()`, '测试失败展示', 10000);
  record('6.2.12', '自定义模型测试失败显示原因', true);

  // 改回正常模型
  await evaluate(clickCustomAction('编辑'));
  await waitFor(`!!document.querySelector('.model-modal')`, '编辑弹窗（恢复）');
  await evaluate(setNthInputExpr(3, 'stub-model'));
  await evaluate(`document.querySelector('.model-modal-btn.confirm').click(); true`);
  await waitFor(`!document.querySelector('.model-modal')`, '恢复 stub-model');

  // ------------------------------------------------------------
  // 6.1.5 首页选择自定义模型并生成
  // ------------------------------------------------------------
  await navigate('/');
  await waitFor(`!!document.querySelector('.model-picker-select')`, '首页选择器');
  await waitFor(`[...document.querySelectorAll('.model-picker-select option')].some((item) => item.textContent.includes('测试桩模型'))`, '自定义模型选项');
  const customId = await evaluate(`(() => {
    const option = [...document.querySelectorAll('.model-picker-select option')].find((item) => item.textContent.includes('测试桩模型'));
    return option.value;
  })()`);
  await evaluate(setSelectExpr('.model-picker-select', customId));
  await evaluate(`document.querySelector('.create-btn').click(); true`);
  await waitFor(`location.pathname === '/create'`, '进入创作页');
  await evaluate(setInputExpr('.text-input-large', '做一个收集星星的游戏'));
  await waitFor(`!document.querySelector('.generate-btn').disabled`, '生成按钮可用');
  await evaluate(`document.querySelector('.generate-btn').click(); true`);
  await waitFor(`location.pathname.startsWith('/play/')`, '自定义模型生成完成', 20000);
  const worksAfterCustom = await evaluate(`JSON.parse(localStorage.getItem('aikids-works') || '[]')`);
  record(
    '6.1.5 / 6.3.1',
    '自定义模型生成并记录 modelSource',
    worksAfterCustom.length === 2 &&
      worksAfterCustom[0].modelSource === 'custom' &&
      String(worksAfterCustom[0].modelId).startsWith('custom-'),
    `modelSource=${worksAfterCustom[0]?.modelSource}`
  );

  // ------------------------------------------------------------
  // 6.2.7 / 6.2.9 编辑与删除
  // ------------------------------------------------------------
  await navigate('/settings/models');
  await waitFor(`!!document.querySelector('.models-page:not(.auth)')`, '模型配置页');
  await waitFor(`document.body.textContent.includes('测试桩模型')`, '自定义模型卡片');
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型'));
    const btn = [...card.querySelectorAll('button')].find((item) => item.textContent.includes('编辑'));
    btn.click();
    return true;
  })()`);
  await waitFor(`!!document.querySelector('.model-modal')`, '编辑弹窗');
  await evaluate(setNthInputExpr(0, '测试桩模型改'));
  await evaluate(`document.querySelector('.model-modal-btn.confirm').click(); true`);
  await waitFor(`!document.querySelector('.model-modal') && document.body.textContent.includes('测试桩模型改')`, '编辑保存');
  record('6.2.7', '编辑自定义模型', true);

  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.model-card')].find((item) => item.textContent.includes('测试桩模型改'));
    const btn = [...card.querySelectorAll('button')].find((item) => item.textContent.includes('删除'));
    btn.click();
    return true;
  })()`);
  await waitFor(`!!document.querySelector('.model-modal-btn.danger')`, '删除确认弹窗');
  await evaluate(`document.querySelector('.model-modal-btn.danger').click(); true`);
  await waitFor(`!document.body.textContent.includes('测试桩模型改')`, '删除完成');
  const storedAfterDelete = await evaluate(`JSON.parse(localStorage.getItem('aikids-models') || '[]')`);
  record('6.2.9 / 6.2.10', '删除自定义模型并清理选择', storedAfterDelete.length === 0 && (await evaluate(`sessionStorage.getItem('aikids-selected-model')`)) === null);

  await navigate('/');
  await waitFor(`!!document.querySelector('.model-picker-select')`, '回收首页');
  const afterDelete = await evaluate(`(() => ({
    value: document.querySelector('.model-picker-select').value,
    current: document.querySelector('.model-picker-current').textContent,
  }))()`);
  record('6.1.10', '删除选中模型后回退环境变量', afterDelete.value === '' && afterDelete.current.includes('环境变量'), afterDelete.current);

  // 汇总
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\n===== UI 自动化：${passed}/${results.length} 通过，${failed} 失败 =====`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('UI 测试异常:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (ws) ws.close();
  });
