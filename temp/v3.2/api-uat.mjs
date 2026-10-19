/**
 * V3.2 API 自动化验收脚本（本地 server/）
 *
 * 前置：
 *   1. node temp/v3.2/stub-model-server.mjs
 *   2. cd server && VOLCENGINE_API_KEY=test-key \
 *      VOLCENGINE_BASE_URL=http://localhost:4999/v1/chat/completions \
 *      DOUBAO_ENDPOINT_ID=ep-doubao-uat DEEPSEEK_ENDPOINT_ID=ep-deepseek-uat \
 *      GAME_MODEL=deepseek ALLOW_LOCAL_MODEL_HOSTS=1 MODEL_TEST_TIMEOUT_MS=2000 \
 *      npm run dev
 *   3. node temp/v3.2/api-uat.mjs
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';

const STUB_BASE_URL = 'http://localhost:4999/v1/chat/completions';

const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function postJson(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function customConfig(overrides = {}) {
  return {
    id: 'custom-uat',
    name: '测试桩模型',
    baseUrl: STUB_BASE_URL,
    model: 'stub-model',
    apiKey: 'test-key',
    ...overrides,
  };
}

async function main() {
  // ============================================================
  // 5.1 内置模型清单
  // ============================================================
  {
    const res = await request('/models');
    const data = res.json?.data || {};
    const models = data.models || [];
    record('5.1.1', 'GET /api/models 返回 200 + success', res.status === 200 && res.json?.success === true, `status=${res.status}`);
    record('5.1.2', '包含 doubao / deepseek', models.length === 2 && models.some(m => m.id === 'doubao') && models.some(m => m.id === 'deepseek'), `count=${models.length}`);
    record('5.1.3', '内置模型 available=true', models.every(m => m.available === true));
    record('5.1.4', '默认模型来自 GAME_MODEL', data.defaultModelId === 'deepseek', `default=${data.defaultModelId}`);
    record('5.1.5', 'endpoint 已脱敏', models.every(m => m.modelPreview && !m.modelPreview.includes('ep-doubao-uat') && !m.modelPreview.includes('ep-deepseek-uat')), models.map(m => m.modelPreview).join(','));
    record('5.1.6', '不泄露 Key', !res.text.includes('test-key') && !res.text.includes('apiKey'), '全文无 test-key/apiKey');
  }

  // ============================================================
  // 5.2 模型测试
  // ============================================================
  {
    const res = await postJson('/models/test', { modelId: 'deepseek' });
    const data = res.json?.data || {};
    record('5.2.1', '内置模型测试成功', res.json?.success === true && data.ok === true && typeof data.latencyMs === 'number', `latency=${data.latencyMs}ms`);
    record('5.2.1b', '测试响应无游戏字段', !('gameHtml' in data) && !('title' in data));
  }
  {
    const res = await postJson('/models/test', { modelConfig: customConfig() });
    record('5.2.2', '自定义模型测试成功', res.json?.success === true && res.json?.data?.source === 'custom');
  }
  {
    const res = await postJson('/models/test', { modelConfig: customConfig({ model: 'force-401' }) });
    record('5.2.3', '401 映射为鉴权失败', res.json?.success === false && /鉴权失败/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', { modelConfig: customConfig({ model: 'force-500' }) });
    record('5.2.4', '500 映射为服务不可用', res.json?.success === false && /服务暂时不可用/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', { modelConfig: customConfig({ model: 'force-empty' }) });
    record('5.2.5', '空响应映射', res.json?.success === false && /未返回内容/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', { modelConfig: customConfig({ model: 'force-timeout' }) });
    record('5.2.6', '超时映射', res.json?.success === false && /超时/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', { modelId: 'not-exist' });
    record('5.2.7', '未知模型返回失败', res.status === 200 && res.json?.success === false, res.json?.message);
  }
  {
    const res = await postJson('/models/test', {});
    record('5.2.8', '缺少参数返回失败', res.json?.success === false, res.json?.message);
  }
  {
    // 测试接口只发短 Prompt：由测试桩日志核对，这里检查响应字段
    const res = await postJson('/models/test', { modelId: 'doubao' });
    record('5.2.9', '测试只返回文本结果', res.json?.success === true && typeof res.json?.data?.reply === 'string' && !('gameHtml' in (res.json?.data || {})));
  }

  // ============================================================
  // 5.3 生成接口
  // ============================================================
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏' });
    const data = res.json?.data || {};
    record('5.3.1', '未传模型时使用 GAME_MODEL', res.json?.success === true && data.model === 'deepseek' && data.modelName === 'DeepSeek V4 Pro', `${data.model}/${data.modelName}`);
    record('5.3.1b', '生成游戏 HTML', typeof data.gameHtml === 'string' && data.gameHtml.includes('<!DOCTYPE html>'), `len=${data.gameHtml?.length}`);
  }
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏', modelId: 'doubao' });
    record('5.3.2', '显式内置模型生效', res.json?.data?.model === 'doubao');
  }
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏', model: 'doubao' });
    record('5.3.3', '旧字段 model 兼容', res.json?.data?.model === 'doubao');
  }
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏', modelConfig: customConfig() });
    const data = res.json?.data || {};
    record('5.3.4', '自定义模型生成生效', res.json?.success === true && data.model === 'custom-uat' && data.modelSource === 'custom' && data.engine === 'volcengine', `${data.model}/${data.modelSource}`);
  }
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏', modelId: 'not-exist' });
    record('5.3.5', '未知模型生成返回 400', res.status === 400 && res.json?.success === false, `status=${res.status}`);
  }
  {
    const res = await postJson('/generate', {
      userPrompt: '做一个收集星星的游戏',
      modelConfig: customConfig({ baseUrl: 'http://169.254.169.254/latest/meta-data' }),
    });
    record('5.3.6', '非法自定义地址返回 400', res.status === 400 && /白名单|本地/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/generate', {
      userPrompt: '做一个收集星星的游戏',
      modelConfig: customConfig({ model: 'force-401' }),
    });
    const data = res.json?.data || {};
    record('5.3.7', '上游 401 降级 Mock', res.json?.success === true && data.engine === 'mock' && Boolean(data.warning), data.warning);
  }
  {
    const res = await postJson('/generate', { userPrompt: '做一个收集星星的游戏', modelConfig: customConfig() });
    record('5.3.10', '响应不含 Key', !res.text.includes('test-key') && !res.text.includes('apiKey'));
  }

  // ============================================================
  // 安全校验
  // ============================================================
  {
    const res = await postJson('/models/test', {
      modelConfig: customConfig({ baseUrl: 'https://example.com/v1/chat/completions' }),
    });
    record('7.3.1', '公网非白名单被拒绝', res.json?.success === false && /白名单/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', {
      modelConfig: customConfig({ baseUrl: 'http://169.254.169.254/latest/meta-data' }),
    });
    record('7.3.2', '内网地址被拒绝', res.json?.success === false);
  }
  {
    const res = await postJson('/models/test', {
      modelConfig: customConfig({ baseUrl: 'http://api.openai.com/v1/chat/completions' }),
    });
    record('7.4.1', '非 HTTPS 被拒绝', res.json?.success === false && /HTTPS/.test(res.json?.message || ''), res.json?.message);
  }
  {
    const res = await postJson('/models/test', {
      modelConfig: customConfig({ baseUrl: 'http://localhost:4999/redirect' }),
    });
    record('7.5.1', '重定向被禁止', res.json?.success === false, res.json?.message);
  }

  // ============================================================
  // 解析与异常
  // ============================================================
  for (const [id, model, label] of [
    ['8.4.2a', 'markdown-game', 'Markdown JSON'],
    ['8.4.2b', 'plain-html', '纯 HTML'],
    ['8.4.2c', 'truncated-json', '截断 JSON'],
  ]) {
    const res = await postJson('/generate', {
      userPrompt: '做一个收集星星的游戏',
      modelConfig: customConfig({ model }),
    });
    record(id, `解析兜底：${label}`, res.json?.success === true && typeof res.json?.data?.gameHtml === 'string' && res.json.data.gameHtml.length > 0);
  }
  {
    const res = await postJson('/generate', {
      templateId: 'animal',
      userPrompt: '小兔子',
      remixFrom: 'work-1',
      remixInstruction: '加一个 Boss',
      modelId: 'doubao',
    });
    record('5.3.9', 'Remix 携带模型', res.json?.success === true && res.json?.data?.model === 'doubao');
  }
  {
    const res = await postJson('/generate', {});
    record('9.13', '缺少 userPrompt 返回 400', res.status === 400 && res.json?.success === false, `status=${res.status}`);
  }
  {
    const res = await postJson('/models/test', 'xxx');
    record('9.12', '测试接口非法 JSON 返回 400', res.status === 400);
  }

  // ============================================================
  // 汇总
  // ============================================================
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n===== 汇总：${passed}/${results.length} 通过，${failed} 失败 =====`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('测试脚本异常:', error);
  process.exit(1);
});
