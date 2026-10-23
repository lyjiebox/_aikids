/**
 * V3.6 本地 telemetry 单元测试
 *
 * 运行：node --import tsx --test tests/unit/telemetry.test.mjs
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
  TELEMETRY_MAX_EVENTS,
  TELEMETRY_SCHEMA_VERSION,
  buildTelemetryExport,
  clearTelemetryEvents,
  getTelemetryCount,
  loadTelemetryEvents,
  recordTelemetryEvent,
  sanitizeMessage,
} = await import('../../src/services/telemetry.js');

function reset() {
  store.clear();
}

test('四类事件均可记录，含 schemaVersion/id/at', () => {
  reset();
  const generate = recordTelemetryEvent('generate', {
    mode: 'create',
    ok: true,
    engine: 'volcengine',
    modelId: 'deepseek',
    modelName: 'DeepSeek V4 Pro',
    modelSource: 'env',
    templateId: 'animal',
    durationMs: 12345,
  });
  const play = recordTelemetryEvent('play', {
    workId: 'w1',
    templateId: 'animal',
    isRemix: false,
  });
  const remix = recordTelemetryEvent('remix', {
    workId: 'w1',
    instructionChars: 12,
  });
  const failure = recordTelemetryEvent('failure', {
    scope: 'generate',
    code: 'TIMEOUT',
    message: '请求超时',
  });

  for (const event of [generate, play, remix, failure]) {
    assert.ok(event);
    assert.equal(event.schemaVersion, TELEMETRY_SCHEMA_VERSION);
    assert.equal(typeof event.id, 'string');
    assert.equal(typeof event.at, 'string');
  }

  assert.equal(generate.mode, 'create');
  assert.equal(generate.ok, true);
  assert.equal(play.isRemix, false);
  assert.equal(remix.instructionChars, 12);
  assert.equal(failure.scope, 'generate');
  assert.equal(failure.code, 'TIMEOUT');
  assert.equal(loadTelemetryEvents().length, 4);
  assert.equal(getTelemetryCount(), 4);
});

test('未知事件类型被忽略', () => {
  reset();
  assert.equal(recordTelemetryEvent('unknown', {}), null);
  assert.equal(getTelemetryCount(), 0);
});

test('超过上限时丢弃最旧事件', () => {
  reset();
  const events = [];
  for (let index = 0; index < TELEMETRY_MAX_EVENTS + 5; index += 1) {
    events.push(recordTelemetryEvent('play', { workId: `w-${index}` }));
  }
  const loaded = loadTelemetryEvents();
  assert.equal(loaded.length, TELEMETRY_MAX_EVENTS);
  assert.equal(loaded[0].id, events[5].id);
  assert.equal(loaded[loaded.length - 1].workId, `w-${TELEMETRY_MAX_EVENTS + 4}`);
});

test('敏感内容不会进入事件：HTML / Prompt / API Key / 改编文本', () => {
  reset();
  recordTelemetryEvent('generate', {
    mode: 'create',
    ok: true,
    gameHtml: '<html>secret game</html>',
    apiKey: 'sk-secret-key',
    userPrompt: '我的秘密创意',
    modelName: 'GPT',
  });
  recordTelemetryEvent('remix', {
    workId: 'w1',
    instruction: '把星星换成宝石',
    instructionChars: 8,
  });

  const raw = store.get('aikids-telemetry');
  assert.equal(raw.includes('secret game'), false);
  assert.equal(raw.includes('sk-secret-key'), false);
  assert.equal(raw.includes('我的秘密创意'), false);
  assert.equal(raw.includes('把星星换成宝石'), false);
  assert.equal(raw.includes('instructionChars'), true);
});

test('failure 消息脱敏并截断', () => {
  reset();
  recordTelemetryEvent('failure', {
    scope: 'generate',
    code: 'AUTH',
    message:
      '请求失败 sk-abcdef123456 Authorization: Bearer abc.def.ghi ' +
      'x'.repeat(300),
  });
  const [event] = loadTelemetryEvents();
  assert.equal(event.message.includes('sk-abcdef123456'), false);
  assert.equal(event.message.includes('Bearer abc.def.ghi'), false);
  assert.ok(event.message.length <= 160);
  assert.equal(sanitizeMessage('a\n\nb'), 'a b');
});

test('非法字段被丢弃，合法字段保留', () => {
  reset();
  recordTelemetryEvent('generate', {
    mode: 'hack',
    ok: 'yes',
    engine: 'unknown-engine',
    durationMs: -10,
    templateId: 'animal',
  });
  const [event] = loadTelemetryEvents();
  assert.equal(event.mode, undefined);
  assert.equal(event.ok, undefined);
  assert.equal(event.engine, undefined);
  assert.equal(event.durationMs, undefined);
  assert.equal(event.templateId, 'animal');
});

test('存储写入异常时静默失败，不抛出', () => {
  reset();
  recordTelemetryEvent('play', { workId: 'w1' });
  const original = globalThis.localStorage.setItem;
  const originalError = console.error;
  console.error = () => {};
  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    assert.doesNotThrow(() => recordTelemetryEvent('play', { workId: 'w2' }));
  } finally {
    globalThis.localStorage.setItem = original;
    console.error = originalError;
  }
  assert.equal(getTelemetryCount(), 1);
});

test('诊断日志导出信封结构正确', () => {
  reset();
  recordTelemetryEvent('play', { workId: 'w1' });
  const payload = buildTelemetryExport(1_700_000_000_000);
  assert.equal(payload.kind, 'aikids-telemetry');
  assert.equal(payload.schemaVersion, TELEMETRY_SCHEMA_VERSION);
  assert.equal(payload.app, 'aikids');
  assert.equal(payload.exportedAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(payload.events.length, 1);

  clearTelemetryEvents();
  assert.equal(getTelemetryCount(), 0);
});
