/**
 * V3.6 存储 schema / 导出导入 / 云端迁移单元测试
 *
 * 运行：node --import tsx --test tests/unit/storage-schema.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLOUD_MIGRATION_KIND,
  EXPORT_KIND,
  SCHEMA_VERSION,
  buildCloudMigration,
  buildExportEnvelope,
  createWorkId,
  mergeSnapshots,
  normalizeSnapshot,
  normalizeWork,
  parseImportPayload,
} from '../../src/services/storage-schema.js';

const NOW = 1_700_000_000_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const legacyWork = {
  id: '1700000000000',
  title: '旧作品',
  templateId: 'animal',
  userPrompt: '做一个打地鼠',
  gameHtml: '<html><body>game</body></html>',
  createdAt: 1_600_000_000_000,
  playCount: 3,
  remixCount: 2,
};

const customModel = {
  id: 'custom-1',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  apiKey: 'sk-test-123456',
  createdAt: NOW,
  updatedAt: NOW,
};

test('createWorkId 生成 RFC4122 v4 UUID', () => {
  const first = createWorkId();
  const second = createWorkId();
  assert.match(first, UUID_RE);
  assert.match(second, UUID_RE);
  assert.notEqual(first, second);
});

test('旧作品保留原 ID，并补齐 schema 字段', () => {
  const work = normalizeWork(legacyWork);
  assert.equal(work.id, '1700000000000');
  assert.equal(work.schemaVersion, SCHEMA_VERSION);
  assert.equal(work.ownerId, null);
  assert.equal(work.visibility, 'private');
  assert.equal(work.title, '旧作品');
  assert.equal(work.playCount, 3);
  assert.equal(work.remixCount, 2);
});

test('缺失 ID 的作品获得 UUID，非法输入返回 null', () => {
  const work = normalizeWork({ title: '无 ID', createdAt: NOW });
  assert.match(work.id, UUID_RE);
  assert.equal(normalizeWork(null), null);
  assert.equal(normalizeWork('x'), null);
  assert.equal(normalizeWork([]), null);
});

test('作品字段容错：非法计数归零、标题限长、未知字段保留', () => {
  const work = normalizeWork({
    id: 'w1',
    title: 'x'.repeat(500),
    playCount: -3,
    remixCount: 'abc',
    createdAt: 'bad',
    customField: { keep: true },
  });
  assert.equal(work.playCount, 0);
  assert.equal(work.remixCount, 0);
  assert.equal(work.title.length, 120);
  assert.deepEqual(work.customField, { keep: true });
  assert.equal(typeof work.createdAt, 'number');
});

test('游戏 HTML 不在加载时截断', () => {
  const html = `<html><body>${'x'.repeat(100000)}</body></html>`;
  const work = normalizeWork({ id: 'w1', title: '大游戏', gameHtml: html });
  assert.equal(work.gameHtml.length, html.length);
  assert.equal(work.gameHtml, html);
});

test('normalizeSnapshot 去重作品与模型，并限制模型数量', () => {
  const models = Array.from({ length: 25 }, (_, index) => ({
    ...customModel,
    id: `custom-${index}`,
    name: `模型 ${index}`,
    baseUrl: `https://api${index}.example.com/v1/chat/completions`,
    model: `model-${index}`,
  }));
  const snapshot = normalizeSnapshot({
    works: [legacyWork, { ...legacyWork, title: '重复 ID' }],
    settings: { dailyTimeLimit: 20 },
    models,
  });
  assert.equal(snapshot.works.length, 1);
  assert.equal(snapshot.works[0].title, '旧作品');
  assert.equal(snapshot.models.length, 20);
  assert.deepEqual(snapshot.settings, { dailyTimeLimit: 20 });
});

test('导出信封包含作品、设置、模型与 API Key', () => {
  const envelope = buildExportEnvelope(
    { works: [legacyWork], settings: { dailyTimeLimit: 30 }, models: [customModel] },
    NOW
  );
  assert.equal(envelope.kind, EXPORT_KIND);
  assert.equal(envelope.schemaVersion, SCHEMA_VERSION);
  assert.equal(envelope.exportedAt, new Date(NOW).toISOString());
  assert.equal(envelope.data.works.length, 1);
  assert.equal(envelope.data.models[0].apiKey, 'sk-test-123456');
  assert.deepEqual(envelope.data.settings, { dailyTimeLimit: 30 });
});

test('导入解析：V3.6 备份 / 旧格式 / 裸作品数组', () => {
  const envelope = buildExportEnvelope(
    { works: [legacyWork], settings: {}, models: [customModel] },
    NOW
  );

  const fromEnvelope = parseImportPayload(JSON.stringify(envelope));
  assert.equal(fromEnvelope.ok, true);
  assert.equal(fromEnvelope.meta.source, 'envelope');
  assert.equal(fromEnvelope.snapshot.works[0].id, '1700000000000');

  const fromLegacy = parseImportPayload({ works: [legacyWork] });
  assert.equal(fromLegacy.ok, true);
  assert.equal(fromLegacy.meta.source, 'legacy');

  const fromArray = parseImportPayload([legacyWork]);
  assert.equal(fromArray.ok, true);
  assert.equal(fromArray.meta.source, 'works-array');
  assert.equal(fromArray.snapshot.works.length, 1);
});

test('导入解析：非法 JSON / 未知 kind / 未来版本 / 空对象被拒绝', () => {
  assert.equal(parseImportPayload('{bad json').ok, false);
  assert.equal(parseImportPayload('{bad json').code, 'INVALID_JSON');

  const wrongKind = parseImportPayload({
    kind: 'aikids-telemetry',
    schemaVersion: 1,
    data: {},
  });
  assert.equal(wrongKind.ok, false);
  assert.equal(wrongKind.code, 'INVALID_KIND');

  const future = parseImportPayload({
    kind: EXPORT_KIND,
    schemaVersion: SCHEMA_VERSION + 1,
    data: { works: [] },
  });
  assert.equal(future.ok, false);
  assert.equal(future.code, 'VERSION_TOO_NEW');

  assert.equal(parseImportPayload({}).ok, false);
  assert.equal(parseImportPayload(null).ok, false);
});

test('合并导入：作品/模型按 ID 去重，设置浅合并', () => {
  const current = {
    works: [legacyWork],
    settings: { dailyTimeLimit: 30, sessionTimeLimit: 20 },
    models: [customModel],
  };
  const incoming = {
    works: [
      legacyWork,
      { id: 'w2', title: '新作品', createdAt: NOW },
      { id: 'w3', title: '新作品 2', createdAt: NOW },
    ],
    settings: { dailyTimeLimit: 45 },
    models: [
      customModel,
      {
        ...customModel,
        id: 'custom-2',
        name: '另一个',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini',
      },
    ],
  };

  const { snapshot, summary } = mergeSnapshots(current, incoming, 'merge');
  assert.equal(summary.mode, 'merge');
  assert.equal(summary.worksAdded, 2);
  assert.equal(summary.worksSkipped, 1);
  assert.equal(summary.modelsAdded, 1);
  assert.equal(summary.modelsSkipped, 1);
  assert.equal(snapshot.works.length, 3);
  assert.equal(snapshot.works[0].id, 'w2');
  assert.deepEqual(snapshot.settings, {
    dailyTimeLimit: 45,
    sessionTimeLimit: 20,
  });
  assert.equal(snapshot.models.length, 2);
});

test('合并导入：模型总数不超过 20', () => {
  const currentModels = Array.from({ length: 19 }, (_, index) => ({
    ...customModel,
    id: `current-${index}`,
    name: `当前 ${index}`,
    baseUrl: `https://current${index}.example.com/v1/chat/completions`,
    model: `m-${index}`,
  }));
  const incomingModels = Array.from({ length: 5 }, (_, index) => ({
    ...customModel,
    id: `incoming-${index}`,
    name: `导入 ${index}`,
    baseUrl: `https://incoming${index}.example.com/v1/chat/completions`,
    model: `m-${index}`,
  }));

  const { snapshot, summary } = mergeSnapshots(
    { works: [], settings: {}, models: currentModels },
    { works: [], settings: {}, models: incomingModels },
    'merge'
  );
  assert.equal(snapshot.models.length, 20);
  assert.equal(summary.modelsAdded, 1);
  assert.equal(summary.modelsSkipped, 4);
});

test('覆盖导入：完全替换', () => {
  const { snapshot, summary } = mergeSnapshots(
    {
      works: [legacyWork],
      settings: { dailyTimeLimit: 30 },
      models: [customModel],
    },
    { works: [{ id: 'w9', title: '覆盖' }], settings: { dailyTimeLimit: 10 }, models: [] },
    'replace'
  );
  assert.equal(summary.mode, 'replace');
  assert.equal(snapshot.works.length, 1);
  assert.equal(snapshot.works[0].id, 'w9');
  assert.deepEqual(snapshot.settings, { dailyTimeLimit: 10 });
  assert.equal(snapshot.models.length, 0);
  assert.equal(summary.settingsReplaced, true);
});

test('V5.1 云端迁移：保留 ID、补 ownerId、无 API Key', () => {
  const migration = buildCloudMigration(
    { works: [legacyWork], settings: {}, models: [customModel] },
    { ownerId: 'family-001', now: NOW }
  );

  assert.equal(migration.kind, CLOUD_MIGRATION_KIND);
  assert.equal(migration.schemaVersion, SCHEMA_VERSION);
  assert.equal(migration.ownerId, 'family-001');
  assert.equal(migration.migratedAt, new Date(NOW).toISOString());
  assert.equal(migration.works.length, 1);
  assert.equal(migration.works[0].id, '1700000000000');
  assert.equal(migration.works[0].ownerId, 'family-001');
  assert.equal(migration.works[0].visibility, 'private');
  assert.equal(migration.works[0].payload.id, '1700000000000');

  const serialized = JSON.stringify(migration);
  assert.equal(serialized.includes('sk-test'), false);
  assert.equal(serialized.includes('apiKey'), false);
  assert.equal(migration.models[0].apiKey, undefined);
});

test('导出 → 导入 → 云端迁移全链路', () => {
  const envelope = buildExportEnvelope(
    { works: [legacyWork], settings: { dailyTimeLimit: 30 }, models: [customModel] },
    NOW
  );
  const parsed = parseImportPayload(JSON.stringify(envelope));
  assert.equal(parsed.ok, true);

  const { snapshot } = mergeSnapshots({}, parsed.snapshot, 'merge');
  const migration = buildCloudMigration(snapshot, { ownerId: 'family-002', now: NOW });
  assert.equal(migration.works.length, 1);
  assert.equal(migration.models.length, 1);
  assert.equal(JSON.stringify(migration).includes('sk-test'), false);
});
