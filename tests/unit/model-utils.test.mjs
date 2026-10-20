/**
 * V3.4 模型工具函数回归测试（由 temp/v3.2/model-utils.test.mjs 迁移）
 *
 * 运行：node --import tsx --test tests/unit/model-utils.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MODEL_BASE_URL,
  MAX_CUSTOM_MODELS,
  generateModelId,
  getCurrentModelLabel,
  getHostFromUrl,
  getModelRequestParams,
  isLocalUrl,
  maskApiKey,
  validateCustomModel,
} from '../../src/services/model-utils.js';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`❌ ${name} — ${error.message}`);
  }
}

const envModels = [
  { id: 'doubao', name: 'Doubao Seed 2.0 Pro', available: true },
  { id: 'deepseek', name: 'DeepSeek V4 Pro', available: true },
];

const customModels = [
  {
    id: 'custom-1',
    name: '我的 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    apiKey: 'sk-12345678',
    createdAt: 1,
    updatedAt: 1,
  },
];

check('常量：最多 20 个自定义模型', () => {
  assert.equal(MAX_CUSTOM_MODELS, 20);
  assert.ok(DEFAULT_MODEL_BASE_URL.includes('ark.cn-beijing.volces.com'));
});

check('generateModelId 生成 custom- 前缀且唯一', () => {
  const a = generateModelId();
  const b = generateModelId();
  assert.match(a, /^custom-[a-z0-9]+-[a-z0-9]{4}$/);
  assert.notEqual(a, b);
});

check('maskApiKey 脱敏', () => {
  assert.equal(maskApiKey('sk-12345678'), '••••5678');
  assert.equal(maskApiKey('abc'), '••••');
  assert.equal(maskApiKey(''), '');
});

check('getHostFromUrl / isLocalUrl', () => {
  assert.equal(getHostFromUrl('https://api.openai.com/v1/chat/completions'), 'api.openai.com');
  assert.equal(getHostFromUrl('not-a-url'), '');
  assert.equal(isLocalUrl('http://localhost:4999/v1/chat/completions'), true);
  assert.equal(isLocalUrl('http://127.0.0.1:4999/x'), true);
  assert.equal(isLocalUrl('https://api.openai.com/x'), false);
});

check('validateCustomModel 合法数据通过', () => {
  const result = validateCustomModel(
    {
      name: '测试模型',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-chat',
      apiKey: 'sk-test',
    },
    { envModels, customModels }
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.name, '测试模型');
  assert.equal(result.value.apiKey, 'sk-test');
});

check('validateCustomModel 拒绝空名称/超长名称', () => {
  assert.equal(
    validateCustomModel({ name: '', baseUrl: 'https://a.com', model: 'm' }, { envModels, customModels }).ok,
    false
  );
  assert.equal(
    validateCustomModel(
      { name: 'a'.repeat(31), baseUrl: 'https://a.com', model: 'm' },
      { envModels, customModels }
    ).errors.name,
    '模型名称不能超过 30 个字符'
  );
});

check('validateCustomModel 拒绝与环境/自定义模型重名', () => {
  assert.match(
    validateCustomModel(
      { name: 'Doubao Seed 2.0 Pro', baseUrl: 'https://a.com', model: 'm' },
      { envModels, customModels }
    ).errors.name,
    /已存在/
  );
  assert.match(
    validateCustomModel(
      { name: '我的 GLM', baseUrl: 'https://b.com', model: 'm' },
      { envModels, customModels }
    ).errors.name,
    /已存在/
  );
});

check('validateCustomModel 编辑自身不触发重名', () => {
  const result = validateCustomModel(
    {
      name: '我的 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
      apiKey: '',
    },
    { envModels, customModels, editingId: 'custom-1' }
  );
  assert.equal(result.ok, true);
});

check('validateCustomModel 拒绝非法/非 HTTPS 地址', () => {
  assert.equal(
    validateCustomModel({ name: 'x', baseUrl: 'not-a-url', model: 'm' }, { envModels, customModels })
      .errors.baseUrl,
    '接口地址不是合法的 URL'
  );
  assert.match(
    validateCustomModel(
      { name: 'x', baseUrl: 'http://api.openai.com/v1/chat/completions', model: 'm' },
      { envModels, customModels }
    ).errors.baseUrl,
    /https/
  );
});

check('validateCustomModel 允许 localhost http（本地 UAT）', () => {
  const result = validateCustomModel(
    {
      name: '本地桩',
      baseUrl: 'http://localhost:4999/v1/chat/completions',
      model: 'stub-model',
      apiKey: 'test-key',
    },
    { envModels, customModels }
  );
  assert.equal(result.ok, true);
});

check('validateCustomModel 拒绝重复 baseUrl + model', () => {
  const result = validateCustomModel(
    {
      name: '另一个 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4-flash',
    },
    { envModels, customModels }
  );
  assert.match(result.errors.baseUrl, /已存在/);
});

check('getCurrentModelLabel 默认/自定义/内置', () => {
  const modelsState = {
    custom: customModels,
    env: envModels,
    defaultModelName: 'DeepSeek V4 Pro',
  };
  assert.equal(getCurrentModelLabel(modelsState, null), '环境变量（DeepSeek V4 Pro）');
  assert.equal(getCurrentModelLabel(modelsState, 'custom-1'), '我的 GLM');
  assert.equal(getCurrentModelLabel(modelsState, 'doubao'), 'Doubao Seed 2.0 Pro');
  assert.equal(
    getCurrentModelLabel({ ...modelsState, defaultModelName: null }, null),
    '环境变量'
  );
});

check('getModelRequestParams 环境变量/内置/自定义', () => {
  const modelsState = {
    custom: customModels,
    env: envModels,
    defaultModelName: 'DeepSeek V4 Pro',
  };
  assert.deepEqual(getModelRequestParams(modelsState, null), {});
  assert.deepEqual(getModelRequestParams(modelsState, 'doubao'), { modelId: 'doubao' });
  const params = getModelRequestParams(modelsState, 'custom-1');
  assert.equal(params.modelId, 'custom-1');
  assert.equal(params.modelConfig.model, 'glm-4-flash');
  assert.equal(params.modelConfig.apiKey, 'sk-12345678');
});

check('getModelRequestParams 不可用内置模型回退空参数', () => {
  const modelsState = {
    custom: [],
    env: [{ id: 'doubao', name: 'Doubao', available: false }],
    defaultModelName: null,
  };
  assert.deepEqual(getModelRequestParams(modelsState, 'doubao'), {});
});

const total = passed + failures.length;
console.log(`\n===== 前端工具函数：${passed}/${total} 通过，${failures.length} 失败 =====`);

test('模型工具函数：校验/脱敏/展示/请求参数', () => {
  assert.equal(
    failures.length,
    0,
    failures.map((item) => `${item.name}: ${item.error.message}`).join('\n')
  );
});
