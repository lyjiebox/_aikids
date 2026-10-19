/**
 * V3.2 localStorage 存储容错测试
 *
 * 运行：node temp/v3.2/storage.test.mjs
 */

import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  },
};

const {
  loadCustomModels,
  saveCustomModels,
  loadWorks,
} = await import('../../src/services/storage.js');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`❌ ${name} — ${error.message}`);
  }
}

const validModel = {
  id: 'custom-1',
  name: '测试模型',
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  apiKey: 'sk-test',
  createdAt: 1,
  updatedAt: 1,
};

test('自定义模型保存/读取往返', () => {
  saveCustomModels([validModel]);
  const loaded = loadCustomModels();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, '测试模型');
  assert.equal(loaded[0].apiKey, 'sk-test');
});

test('损坏 JSON 返回空数组', () => {
  store.set('aikids-models', '{not json');
  assert.deepEqual(loadCustomModels(), []);
});

test('非数组返回空数组', () => {
  store.set('aikids-models', '{"a":1}');
  assert.deepEqual(loadCustomModels(), []);
});

test('非法条目被丢弃，合法条目保留', () => {
  store.set(
    'aikids-models',
    JSON.stringify([
      null,
      { id: '', name: 'x', baseUrl: 'https://a.com', model: 'm' },
      validModel,
      { id: 'custom-2', name: '', baseUrl: 'https://a.com', model: 'm' },
      { id: 'custom-3', name: 'ok', baseUrl: 'https://a.com', model: 'm' },
    ])
  );
  const loaded = loadCustomModels();
  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded.map((item) => item.id), ['custom-1', 'custom-3']);
});

test('重复 ID 去重', () => {
  store.set(
    'aikids-models',
    JSON.stringify([validModel, { ...validModel, name: '重复' }])
  );
  const loaded = loadCustomModels();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, '测试模型');
});

test('最多保留 20 条', () => {
  const list = Array.from({ length: 25 }, (_, index) => ({
    ...validModel,
    id: `custom-${index}`,
    name: `模型 ${index}`,
  }));
  store.set('aikids-models', JSON.stringify(list));
  assert.equal(loadCustomModels().length, 20);
});

test('旧作品 remixCount 兼容', () => {
  store.set(
    'aikids-works',
    JSON.stringify([{ id: 'w1', title: '旧作品' }])
  );
  const works = loadWorks();
  assert.equal(works.length, 1);
  assert.equal(works[0].remixCount, 0);
});

const total = passed + failures.length;
console.log(`\n===== 存储测试：${passed}/${total} 通过，${failures.length} 失败 =====`);
if (failures.length > 0) process.exitCode = 1;
