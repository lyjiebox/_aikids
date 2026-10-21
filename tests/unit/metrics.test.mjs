/**
 * V3.5 指标工具单元测试。
 *
 * 覆盖：nearest-rank 分位数、token 估算、成本换算、指标日志格式与脱敏。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHARS_PER_TOKEN,
  emitGenerationMetric,
  estimateCost,
  estimateTokens,
  estimateTokensFromChars,
  metricsEnabled,
  percentile,
  resolveMetricTokens,
} from '../../server/src/services/metrics.ts';

test('METRICS-01 空数组分位数为 0', () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([], 90), 0);
});

test('METRICS-02 nearest-rank：p50/p90', () => {
  const values = [4, 1, 3, 2];
  assert.equal(percentile(values, 50), 2);
  assert.equal(percentile(values, 90), 4);
  assert.equal(percentile(values, 0), 1);
  assert.equal(percentile(values, 100), 4);
  assert.equal(percentile([10], 50), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test('METRICS-03 token 估算可复现且单调', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(-5), 0);
  assert.equal(estimateTokensFromChars(3), Math.ceil(3 / CHARS_PER_TOKEN));
  assert.equal(estimateTokens('abc'), estimateTokensFromChars(3));
  assert.ok(estimateTokens('中'.repeat(100)) > estimateTokens('中'.repeat(50)));
});

test('METRICS-04 成本换算：未配置单价返回 null', () => {
  const usage = { promptTokens: 1000, completionTokens: 2000, totalTokens: 3000 };
  assert.equal(estimateCost(usage, {}), null);
  assert.equal(estimateCost(usage, { inputPer1k: null }), null);

  const cost = estimateCost(usage, { inputPer1k: 0.001, outputPer1k: 0.002 });
  assert.equal(cost, 0.005);

  const onlyInput = estimateCost(usage, { inputPer1k: 0.001 });
  assert.equal(onlyInput, 0.001);
});

test('METRICS-05 指标日志为单行 [metrics] JSON 且不含敏感信息', () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  const oldEnabled = process.env.METRICS_ENABLED;
  delete process.env.METRICS_ENABLED;
  try {
    emitGenerationMetric({
      event: 'generate',
      ok: true,
      mode: 'create',
      status: 200,
      engine: 'volcengine',
      modelId: 'deepseek',
      modelSource: 'env',
      totalMs: 1234,
      upstreamMs: 1200,
      promptChars: 20,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      timestamp: '2026-10-21T00:00:00.000Z',
    });
  } finally {
    console.log = original;
    if (oldEnabled === undefined) delete process.env.METRICS_ENABLED;
    else process.env.METRICS_ENABLED = oldEnabled;
  }

  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith('[metrics] '));
  const payload = JSON.parse(lines[0].slice('[metrics] '.length));
  assert.equal(payload.event, 'generate');
  assert.equal(payload.ok, true);
  assert.equal(payload.usage.totalTokens, 30);
  assert.ok(!lines[0].includes('sk-'));
  assert.ok(!lines[0].includes('Bearer'));
});

test('METRICS-06 METRICS_ENABLED=0 时静默', () => {
  const old = process.env.METRICS_ENABLED;
  process.env.METRICS_ENABLED = '0';
  assert.equal(metricsEnabled(), false);

  const original = console.log;
  let called = 0;
  console.log = () => {
    called += 1;
  };
  try {
    emitGenerationMetric({
      event: 'generate',
      ok: false,
      mode: 'create',
      status: 400,
      engine: 'mock',
      modelId: 'mock',
      modelSource: 'none',
      totalMs: 0,
      promptChars: 0,
      errorCode: 'EMPTY_PROMPT',
      timestamp: '2026-10-21T00:00:00.000Z',
    });
  } finally {
    console.log = original;
    if (old === undefined) delete process.env.METRICS_ENABLED;
    else process.env.METRICS_ENABLED = old;
  }
  assert.equal(called, 0);
});

test('METRICS-07 resolveMetricTokens 优先真实 usage', () => {
  const base = {
    event: 'generate',
    ok: true,
    mode: 'create',
    status: 200,
    engine: 'volcengine',
    modelId: 'deepseek',
    modelSource: 'env',
    totalMs: 1,
    promptChars: 1,
    timestamp: '2026-10-21T00:00:00.000Z',
  };
  assert.deepEqual(
    resolveMetricTokens({
      ...base,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    }),
    { promptTokens: 1, completionTokens: 2, estimated: false }
  );
  assert.deepEqual(
    resolveMetricTokens({
      ...base,
      estimatedPromptTokens: 10,
      estimatedCompletionTokens: 20,
    }),
    { promptTokens: 10, completionTokens: 20, estimated: true }
  );
});
