/**
 * V3.6 配置外置单元测试
 *
 * 锁定：
 * - 模板 / Prompt / 模型清单来自 shared/config
 * - 业务层只 import / re-export，不再内联常量
 * - Prompt 文本与 V3.5 约定一致
 *
 * 运行：node --import tsx --test tests/unit/config.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  GAME_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_PROMPT_HINTS,
  isKnownTemplate,
} from '../../shared/config/templates.ts';
import {
  DEFAULT_REMIX_MAX_TOKENS,
  GENERATION_MAX_TOKENS,
  GENERATION_TEMPERATURE,
  REMIX_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from '../../shared/config/prompts.ts';
import {
  BUILTIN_MODEL_DEFS,
  DEFAULT_ALLOWED_MODEL_HOSTS,
  DEFAULT_ARK_BASE_URL,
  DEFAULT_MODEL_BASE_URL,
  MODEL_PRESETS,
} from '../../shared/config/models.ts';

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('模板清单结构与唯一性', () => {
  assert.ok(GAME_TEMPLATES.length >= 6);
  const ids = GAME_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'free',
    'animal',
    'vehicle',
    'princess',
    'dinosaur',
    'space',
  ]);

  for (const template of GAME_TEMPLATES) {
    assert.ok(template.name);
    assert.ok(template.icon);
    assert.ok(template.category);
    assert.equal(typeof template.promptHint, 'string');
    assert.equal(typeof template.aiHint, 'string');
  }

  assert.equal(isKnownTemplate('animal'), true);
  assert.equal(isKnownTemplate('unknown'), false);
});

test('模板名称与 Prompt 前缀由清单派生', () => {
  assert.equal(TEMPLATE_LABELS.free, '自由创作');
  assert.equal(TEMPLATE_LABELS.space, '太空冒险');
  assert.equal(TEMPLATE_PROMPT_HINTS.animal, '这是一个关于动物的游戏');
  assert.equal(TEMPLATE_PROMPT_HINTS.free, undefined);
  assert.equal(Object.keys(TEMPLATE_PROMPT_HINTS).length, GAME_TEMPLATES.length - 1);
});

test('Prompt 文本与生成参数保持 V3.5 约定', () => {
  assert.equal(GENERATION_MAX_TOKENS, 8192);
  assert.equal(GENERATION_TEMPERATURE, 0.7);
  assert.equal(DEFAULT_REMIX_MAX_TOKENS, 16384);

  assert.ok(SYSTEM_PROMPT.includes('至少包含 3 种交互'));
  assert.ok(SYSTEM_PROMPT.includes('得分系统'));
  assert.ok(SYSTEM_PROMPT.includes('胜利/失败'));
  assert.ok(SYSTEM_PROMPT.includes('严格输出 JSON'));

  assert.ok(REMIX_SYSTEM_PROMPT.includes('Remix 模式'));
  assert.ok(REMIX_SYSTEM_PROMPT.includes('不是从零创作'));
  assert.ok(REMIX_SYSTEM_PROMPT.includes('保留原游戏的类型'));
});

test('模型清单 / 白名单 / 前端预设结构', () => {
  const ids = BUILTIN_MODEL_DEFS.map((model) => model.id);
  assert.deepEqual(ids, ['doubao', 'deepseek']);
  for (const model of BUILTIN_MODEL_DEFS) {
    assert.ok(model.name);
    assert.ok(Array.isArray(model.endpointEnvVars));
    assert.ok(model.endpointEnvVars.length > 0);
    assert.ok(model.primaryEndpointEnv);
  }

  assert.ok(DEFAULT_ALLOWED_MODEL_HOSTS.includes('ark.cn-beijing.volces.com'));
  assert.equal(DEFAULT_ARK_BASE_URL.endsWith('/chat/completions'), true);
  assert.equal(DEFAULT_MODEL_BASE_URL, DEFAULT_ARK_BASE_URL);
  assert.equal(MODEL_PRESETS[0].id, 'ark');
  assert.equal(MODEL_PRESETS[0].baseUrl, DEFAULT_ARK_BASE_URL);
});

test('服务端只 re-export shared 配置，不再内联 Prompt / 模型常量', () => {
  const promptSource = read('server/src/services/prompt.ts');
  const remixSource = read('server/src/services/remix.ts');
  const modelSource = read('server/src/services/model.ts');

  assert.equal(promptSource.includes('你是一个儿童游戏生成专家'), false);
  assert.equal(remixSource.includes('## Remix 模式（修改已有游戏'), false);
  assert.equal(modelSource.includes('Doubao Seed 2.0 Pro'), false);
  assert.equal(modelSource.includes('api.deepseek.com'), false);

  assert.ok(promptSource.includes('shared/config/prompts'));
  assert.ok(remixSource.includes('shared/config/prompts'));
  assert.ok(modelSource.includes('shared/config/models'));
});

test('前端从 shared 读取模板与模型预设', () => {
  const siteSource = read('src/config/site.js');
  const modelUtilsSource = read('src/services/model-utils.js');

  assert.ok(siteSource.includes('shared/config/templates'));
  assert.equal(siteSource.includes('id: "free"'), false);
  assert.ok(modelUtilsSource.includes('shared/config/models'));
  assert.equal(modelUtilsSource.includes('ark.cn-beijing.volces.com'), false);
});
