/**
 * V3.5 双端一致性契约测试。
 *
 * 同一请求分别打：
 * - 本地 Hono 服务（server/src，子进程）
 * - 生产 Vercel 函数（api/generate.ts，进程内 import）
 *
 * 断言状态码、错误码、响应字段与关键内容完全一致，防止双端漂移。
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createStubServer } from '../support/stub-model-server.mjs';
import { startBackend, postJson } from '../support/backend.mjs';
import { sourceGame, customModel } from '../support/fixtures.mjs';

let stub;
let backend;
let productionGenerate;
let productionModels;

before(async () => {
  stub = await createStubServer();
  backend = await startBackend({ stubUrl: stub.chatUrl });

  // 生产函数在进程内读取 env：必须在 import 前指向测试桩
  process.env.VOLCENGINE_API_KEY = 'test-key';
  process.env.VOLCENGINE_BASE_URL = stub.chatUrl;
  process.env.DOUBAO_ENDPOINT_ID = 'ep-doubao-test';
  process.env.DEEPSEEK_ENDPOINT_ID = 'ep-deepseek-test';
  process.env.GAME_MODEL = 'deepseek';
  process.env.ALLOW_LOCAL_MODEL_HOSTS = '1';
  process.env.MODEL_TIMEOUT_MS = '15000';
  process.env.METRICS_ENABLED = '0';

  productionGenerate = (await import('../../api/generate.ts')).POST;
  productionModels = (await import('../../api/models/index.ts')).GET;
});

after(async () => {
  if (backend) await backend.stop();
  if (stub) await stub.close();
});

async function callApi(request) {
  const response = await request();
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function callApiGenerate(body) {
  return callApi(() =>
    productionGenerate(
      new Request('http://localhost/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })
    )
  );
}

function callApiModels() {
  return callApi(() =>
    productionModels(
      new Request('http://localhost/api/models', { method: 'GET' })
    )
  );
}

function callServer(body) {
  return postJson(backend.baseUrl, '/api/generate', body);
}

/** 提取需要双端一致的字段 */
function pick(json) {
  if (!json) return null;
  if (json.success === false) {
    return {
      success: json.success,
      code: json.code,
      message: json.message,
    };
  }

  const data = json.data || {};
  return {
    success: json.success,
    keys: Object.keys(data).sort(),
    title: data.title,
    gameHtml: data.gameHtml,
    engine: data.engine,
    model: data.model,
    modelName: data.modelName,
    modelSource: data.modelSource,
    warning: data.warning,
    remixMode: data.remixMode,
    remixFallback: data.remixFallback,
    remixProfile: data.remixProfile,
    remixAudit: data.remixAudit,
  };
}

async function assertParity(name, body) {
  const server = await callServer(body);
  const api = await callApiGenerate(body);
  assert.equal(api.status, server.status, `${name}: 状态码不一致`);
  assert.deepEqual(pick(api.json), pick(server.json), `${name}: 响应不一致`);
  return { server, api };
}

test('PARITY-01 普通生成', async () => {
  stub.reset();
  const { server } = await assertParity('普通生成', {
    templateId: 'space',
    userPrompt: '做一个太空收集游戏',
    modelConfig: customModel(stub.chatUrl),
  });
  assert.equal(server.status, 200);
  assert.equal(server.json?.data?.engine, 'volcengine');
});

test('PARITY-02 Remix full', async () => {
  stub.reset();
  const { server } = await assertParity('Remix full', {
    templateId: 'animal',
    userPrompt: '把星星换成宝石',
    remixFrom: 'work-original-1',
    remixInstruction: '把星星换成宝石',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customModel(stub.chatUrl, 'stub-remix'),
  });
  assert.equal(server.status, 200);
  assert.equal(server.json?.data?.remixMode, 'full');
  assert.equal(server.json?.data?.remixAudit?.preserved, true);
});

test('PARITY-03 空 Prompt', async () => {
  const { server } = await assertParity('空 Prompt', {
    templateId: 'animal',
    userPrompt: '   ',
    modelConfig: customModel(stub.chatUrl),
  });
  assert.equal(server.status, 400);
  assert.equal(server.json?.code, 'EMPTY_PROMPT');
});

test('PARITY-04 非法 JSON', async () => {
  const { server } = await assertParity('非法 JSON', '{not json');
  assert.equal(server.status, 400);
  assert.equal(server.json?.code, 'INVALID_JSON');
});

test('PARITY-05 body 不是对象', async () => {
  const { server } = await assertParity('数组 body', '[]');
  assert.equal(server.status, 400);
  assert.equal(server.json?.code, 'INVALID_BODY');
});

test('PARITY-06 未知模型', async () => {
  const { server } = await assertParity('未知模型', {
    userPrompt: '做一个游戏',
    modelId: 'not-exist',
  });
  assert.equal(server.status, 400);
  assert.equal(server.json?.code, 'MODEL_NOT_FOUND');
});

test('PARITY-07 上游 500 普通生成降级', async () => {
  const { server } = await assertParity('上游 500 普通生成', {
    templateId: 'animal',
    userPrompt: '做一个动物游戏',
    modelConfig: customModel(stub.chatUrl, 'stub-force-500'),
  });
  assert.equal(server.status, 200);
  assert.equal(server.json?.data?.engine, 'mock');
  assert.match(server.json?.data?.warning || '', /降级为本地模板/);
});

test('PARITY-08 上游 500 Remix 保留原游戏', async () => {
  const { server } = await assertParity('上游 500 Remix', {
    templateId: 'animal',
    userPrompt: '加一个 Boss',
    remixFrom: 'work-original-1',
    remixInstruction: '加一个 Boss',
    originalTitle: '星星收集大冒险',
    originalGameHtml: sourceGame,
    modelConfig: customModel(stub.chatUrl, 'stub-force-500'),
  });
  assert.equal(server.status, 200);
  assert.equal(server.json?.data?.remixFallback, true);
  assert.equal(server.json?.data?.gameHtml, sourceGame);
});

test('PARITY-09 模型目录', async () => {
  const serverRes = await fetch(`${backend.baseUrl}/api/models`);
  const serverJson = await serverRes.json();
  const api = await callApiModels();

  assert.equal(api.status, serverRes.status);
  assert.deepEqual(api.json, serverJson);
  assert.equal(api.json?.data?.defaultModelId, 'deepseek');
  assert.ok(!api.text.includes('test-key'));
  assert.ok(!api.text.includes('apiKey'));
});
