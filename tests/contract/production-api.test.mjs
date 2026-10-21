/**
 * 生产函数契约测试：直接调用 Vercel 入口 api/generate.ts 的 POST。
 *
 * 目的：api/ 是自包含实现，与 server/ 存在双实现；本测试锁定
 * 生成/Remix 的关键响应字段，防止两套实现漂移。
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createStubServer } from '../support/stub-model-server.mjs';
import { customModel, sourceGame } from '../support/fixtures.mjs';

let POST;
let stub;

before(async () => {
  // 必须在导入生产函数前准备环境，确保与 Vercel 运行时一致
  process.env.VOLCENGINE_API_KEY = 'test-key';
  process.env.VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  process.env.DOUBAO_ENDPOINT_ID = 'ep-doubao-test';
  process.env.DEEPSEEK_ENDPOINT_ID = 'ep-deepseek-test';
  process.env.GAME_MODEL = 'deepseek';
  process.env.ALLOW_LOCAL_MODEL_HOSTS = '1';
  process.env.MODEL_TIMEOUT_MS = '15000';
  process.env.MODEL_TEST_TIMEOUT_MS = '2000';
  process.env.METRICS_ENABLED = '0';

  stub = await createStubServer();
  ({ POST } = await import('../../api/generate.ts'));
});

after(async () => {
  if (stub) await stub.close();
});

async function callProduction(body) {
  const request = new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const response = await POST(request);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

test('CONTRACT-01 普通生成关键字段与本地后端一致', async () => {
  stub.reset();
  const res = await callProduction({
    templateId: 'space',
    userPrompt: '做一个太空收集游戏',
    modelConfig: customModel(stub.chatUrl),
  });

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  assert.match(res.json?.data?.gameHtml || '', /<html/i);
  assert.equal(res.json?.data?.modelSource, 'custom');
  assert.equal(res.json?.data?.engine, 'volcengine');
  assert.equal('remixMode' in (res.json?.data || {}), false);
});

test('CONTRACT-02 Remix full 关键字段与本地后端一致', async () => {
  stub.reset();
  const res = await callProduction({
    templateId: 'animal',
    userPrompt: '把星星换成宝石',
    remixFrom: 'work-original-1',
    remixInstruction: '把星星换成宝石',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customModel(stub.chatUrl, 'stub-remix'),
  });

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  const data = res.json?.data || {};
  assert.equal(data.remixMode, 'full');
  assert.ok(data.gameHtml.includes('BOSS'));
  assert.equal(data.remixProfile?.title, '星星收集大冒险');
  assert.equal(data.remixAudit?.preserved, true);
  assert.equal(data.remixAudit?.scorePreserved, true);
});

test('CONTRACT-03 空 prompt 返回 400 与稳定错误码', async () => {
  const res = await callProduction({
    templateId: 'animal',
    userPrompt: '',
    modelConfig: customModel(stub.chatUrl),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json?.success, false);
  assert.equal(res.json?.code, 'EMPTY_PROMPT');
});

test('CONTRACT-04 生产响应不回显 API Key', async () => {
  const res = await callProduction({
    templateId: 'animal',
    userPrompt: '做一个动物游戏',
    modelConfig: customModel(stub.chatUrl),
  });
  assert.ok(!res.text.includes('test-key'));
  assert.ok(!res.text.includes('apiKey'));
});

test('CONTRACT-05 非法 JSON 返回 INVALID_JSON', async () => {
  const res = await callProduction('{bad json');
  assert.equal(res.status, 400);
  assert.equal(res.json?.code, 'INVALID_JSON');
});

test('CONTRACT-06 模型输出为空时生产函数降级本地模板', async () => {
  const res = await callProduction({
    templateId: 'animal',
    userPrompt: '做一个动物游戏',
    modelConfig: customModel(stub.chatUrl, 'stub-empty'),
  });
  assert.equal(res.status, 200);
  assert.equal(res.json?.data?.engine, 'mock');
  assert.match(res.json?.data?.warning || '', /降级为本地模板/);
});
