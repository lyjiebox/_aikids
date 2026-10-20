/**
 * Remix 路径集成测试（真实 Hono 路由 + 本地测试桩）。
 *
 * 覆盖：full / outline / preview / fallback / 审计 / 纯 HTML / 异常 / 无模型。
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createStubServer } from '../support/stub-model-server.mjs';
import { startBackend, postJson } from '../support/backend.mjs';
import { sourceGame, bigGame, BIG_MARKER, customModel } from '../support/fixtures.mjs';

let stub;
let backend;

before(async () => {
  stub = await createStubServer();
  backend = await startBackend({ stubUrl: stub.chatUrl });
});

after(async () => {
  if (backend) await backend.stop();
  if (stub) await stub.close();
});

function remixBody(model = 'stub-remix', overrides = {}) {
  return {
    templateId: 'animal',
    userPrompt: '把星星换成宝石，并加一个会扣分的炸弹',
    remixFrom: 'work-original-1',
    remixInstruction: '把星星换成宝石，并加一个会扣分的炸弹',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customModel(stub.chatUrl, model),
    ...overrides,
  };
}

function findMessage(captured, role) {
  const messages = captured?.messages || [];
  return String(messages.find((m) => m.role === role)?.content || '');
}

test('REMIX-01 完整源码 Remix 成功且保留结构', async () => {
  stub.reset();
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody());

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  const data = res.json?.data || {};
  assert.equal(data.remixMode, 'full');
  assert.ok(data.gameHtml.includes('BOSS'));
  assert.equal(data.remixProfile?.title, '星星收集大冒险');
  assert.equal(data.remixProfile?.render, 'dom');
  assert.ok(data.remixProfile?.interactions?.includes('点击'));
  assert.equal(data.remixProfile?.hasScore, true);
  assert.equal(data.remixProfile?.hasWinLose, true);
  assert.equal(data.remixAudit?.preserved, true);
  assert.equal(data.remixAudit?.renderPreserved, true);
  assert.equal(data.remixAudit?.interactionsPreserved, true);
  assert.equal(data.remixAudit?.scorePreserved, true);
  assert.equal(data.remixAudit?.winLosePreserved, true);
  assert.equal(data.remixAudit?.changed, true);
});

test('REMIX-02 Remix Prompt 包含档案、完整源码与专用规则', async () => {
  const captured = stub.getLastRequest();
  assert.ok(captured);
  const system = findMessage(captured, 'system');
  const user = findMessage(captured, 'user');

  for (const rule of ['Remix 模式', '不是从零创作', '保留原游戏', '不得整体重写']) {
    assert.ok(system.includes(rule), `System Prompt 缺少：${rule}`);
  }
  for (const item of [
    '- 标题：星星收集大冒险',
    '主题模板：动物乐园',
    '渲染方式：DOM 元素',
    '核心交互：点击',
    '得分系统：有',
    '胜负条件：有',
    '<game_source>',
    'let score = 0;',
    'setInterval',
    '做一个收集星星的游戏',
    '把星星换成宝石',
  ]) {
    assert.ok(user.includes(item), `User Prompt 缺少：${item}`);
  }
  assert.equal(captured.max_tokens, 16384);
});

test('REMIX-03 超长源码进入 outline 并省略中间内容', async () => {
  stub.reset();
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix', {
    templateId: 'free',
    originalTitle: '超长源码游戏',
    originalUserPrompt: '一个很长的游戏',
    originalGameHtml: bigGame,
    remixInstruction: '加一个 Boss',
    userPrompt: '加一个 Boss',
  }));

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  assert.equal(res.json?.data?.remixMode, 'outline');

  const user = findMessage(stub.getLastRequest(), 'user');
  for (const item of ['片段 1/3', '片段 2/3', '片段 3/3', '未展示', '源码过长']) {
    assert.ok(user.includes(item), `outline Prompt 缺少：${item}`);
  }
  assert.ok(!user.includes(BIG_MARKER), '中间超长内容不应注入');
  assert.ok(user.includes('document.addEventListener'), '脚本关键内容应保留');
});

test('REMIX-04 仅 preview 时进入 preview 模式并提示不完整', async () => {
  stub.reset();
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix', {
    templateId: 'free',
    remixFrom: 'work-legacy',
    originalTitle: '旧版游戏',
    originalUserPrompt: '旧描述',
    originalGameHtml: undefined,
    originalGameHtmlPreview: sourceGame.slice(0, 300),
    remixInstruction: '加一个 Boss',
    userPrompt: '加一个 Boss',
  }));

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  assert.equal(res.json?.data?.remixMode, 'preview');
  const user = findMessage(stub.getLastRequest(), 'user');
  assert.ok(user.includes('少量源码预览'));
  assert.ok(user.includes('不完整'));
});

test('REMIX-05 模型失败时原样保留原游戏', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-force-500'));

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  const data = res.json?.data || {};
  assert.equal(data.remixFallback, true);
  assert.equal(data.remixMode, 'fallback');
  assert.equal(data.gameHtml, sourceGame);
  assert.equal(data.title, '星星收集大冒险');
  assert.match(data.warning || '', /保留原游戏/);
});

test('REMIX-06 删除得分系统时审计能识别未保留', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix-no-score'));
  assert.equal(res.status, 200);
  const data = res.json?.data || {};
  assert.equal(data.remixAudit?.scorePreserved, false);
  assert.equal(data.remixAudit?.preserved, false);
  assert.ok(data.gameHtml.length > 0, '审计失败不应拦截游戏返回');
});

test('REMIX-07 纯 HTML 输出可解析且审计通过', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix-plain'));
  assert.equal(res.status, 200);
  const data = res.json?.data || {};
  assert.ok(data.gameHtml.includes('BOSS'));
  assert.equal(data.remixAudit?.preserved, true);
});

test('REMIX-08 非字符串源码不导致 500', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix', {
    originalTitle: '异常类型',
    originalGameHtml: { foo: 'bar' },
    originalGameHtmlPreview: 123,
  }));
  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
});

test('REMIX-09 无模型时保留原游戏而不是随机 Mock', async () => {
  const isolated = await startBackend({ noModel: true });
  try {
    const res = await postJson(isolated.baseUrl, '/api/generate', remixBody('stub-remix', {
      modelConfig: undefined,
    }));
    assert.equal(res.status, 200);
    assert.equal(res.json?.success, true);
    const data = res.json?.data || {};
    assert.equal(data.remixFallback, true);
    assert.equal(data.remixMode, 'fallback');
    assert.equal(data.gameHtml, sourceGame);
    assert.match(data.warning || '', /保留原游戏/);
  } finally {
    await isolated.stop();
  }
});

test('REMIX-10 响应不回显 API Key', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', remixBody('stub-remix-no-score'));
  assert.ok(!res.text.includes('test-key'), '响应不应回显 API Key');
  assert.ok(!res.text.includes('apiKey'), '响应不应包含 apiKey 字段');
});
