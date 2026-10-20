/**
 * 生成路径集成测试（真实 Hono 路由 + 本地 OpenAI 兼容测试桩）。
 *
 * 覆盖：正常生成、Prompt 契约、参数校验、模型失败降级、模型目录。
 */

import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createStubServer } from '../support/stub-model-server.mjs';
import { startBackend, postJson } from '../support/backend.mjs';
import { customModel } from '../support/fixtures.mjs';

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

test('GEN-01 正常生成成功且不带 Remix 字段', async () => {
  stub.reset();
  const res = await postJson(backend.baseUrl, '/api/generate', {
    templateId: 'space',
    userPrompt: '做一个太空收集游戏',
    modelConfig: customModel(stub.chatUrl),
  });

  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  assert.match(res.json?.data?.gameHtml || '', /<html/i);
  assert.equal(res.json?.data?.modelSource, 'custom');
  assert.equal(res.json?.data?.engine, 'volcengine');
  for (const key of ['remixMode', 'remixAudit', 'remixFallback']) {
    assert.equal(key in (res.json?.data || {}), false, `普通生成不应包含 ${key}`);
  }
});

test('GEN-02 普通生成 Prompt 与输出上限保持 V3.1/V3.2 契约', async () => {
  const captured = stub.getLastRequest();
  assert.ok(captured, '测试桩应捕获到上游请求');
  const messages = captured.messages || [];
  const system = String(messages.find((m) => m.role === 'system')?.content || '');
  const user = String(messages.find((m) => m.role === 'user')?.content || '');

  for (const rule of [
    '儿童游戏生成专家',
    '至少包含 3 种交互',
    '得分系统',
    '胜利/失败',
    '默认生成「收集类」游戏',
    '移动端适配',
  ]) {
    assert.ok(system.includes(rule), `System Prompt 缺少规则：${rule}`);
  }
  assert.ok(user.includes('这是一个关于太空的游戏'), 'User Prompt 缺少模板提示');
  assert.ok(user.includes('做一个太空收集游戏'));
  assert.equal(captured.max_tokens, 8192);
  assert.equal(captured.temperature, 0.7);
});

test('GEN-03 空 prompt 返回 400', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', {
    templateId: 'animal',
    userPrompt: '   ',
    modelConfig: customModel(stub.chatUrl),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json?.success, false);
  assert.match(res.json?.message || '', /创意/);
});

test('GEN-04 非法 JSON 返回 400 而不是 500', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', '{not json');
  assert.equal(res.status, 400);
  assert.equal(res.json?.success, false);
});

test('GEN-05 自定义模型非法地址被白名单拦截', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', {
    templateId: 'animal',
    userPrompt: '做一个动物游戏',
    modelConfig: {
      id: 'custom-bad',
      name: '非法地址',
      baseUrl: 'http://evil.example.com/v1/chat/completions',
      model: 'bad',
      apiKey: 'test-key',
    },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json?.success, false);
  assert.match(res.json?.message || '', /白名单/);
});

test('GEN-06 上游 500 时普通生成降级本地模板', async () => {
  const res = await postJson(backend.baseUrl, '/api/generate', {
    templateId: 'animal',
    userPrompt: '做一个动物游戏',
    modelConfig: customModel(stub.chatUrl, 'stub-force-500'),
  });
  assert.equal(res.status, 200);
  assert.equal(res.json?.success, true);
  assert.equal(res.json?.data?.engine, 'mock');
  assert.match(res.json?.data?.warning || '', /降级为本地模板/);
  assert.match(res.json?.data?.gameHtml || '', /<html/i);
});

test('GEN-07 模型目录接口正常且不回显 API Key', async () => {
  const res = await fetch(`${backend.baseUrl}/api/models`);
  const text = await res.text();
  const data = JSON.parse(text);

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.data?.models));
  assert.ok(data.data.models.length >= 1);
  assert.equal(data.data.hasServerApiKey, true);
  assert.ok(!text.includes('test-key'), '响应不应回显 API Key');
  assert.ok(!text.includes('apiKey'), '响应不应包含 apiKey 字段');
});
