/**
 * V3.4 存储路径回归测试（由 temp/v3.2/storage.test.mjs 迁移）
 *
 * 运行：node --import tsx --test tests/unit/storage.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

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
  saveWorks,
  loadSettings,
  saveSettings,
} = await import('../../src/services/storage.js');

let passed = 0;
const failures = [];

function withSilencedErrors(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    fn();
  } finally {
    console.error = original;
  }
}

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

const validModel = {
  id: 'custom-1',
  name: '测试模型',
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  apiKey: 'sk-test',
  createdAt: 1,
  updatedAt: 1,
};

check('自定义模型保存/读取往返', () => {
  saveCustomModels([validModel]);
  const loaded = loadCustomModels();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, '测试模型');
  assert.equal(loaded[0].apiKey, 'sk-test');
});

check('损坏 JSON 返回空数组', () =>
  withSilencedErrors(() => {
    store.set('aikids-models', '{not json');
    assert.deepEqual(loadCustomModels(), []);
  })
);

check('非数组返回空数组', () => {
  store.set('aikids-models', '{"a":1}');
  assert.deepEqual(loadCustomModels(), []);
});

check('非法条目被丢弃，合法条目保留', () => {
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

check('重复 ID 去重', () => {
  store.set(
    'aikids-models',
    JSON.stringify([validModel, { ...validModel, name: '重复' }])
  );
  const loaded = loadCustomModels();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, '测试模型');
});

check('最多保留 20 条', () => {
  const list = Array.from({ length: 25 }, (_, index) => ({
    ...validModel,
    id: `custom-${index}`,
    name: `模型 ${index}`,
  }));
  store.set('aikids-models', JSON.stringify(list));
  assert.equal(loadCustomModels().length, 20);
});

check('旧作品 remixCount 兼容', () => {
  store.set(
    'aikids-works',
    JSON.stringify([{ id: 'w1', title: '旧作品' }])
  );
  const works = loadWorks();
  assert.equal(works.length, 1);
  assert.equal(works[0].remixCount, 0);
});


check('作品保存/读取往返', () => {
  store.clear();
  const works = [
    { id: 'w1', title: '作品一', gameHtml: '<html></html>', remixCount: 2 },
    { id: 'w2', title: '作品二' },
  ];
  saveWorks(works);
  const loaded = loadWorks();
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].title, '作品一');
  assert.equal(loaded[0].remixCount, 2);
  assert.equal(loaded[1].remixCount, 0);
});

check('设置保存/读取往返', () => {
  store.clear();
  saveSettings({ dailyLimitMinutes: 30, contentFilter: true });
  assert.deepEqual(loadSettings(), { dailyLimitMinutes: 30, contentFilter: true });
});

check('设置损坏 JSON 返回空对象', () =>
  withSilencedErrors(() => {
    store.set('aikids-settings', '{bad');
    assert.deepEqual(loadSettings(), {});
  })
);

check('保存自定义模型最多写入 20 条', () => {
  store.clear();
  const list = Array.from({ length: 25 }, (_, index) => ({
    ...validModel,
    id: `custom-${index}`,
    name: `模型 ${index}`,
  }));
  saveCustomModels(list);
  assert.equal(JSON.parse(store.get('aikids-models')).length, 20);
});

check('localStorage 写入异常时静默失败', () =>
  withSilencedErrors(() => {
    const original = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      assert.doesNotThrow(() => saveWorks([{ id: 'w1' }]));
      assert.doesNotThrow(() => saveSettings({}));
      assert.doesNotThrow(() => saveCustomModels([validModel]));
    } finally {
      globalThis.localStorage.setItem = original;
    }
  })
);

const total = passed + failures.length;
console.log(`\n===== 存储测试：${passed}/${total} 通过，${failures.length} 失败 =====`);

test('存储路径：作品/设置/自定义模型容错与往返', () => {
  assert.equal(
    failures.length,
    0,
    failures.map((item) => `${item.name}: ${item.error.message}`).join('\n')
  );
});
