/**
 * V3.3 Vercel API 产物对等验收
 *
 * 前置：
 *   1. node temp/v3.3/stub-remix-server.mjs
 *   2. npx esbuild api/generate.ts --bundle --platform=node --format=esm \
 *      --outfile=temp/v3.3/esbuild-check/generate.js
 *   3. node temp/v3.3/api-vercel-uat.mjs
 */

import { BIG_MARKER, bigGame, sourceGame } from './fixtures.mjs';

process.env.VOLCENGINE_API_KEY = 'test-key';
process.env.VOLCENGINE_BASE_URL = 'http://localhost:4998/v1/chat/completions';
process.env.DOUBAO_ENDPOINT_ID = 'ep-doubao-uat';
process.env.DEEPSEEK_ENDPOINT_ID = 'ep-deepseek-uat';
process.env.GAME_MODEL = 'deepseek';
process.env.ALLOW_LOCAL_MODEL_HOSTS = '1';
process.env.MODEL_TEST_TIMEOUT_MS = '2000';

const { POST } = await import('./esbuild-check/generate.js');

const STUB_BASE = 'http://localhost:4998';
const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function post(body) {
  const res = await POST(
    new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function customConfig(model = 'remix-stub') {
  return {
    id: 'custom-vercel-remix',
    name: 'Vercel Remix 测试桩',
    baseUrl: 'http://localhost:4998/v1/chat/completions',
    model,
    apiKey: 'test-key',
  };
}

async function getLastRequest() {
  const res = await fetch(`${STUB_BASE}/last-request`);
  return res.json();
}

async function resetStub() {
  await fetch(`${STUB_BASE}/reset`, { method: 'POST' });
}

// ============================================================
// 用例
// ============================================================

// VERCEL-01 完整源码 Remix
await resetStub();
let remixRes;
{
  remixRes = await post({
    templateId: 'animal',
    userPrompt: '把星星换成宝石，并加一个会扣分的炸弹',
    remixFrom: 'work-vercel-1',
    remixInstruction: '把星星换成宝石，并加一个会扣分的炸弹',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customConfig(),
  });
  const data = remixRes.json?.data || {};
  record(
    'VERCEL-01a',
    '完整源码 Remix 成功',
    remixRes.status === 200 &&
      remixRes.json?.success === true &&
      data.remixMode === 'full' &&
      data.gameHtml?.includes('BOSS'),
    `status=${remixRes.status}, mode=${data.remixMode}`
  );
  record(
    'VERCEL-01b',
    '返回档案与审计',
    data.remixProfile?.interactions?.includes('点击') &&
      data.remixAudit?.preserved === true,
    JSON.stringify(data.remixAudit)
  );
}

// VERCEL-02 Prompt 对等
{
  const captured = await getLastRequest();
  const messages = captured.messages || [];
  const system = String(
    messages.find((message) => message.role === 'system')?.content || ''
  );
  const user = String(
    messages.find((message) => message.role === 'user')?.content || ''
  );
  record(
    'VERCEL-02a',
    'System Prompt 含 Remix 规则',
    system.includes('不是从零创作') && system.includes('保留原游戏'),
    ''
  );
  record(
    'VERCEL-02b',
    'User Prompt 含完整源码与档案',
    user.includes('<game_source>') &&
      user.includes('核心交互：点击') &&
      user.includes('let score = 0;') &&
      user.includes('得分系统：有'),
    `promptLen=${user.length}`
  );
  record(
    'VERCEL-02c',
    'Remix 输出上限 16384',
    captured.max_tokens === 16384,
    String(captured.max_tokens)
  );
}

// VERCEL-03 超长源码 outline
{
  await resetStub();
  const res = await post({
    templateId: 'free',
    userPrompt: '加一个 Boss',
    remixFrom: 'work-vercel-big',
    remixInstruction: '加一个 Boss',
    originalTitle: '超长源码游戏',
    originalUserPrompt: '一个很长的游戏',
    originalGameHtml: bigGame,
    modelConfig: customConfig(),
  });
  const data = res.json?.data || {};
  const captured = await getLastRequest();
  const user = String(
    (captured.messages || []).find((message) => message.role === 'user')
      ?.content || ''
  );
  record(
    'VERCEL-03a',
    '超长源码进入 outline',
    res.status === 200 && data.remixMode === 'outline',
    String(data.remixMode)
  );
  record(
    'VERCEL-03b',
    'outline 省略中间内容',
    user.includes('片段 1/3') && !user.includes(BIG_MARKER),
    ''
  );
}

// VERCEL-04 失败保留原游戏
{
  await resetStub();
  const res = await post({
    templateId: 'animal',
    userPrompt: '加一个 Boss',
    remixFrom: 'work-vercel-1',
    remixInstruction: '加一个 Boss',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customConfig('remix-force-500'),
  });
  const data = res.json?.data || {};
  record(
    'VERCEL-04a',
    '模型失败返回 remixFallback',
    res.status === 200 &&
      data.remixFallback === true &&
      data.remixMode === 'fallback',
    `status=${res.status}, mode=${data.remixMode}`
  );
  record(
    'VERCEL-04b',
    '失败时原样保留 HTML',
    data.gameHtml === sourceGame && /保留原游戏/.test(data.warning || ''),
    data.warning
  );
}

// VERCEL-05 普通生成回归
{
  await resetStub();
  const res = await post({
    templateId: 'space',
    userPrompt: '做一个太空收集游戏',
    modelConfig: customConfig(),
  });
  const data = res.json?.data || {};
  const captured = await getLastRequest();
  const system = String(
    (captured.messages || []).find((message) => message.role === 'system')
      ?.content || ''
  );
  record(
    'VERCEL-05a',
    '普通生成成功',
    res.status === 200 && res.json?.success === true && data.gameHtml,
    `status=${res.status}`
  );
  record(
    'VERCEL-05b',
    '普通生成不带 Remix 字段',
    data.remixMode === undefined &&
      data.remixAudit === undefined &&
      !system.includes('Remix 模式'),
    ''
  );
  record(
    'VERCEL-05c',
    '普通生成输出上限 8192',
    captured.max_tokens === 8192,
    String(captured.max_tokens)
  );
}

// VERCEL-06 纯 HTML 解析
{
  await resetStub();
  const res = await post({
    templateId: 'animal',
    userPrompt: '加一个 Boss',
    remixFrom: 'work-vercel-1',
    remixInstruction: '加一个 Boss',
    originalTitle: '星星收集大冒险',
    originalUserPrompt: '做一个收集星星的游戏',
    originalGameHtml: sourceGame,
    modelConfig: customConfig('remix-plain'),
  });
  const data = res.json?.data || {};
  record(
    'VERCEL-06a',
    '纯 HTML 输出可解析',
    res.status === 200 &&
      data.gameHtml?.includes('BOSS') &&
      data.remixAudit?.preserved === true,
    `status=${res.status}`
  );
}

// VERCEL-07 安全
record(
  'VERCEL-07a',
  '响应不回显 Key',
  !remixRes.text.includes('test-key') && !remixRes.text.includes('apiKey'),
  ''
);

// ============================================================
// 汇总
// ============================================================
const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(
  `\n===== Vercel API 产物：${passed}/${results.length} 通过，${failed} 失败 =====`
);
if (failed > 0) {
  console.log('\n失败项：');
  for (const item of results.filter((entry) => !entry.ok)) {
    console.log(`- ${item.id} ${item.name} — ${item.detail}`);
  }
  process.exitCode = 1;
}
