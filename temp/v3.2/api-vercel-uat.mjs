/**
 * V3.2 Vercel API 对等验收（直接调用 esbuild 产物）
 *
 * 前置：
 *   1. node temp/v3.2/stub-model-server.mjs
 *   2. npx esbuild api/generate.ts api/models/index.ts api/models/test.ts \
 *      --bundle --platform=node --format=esm --outdir=temp/v3.2/esbuild-check
 *   3. node temp/v3.2/api-vercel-uat.mjs
 */

process.env.VOLCENGINE_API_KEY = 'test-key';
process.env.VOLCENGINE_BASE_URL =
  'http://localhost:4999/v1/chat/completions';
process.env.DOUBAO_ENDPOINT_ID = 'ep-doubao-uat';
process.env.DEEPSEEK_ENDPOINT_ID = 'ep-deepseek-uat';
process.env.GAME_MODEL = 'deepseek';
process.env.ALLOW_LOCAL_MODEL_HOSTS = '1';
process.env.MODEL_TEST_TIMEOUT_MS = '2000';

const modelsApi = await import('./esbuild-check/models/index.js');
const testApi = await import('./esbuild-check/models/test.js');
const generateApi = await import('./esbuild-check/generate.js');

const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function post(handler, path, body) {
  const res = await handler(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
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

function customConfig(overrides = {}) {
  return {
    id: 'custom-vercel',
    name: 'Vercel 测试桩',
    baseUrl: 'http://localhost:4999/v1/chat/completions',
    model: 'stub-model',
    apiKey: 'test-key',
    ...overrides,
  };
}

const catalogRes = await modelsApi.GET(
  new Request('http://localhost/api/models')
);
const catalog = await catalogRes.json();
record(
  '5.4.1',
  'Vercel GET /api/models',
  catalogRes.status === 200 && catalog.success === true,
  `status=${catalogRes.status}`
);
record(
  '5.4.2',
  'Vercel 默认模型 GAME_MODEL',
  catalog.data?.defaultModelId === 'deepseek',
  catalog.data?.defaultModelId
);

{
  const res = await post(testApi.POST, '/api/models/test', {
    modelId: 'deepseek',
  });
  record(
    '5.4.3',
    'Vercel 模型测试',
    res.json?.success === true && res.json?.data?.ok === true
  );
}

{
  const res = await post(generateApi.POST, '/api/generate', {
    userPrompt: '做一个收集星星的游戏',
  });
  record(
    '5.4.4',
    'Vercel 默认模型生成',
    res.json?.success === true &&
      res.json?.data?.model === 'deepseek' &&
      typeof res.json?.data?.gameHtml === 'string'
  );
}

{
  const res = await post(generateApi.POST, '/api/generate', {
    userPrompt: '做一个收集星星的游戏',
    modelConfig: customConfig(),
  });
  record(
    '5.4.5',
    'Vercel 自定义模型生成',
    res.json?.success === true &&
      res.json?.data?.modelSource === 'custom' &&
      res.json?.data?.model === 'custom-vercel'
  );
}

{
  const res = await post(testApi.POST, '/api/models/test', {
    modelConfig: customConfig({ model: 'force-401' }),
  });
  record(
    '5.4.6',
    'Vercel 401 映射',
    res.json?.success === false && /鉴权失败/.test(res.json?.message || '')
  );
}

{
  const res = await post(testApi.POST, '/api/models/test', {
    modelConfig: customConfig({
      baseUrl: 'https://example.com/v1/chat/completions',
    }),
  });
  record(
    '5.4.7',
    'Vercel 白名单',
    res.json?.success === false && /白名单/.test(res.json?.message || '')
  );
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\n===== Vercel API：${passed}/${results.length} 通过，${failed} 失败 =====`);
if (failed > 0) process.exitCode = 1;
