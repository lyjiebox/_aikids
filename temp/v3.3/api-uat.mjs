/**
 * V3.3 本地 server/ Remix API 自动化验收
 *
 * 前置：
 *   1. node temp/v3.3/stub-remix-server.mjs
 *   2. cd server && VOLCENGINE_API_KEY=test-key \
 *      VOLCENGINE_BASE_URL=http://localhost:4998/v1/chat/completions \
 *      DOUBAO_ENDPOINT_ID=ep-doubao-uat DEEPSEEK_ENDPOINT_ID=ep-deepseek-uat \
 *      GAME_MODEL=deepseek ALLOW_LOCAL_MODEL_HOSTS=1 MODEL_TEST_TIMEOUT_MS=2000 \
 *      npm run dev
 *   3. node temp/v3.3/api-uat.mjs
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';
const STUB_BASE = 'http://localhost:4998';
const STUB_URL = `${STUB_BASE}/v1/chat/completions`;

const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function postJson(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function customConfig(model = 'remix-stub') {
  return {
    id: 'custom-remix-uat',
    name: 'Remix 测试桩',
    baseUrl: STUB_URL,
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
// 样本
// ============================================================

const sourceGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>星星收集大冒险</title>
  <style>
    body { margin:0; background:#ffeaa7; font-family:system-ui, sans-serif; }
    #score { position:fixed; top:12px; left:12px; font-size:26px; font-weight:bold; }
    .star { font-size:64px; cursor:pointer; }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div class="star" id="star">⭐</div>
  <div id="status">收集 10 颗星星就胜利，时间到则失败</div>
  <!-- SFX: collect -->
  <script>
    let score = 0;
    let timeLeft = 30;
    const star = document.getElementById('star');
    const scoreEl = document.getElementById('score');
    star.addEventListener('click', () => {
      score += 1;
      scoreEl.textContent = '得分：' + score;
      if (score >= 10) { alert('胜利！'); }
    });
    setInterval(() => { timeLeft -= 1; if (timeLeft <= 0) { alert('失败'); } }, 1000);
  </script>
</body>
</html>`;

const BIG_MARKER = 'MIDDLE_MARKER_SHOULD_BE_OMITTED';
const bigGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>超长源码游戏</title>
  <style>${'body{margin:0;background:#fff}\n'.repeat(700)}</style>
</head>
<body>
  <div id="score">得分：0</div>
  <div id="win">胜利</div>
  ${'<div class="item">⭐</div>\n'.repeat(500)}
  <div id="middle">${BIG_MARKER}</div>
  ${'<div class="item">💎</div>\n'.repeat(500)}
  <script>
    let score = 0;
    document.addEventListener('click', () => { score += 1; });
    setInterval(() => {}, 1000);
  </script>
</body>
</html>`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================
// 用例
// ============================================================

async function main() {
  // 0. 环境检查
  const health = await request('/models').catch(() => null);
  if (!health || health.status !== 200) {
    throw new Error(
      `本地后端不可用：${API_BASE}。请先启动 stub 与 server（见脚本注释）`
    );
  }

  // ------------------------------------------------------------
  // API-01 完整源码 Remix
  // ------------------------------------------------------------
  await resetStub();
  let remixResponse;
  {
    remixResponse = await postJson('/generate', {
      templateId: 'animal',
      userPrompt: '把星星换成宝石，并加一个会扣分的炸弹',
      remixFrom: 'work-original-1',
      remixInstruction: '把星星换成宝石，并加一个会扣分的炸弹',
      originalTitle: '星星收集大冒险',
      originalUserPrompt: '做一个收集星星的游戏',
      originalGameHtml: sourceGame,
      modelConfig: customConfig(),
    });

    const data = remixResponse.json?.data || {};
    record(
      'API-01a',
      '完整源码 Remix 返回成功',
      remixResponse.status === 200 &&
        remixResponse.json?.success === true &&
        typeof data.gameHtml === 'string' &&
        data.gameHtml.includes('BOSS'),
      `status=${remixResponse.status}, htmlLen=${data.gameHtml?.length}`
    );
    record(
      'API-01b',
      'Remix 模式为 full',
      data.remixMode === 'full',
      String(data.remixMode)
    );
    record(
      'API-01c',
      '返回原游戏档案',
      data.remixProfile?.title === '星星收集大冒险' &&
        data.remixProfile?.render === 'dom' &&
        data.remixProfile?.interactions?.includes('点击') &&
        data.remixProfile?.hasScore === true &&
        data.remixProfile?.hasWinLose === true,
      JSON.stringify(data.remixProfile)
    );
    record(
      'API-01d',
      '返回 Remix 审计且保留原玩法',
      data.remixAudit?.preserved === true &&
        data.remixAudit?.renderPreserved === true &&
        data.remixAudit?.interactionsPreserved === true &&
        data.remixAudit?.scorePreserved === true &&
        data.remixAudit?.winLosePreserved === true &&
        data.remixAudit?.changed === true,
      JSON.stringify(data.remixAudit)
    );
  }

  // ------------------------------------------------------------
  // API-02 Prompt 内容
  // ------------------------------------------------------------
  {
    const captured = await getLastRequest();
    const messages = Array.isArray(captured.messages) ? captured.messages : [];
    const system = String(
      messages.find((message) => message.role === 'system')?.content || ''
    );
    const user = String(
      messages.find((message) => message.role === 'user')?.content || ''
    );

    record(
      'API-02a',
      'System Prompt 含 Remix 硬性规则',
      system.includes('Remix 模式') &&
        system.includes('不是从零创作') &&
        system.includes('保留原游戏') &&
        system.includes('不得整体重写'),
      ''
    );
    record(
      'API-02b',
      'User Prompt 含游戏档案',
      user.includes('- 标题：星星收集大冒险') &&
        user.includes('主题模板：动物乐园') &&
        user.includes('渲染方式：DOM 元素') &&
        user.includes('核心交互：点击') &&
        user.includes('核心机制：') &&
        user.includes('得分系统：有') &&
        user.includes('胜负条件：有'),
      ''
    );
    record(
      'API-02c',
      'User Prompt 含完整原游戏源码',
      user.includes('<game_source>') &&
        user.includes('星星收集大冒险') &&
        user.includes('let score = 0;') &&
        user.includes('setInterval'),
      `promptLen=${user.length}`
    );
    record(
      'API-02d',
      'User Prompt 含改编指令与原描述',
      user.includes('把星星换成宝石') &&
        user.includes('做一个收集星星的游戏'),
      ''
    );
    record(
      'API-02e',
      'Remix 输出上限为 16384',
      captured.max_tokens === 16384,
      String(captured.max_tokens)
    );
  }

  // ------------------------------------------------------------
  // API-03 超长源码 → outline
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'free',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-big',
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
      'API-03a',
      '超长源码返回成功',
      res.status === 200 && res.json?.success === true,
      `status=${res.status}`
    );
    record(
      'API-03b',
      '超长源码进入 outline',
      data.remixMode === 'outline',
      String(data.remixMode)
    );
    record(
      'API-03c',
      'Prompt 含片段与省略说明',
      user.includes('片段 1/3') &&
        user.includes('片段 2/3') &&
        user.includes('片段 3/3') &&
        user.includes('未展示') &&
        user.includes('源码过长'),
      ''
    );
    record(
      'API-03d',
      '中间超长段落未注入',
      !user.includes(BIG_MARKER),
      ''
    );
    record(
      'API-03e',
      'outline 仍保留脚本关键内容',
      user.includes('document.addEventListener') &&
        user.includes('setInterval'),
      ''
    );
  }

  // ------------------------------------------------------------
  // API-04 旧客户端 preview
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'free',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-legacy',
      remixInstruction: '加一个 Boss',
      originalTitle: '旧版游戏',
      originalUserPrompt: '旧描述',
      originalGameHtmlPreview: sourceGame.slice(0, 300),
      modelConfig: customConfig(),
    });
    const data = res.json?.data || {};
    const captured = await getLastRequest();
    const user = String(
      (captured.messages || []).find((message) => message.role === 'user')
        ?.content || ''
    );

    record(
      'API-04a',
      '仅有 preview 时成功',
      res.status === 200 && res.json?.success === true,
      `status=${res.status}`
    );
    record(
      'API-04b',
      'preview 模式与提示',
      data.remixMode === 'preview' &&
        user.includes('少量源码预览') &&
        user.includes('不完整'),
      String(data.remixMode)
    );
  }

  // ------------------------------------------------------------
  // API-05 模型失败保留原游戏
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'animal',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-original-1',
      remixInstruction: '加一个 Boss',
      originalTitle: '星星收集大冒险',
      originalUserPrompt: '做一个收集星星的游戏',
      originalGameHtml: sourceGame,
      modelConfig: customConfig('remix-force-500'),
    });
    const data = res.json?.data || {};
    record(
      'API-05a',
      '模型失败时返回成功 + remixFallback',
      res.status === 200 &&
        res.json?.success === true &&
        data.remixFallback === true &&
        data.remixMode === 'fallback',
      `status=${res.status}, mode=${data.remixMode}`
    );
    record(
      'API-05b',
      '失败时原样保留原游戏 HTML',
      data.gameHtml === sourceGame && data.title === '星星收集大冒险',
      `htmlLen=${data.gameHtml?.length}`
    );
    record(
      'API-05c',
      '失败提示明确保留原游戏',
      /保留原游戏/.test(data.warning || ''),
      data.warning
    );
  }

  // ------------------------------------------------------------
  // API-06 无模型时保留原游戏（独立后端 4001）
  // ------------------------------------------------------------
  {
    const child = spawn(
      process.execPath,
      [
        '../../server/node_modules/tsx/dist/cli.mjs',
        '../../server/src/index.ts',
      ],
      {
        cwd: 'temp/v3.3',
        env: {
          PATH: process.env.PATH,
          PORT: '4001',
          // 清空所有模型环境变量，模拟「未配置模型」
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let childLog = '';
    child.stdout.on('data', (chunk) => {
      childLog += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      childLog += chunk.toString();
    });

    try {
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch('http://localhost:4001/');
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          // 继续等待
        }
        await sleep(200);
      }
      if (!ready) throw new Error(`无模型后端启动失败：${childLog.slice(-500)}`);

      const res = await fetch('http://localhost:4001/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'animal',
          userPrompt: '加一个 Boss',
          remixFrom: 'work-original-1',
          remixInstruction: '加一个 Boss',
          originalTitle: '星星收集大冒险',
          originalUserPrompt: '做一个收集星星的游戏',
          originalGameHtml: sourceGame,
        }),
      });
      const json = await res.json();
      const data = json.data || {};
      record(
        'API-06a',
        '无模型时 remixFallback=true',
        res.status === 200 &&
          json.success === true &&
          data.remixFallback === true &&
          data.remixMode === 'fallback',
        `status=${res.status}, mode=${data.remixMode}`
      );
      record(
        'API-06b',
        '无模型时不返回随机 Mock',
        data.gameHtml === sourceGame,
        `htmlLen=${data.gameHtml?.length}`
      );
      record(
        'API-06c',
        '无模型提示保留原游戏',
        /保留原游戏/.test(data.warning || ''),
        data.warning
      );
    } finally {
      child.kill('SIGTERM');
      await sleep(300);
    }
  }

  // ------------------------------------------------------------
  // API-07 普通生成回归
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'space',
      userPrompt: '做一个太空收集游戏',
      modelConfig: customConfig(),
    });
    const data = res.json?.data || {};
    const captured = await getLastRequest();
    const messages = captured.messages || [];
    const system = String(
      messages.find((message) => message.role === 'system')?.content || ''
    );

    record(
      'API-07a',
      '普通生成成功',
      res.status === 200 && res.json?.success === true && data.gameHtml,
      `status=${res.status}`
    );
    record(
      'API-07b',
      '普通生成不带 Remix 字段',
      data.remixMode === undefined &&
        data.remixAudit === undefined &&
        data.remixFallback === undefined,
      JSON.stringify({
        mode: data.remixMode,
        audit: data.remixAudit,
        fallback: data.remixFallback,
      })
    );
    record(
      'API-07c',
      '普通生成 System Prompt 不含 Remix 规则',
      !system.includes('Remix 模式'),
      ''
    );
    record(
      'API-07d',
      '普通生成输出上限仍为 8192',
      captured.max_tokens === 8192,
      String(captured.max_tokens)
    );
  }

  // ------------------------------------------------------------
  // API-08 纯 HTML 解析
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'animal',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-original-1',
      remixInstruction: '加一个 Boss',
      originalTitle: '星星收集大冒险',
      originalUserPrompt: '做一个收集星星的游戏',
      originalGameHtml: sourceGame,
      modelConfig: customConfig('remix-plain'),
    });
    const data = res.json?.data || {};
    record(
      'API-08a',
      '纯 HTML 输出可解析',
      res.status === 200 &&
        res.json?.success === true &&
        typeof data.gameHtml === 'string' &&
        data.gameHtml.includes('BOSS') &&
        data.remixAudit?.preserved === true,
      `status=${res.status}`
    );
  }

  // ------------------------------------------------------------
  // API-09 审计识别未保留
  // ------------------------------------------------------------
  {
    await resetStub();
    const res = await postJson('/generate', {
      templateId: 'animal',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-original-1',
      remixInstruction: '加一个 Boss',
      originalTitle: '星星收集大冒险',
      originalUserPrompt: '做一个收集星星的游戏',
      originalGameHtml: sourceGame,
      modelConfig: customConfig('remix-no-score'),
    });
    const data = res.json?.data || {};
    record(
      'API-09a',
      '删除得分系统时 audit 识别失败',
      res.status === 200 &&
        data.remixAudit?.scorePreserved === false &&
        data.remixAudit?.preserved === false,
      JSON.stringify(data.remixAudit)
    );
    record(
      'API-09b',
      '审计失败仍返回游戏（不拦截）',
      typeof data.gameHtml === 'string' && data.gameHtml.length > 0,
      `htmlLen=${data.gameHtml?.length}`
    );
  }

  // ------------------------------------------------------------
  // API-10 安全与异常
  // ------------------------------------------------------------
  {
    const text = remixResponse.text || '';
    record(
      'API-10a',
      '响应不回显 API Key',
      !text.includes('test-key') && !text.includes('apiKey'),
      ''
    );
  }
  {
    const res = await postJson('/generate', {
      templateId: 'free',
      userPrompt: '加一个 Boss',
      remixFrom: 'work-weird',
      remixInstruction: '加一个 Boss',
      originalTitle: '异常类型',
      originalGameHtml: { foo: 'bar' },
      originalGameHtmlPreview: 123,
      modelConfig: customConfig(),
    });
    record(
      'API-10b',
      '非字符串源码不导致 500',
      res.status === 200 && res.json?.success === true,
      `status=${res.status}`
    );
  }

  // ============================================================
  // 汇总
  // ============================================================
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n===== 本地 API：${passed}/${results.length} 通过，${failed} 失败 =====`
  );
  if (failed > 0) {
    console.log('\n失败项：');
    for (const item of results.filter((entry) => !entry.ok)) {
      console.log(`- ${item.id} ${item.name} — ${item.detail}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
