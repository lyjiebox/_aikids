/**
 * V3.5 生成编排与解析单元测试。
 *
 * 覆盖：请求校验、Remix 判定、五种输出解析、无模型降级、错误码。
 * 不调用真实模型；所有模型环境变量在本文件内清空。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  handleGenerateRequest,
  invalidJsonOutcome,
  parseGenerateRequest,
  prepareGeneration,
} from '../../server/src/services/generate.ts';
import { parseGameOutput } from '../../server/src/services/parse.ts';
import { GameParseError } from '../../server/src/errors.ts';
import { parseTokenUsage } from '../../server/src/services/model.ts';
import { ERROR_CODES } from '../../server/src/types/index.ts';

// 本文件不依赖真实模型：清空所有模型相关环境变量
for (const key of [
  'VOLCENGINE_API_KEY',
  'VOLCENGINE_BASE_URL',
  'DOUBAO_ENDPOINT_ID',
  'DEEPSEEK_ENDPOINT_ID',
  'VOLCENGINE_ENDPOINT_ID',
  'GAME_MODEL',
  'ALLOWED_MODEL_HOSTS',
  'ALLOW_LOCAL_MODEL_HOSTS',
  'MODEL_TIMEOUT_MS',
]) {
  delete process.env[key];
}
// 避免单元测试输出大量指标日志
process.env.METRICS_ENABLED = '0';

const sourceGame = `<!DOCTYPE html>
<html><head><title>原游戏</title></head>
<body><div id="score">得分:0</div><script>let score=0;</script></body></html>`;

test('PARSE-REQ 非法 body 类型统一返回 INVALID_BODY', () => {
  for (const input of [null, [], 'text', 42, true]) {
    const result = parseGenerateRequest(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.INVALID_BODY);
    assert.equal(result.message, '请求参数格式错误');
  }
});

test('PARSE-REQ 空/非字符串 Prompt 返回 EMPTY_PROMPT', () => {
  for (const input of [{}, { userPrompt: '' }, { userPrompt: '   ' }, { userPrompt: 123 }]) {
    const result = parseGenerateRequest(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, ERROR_CODES.EMPTY_PROMPT);
    assert.equal(result.message, '请先说出你的游戏创意！');
  }
});

test('PARSE-REQ 保留字符串字段，丢弃类型不符的可选字段', () => {
  const result = parseGenerateRequest({
    userPrompt: '做一个收集星星的游戏',
    templateId: 123,
    remixFrom: { id: 'x' },
    remixInstruction: '加一个 Boss',
    modelId: 'deepseek',
    model: 99,
    ageRange: [3, 10],
    modelConfig: { name: 'x' },
    extraField: 'ignored',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.userPrompt, '做一个收集星星的游戏');
  assert.equal(result.value.remixInstruction, '加一个 Boss');
  assert.equal(result.value.modelId, 'deepseek');
  assert.deepEqual(result.value.ageRange, [3, 10]);
  assert.deepEqual(result.value.modelConfig, { name: 'x' });
  assert.equal('templateId' in result.value, false);
  assert.equal('remixFrom' in result.value, false);
  assert.equal('model' in result.value, false);
  assert.equal('extraField' in result.value, false);
});

test('PARSE-REQ 非法 ageRange 被丢弃', () => {
  const result = parseGenerateRequest({ userPrompt: 'x', ageRange: ['3', '10'] });
  assert.equal(result.ok, true);
  assert.equal('ageRange' in result.value, false);
});

test('PREPARE 普通生成保持模板提示与 8192 上限', () => {
  const prepared = prepareGeneration({
    templateId: 'space',
    userPrompt: '做一个太空游戏',
  });
  assert.equal(prepared.isRemix, false);
  assert.equal(prepared.remix, null);
  assert.equal(prepared.remixFallback, null);
  assert.ok(prepared.userPrompt.startsWith('这是一个关于太空的游戏。'));
  assert.equal(prepared.maxTokens, 8192);
  assert.ok(prepared.systemPrompt.includes('儿童游戏生成专家'));
});

test('PREPARE 只有 remixFrom 时不进入 Remix', () => {
  const prepared = prepareGeneration({
    userPrompt: '改一下',
    remixFrom: 'work-1',
    originalGameHtml: sourceGame,
  });
  assert.equal(prepared.isRemix, false);
  assert.equal(prepared.remixFallback, null);
});

test('PREPARE remixFrom + instruction 才进入 Remix 并准备兜底', () => {
  const prepared = prepareGeneration({
    userPrompt: '加一个 Boss',
    remixFrom: 'work-1',
    remixInstruction: '加一个 Boss',
    originalGameHtml: sourceGame,
  });
  assert.equal(prepared.isRemix, true);
  assert.equal(prepared.remix?.sourceMode, 'full');
  assert.equal(prepared.remixFallback?.html, sourceGame);
  assert.ok(prepared.systemPrompt.includes('Remix 模式'));
  assert.equal(prepared.maxTokens, 16384);
});

test('PREPARE Remix 无原源码时没有兜底', () => {
  const prepared = prepareGeneration({
    userPrompt: '加一个 Boss',
    remixFrom: 'work-1',
    remixInstruction: '加一个 Boss',
    originalGameHtmlPreview: '<html>preview</html>',
  });
  assert.equal(prepared.isRemix, true);
  assert.equal(prepared.remixFallback, null);
});

test('PARSE-01 纯 JSON / 代码块 / 截断 / 纯 HTML 均可解析', () => {
  const direct = parseGameOutput(
    JSON.stringify({ title: '星星', html: '<html>direct</html>' })
  );
  assert.deepEqual(direct, { title: '星星', html: '<html>direct</html>' });

  const fencedJson = parseGameOutput(
    '说明\n```json\n{"title":"宝石","html":"<html>json</html>"}\n```'
  );
  assert.deepEqual(fencedJson, { title: '宝石', html: '<html>json</html>' });

  const fencedCode = parseGameOutput(
    '```\n{"title":"跑酷","html":"<html>code</html>"}\n```'
  );
  assert.deepEqual(fencedCode, { title: '跑酷', html: '<html>code</html>' });

  const truncated = parseGameOutput(
    '{"title":"截断","html":"<html>truncated</html>"'
  );
  assert.equal(truncated.title, '截断');
  assert.equal(truncated.html, '<html>truncated</html>');

  const plain = parseGameOutput(
    '<!DOCTYPE html><html><head><title>纯 HTML</title></head><body>x</body></html>'
  );
  assert.equal(plain.title, '纯 HTML');
  assert.ok(plain.html.startsWith('<!DOCTYPE html>'));
});

test('PARSE-02 标题缺失时从 <title> 回退', () => {
  const parsed = parseGameOutput(
    JSON.stringify({ html: '<html><head><title>自动标题</title></head></html>' })
  );
  assert.equal(parsed.title, '自动标题');
});

test('PARSE-03 无法解析时抛 GameParseError（OUTPUT_PARSE_FAILED）', () => {
  for (const input of ['', '   ', '这不是游戏', '{"title":"只有标题"}']) {
    assert.throws(
      () => parseGameOutput(input),
      (error) => {
        assert.ok(error instanceof GameParseError);
        assert.equal(error.code, ERROR_CODES.OUTPUT_PARSE_FAILED);
        return true;
      }
    );
  }
});

test('TOKEN-01 parseTokenUsage 提取/容错', () => {
  assert.deepEqual(
    parseTokenUsage({
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }),
    { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
  );

  assert.deepEqual(
    parseTokenUsage({ usage: { prompt_tokens: 5, completion_tokens: 6 } }),
    { promptTokens: 5, completionTokens: 6, totalTokens: 11 }
  );

  assert.equal(parseTokenUsage({}), undefined);
  assert.equal(parseTokenUsage({ usage: { prompt_tokens: -1 } }), undefined);
  assert.equal(parseTokenUsage(null), undefined);
});

test('ORCH-01 非法 JSON 返回 400 INVALID_JSON', () => {
  const outcome = invalidJsonOutcome();
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.success, false);
  assert.equal(outcome.body.code, ERROR_CODES.INVALID_JSON);
  assert.equal(outcome.metric.errorCode, ERROR_CODES.INVALID_JSON);
});

test('ORCH-02 空 Prompt 返回 400 且指标 ok=false', async () => {
  const outcome = await handleGenerateRequest({ userPrompt: '  ' });
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.code, ERROR_CODES.EMPTY_PROMPT);
  assert.equal(outcome.metric.ok, false);
  assert.equal(outcome.metric.status, 400);
});

test('ORCH-03 未知模型返回 400 MODEL_NOT_FOUND', async () => {
  const outcome = await handleGenerateRequest({
    userPrompt: '做一个游戏',
    modelId: 'not-exist',
  });
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.success, false);
  assert.equal(outcome.body.code, ERROR_CODES.MODEL_NOT_FOUND);
});

test('ORCH-04 非法自定义模型返回 400 MODEL_CONFIG_INVALID', async () => {
  const outcome = await handleGenerateRequest({
    userPrompt: '做一个游戏',
    modelConfig: { name: '', baseUrl: 'not-a-url', model: '' },
  });
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.code, ERROR_CODES.MODEL_CONFIG_INVALID);
});

test('ORCH-05 无模型时普通生成降级本地模板', async () => {
  const outcome = await handleGenerateRequest({
    userPrompt: '做一个动物游戏',
    templateId: 'animal',
  });
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.success, true);
  if (outcome.body.success) {
    assert.equal(outcome.body.data.engine, 'mock');
    assert.equal(outcome.body.data.modelName, '本地模板');
    assert.ok(outcome.body.data.gameHtml.includes('<html'));
  }
  assert.equal(outcome.metric.ok, false);
  assert.equal(outcome.metric.errorCode, ERROR_CODES.NO_MODEL);
  assert.equal(outcome.metric.engine, 'mock');
});

test('ORCH-06 无模型时 Remix 原样保留原游戏', async () => {
  const outcome = await handleGenerateRequest({
    userPrompt: '加一个 Boss',
    remixFrom: 'work-1',
    remixInstruction: '加一个 Boss',
    originalTitle: '原游戏',
    originalGameHtml: sourceGame,
  });
  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.success, true);
  if (outcome.body.success) {
    assert.equal(outcome.body.data.remixFallback, true);
    assert.equal(outcome.body.data.remixMode, 'fallback');
    assert.equal(outcome.body.data.gameHtml, sourceGame);
    assert.match(outcome.body.data.warning || '', /保留原游戏/);
  }
  assert.equal(outcome.metric.mode, 'remix');
  assert.equal(outcome.metric.sourceMode, 'full');
  assert.equal(outcome.metric.errorCode, ERROR_CODES.NO_MODEL);
});
