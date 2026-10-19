/**
 * V3.3 真实模型 Remix 保真验证
 *
 * 前置：使用真实 .env 启动本地后端（不要指向测试桩）
 *   cd server && PORT=4002 ./node_modules/.bin/tsx src/index.ts
 *
 * 运行：node temp/v3.3/real-remix-check.mjs
 *
 * 注意：会真实调用模型，耗时可能 1-5 分钟，产生少量费用。
 */

import { writeFileSync } from 'node:fs';

const API = process.env.REAL_API || 'http://localhost:4002/api';

const sourceGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>星星收集大冒险</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      background: linear-gradient(135deg, #74b9ff, #a29bfe);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      overflow: hidden;
      touch-action: manipulation;
    }
    #score {
      position: fixed; top: 16px; left: 16px;
      font-size: 28px; color: #fff; font-weight: bold;
      text-shadow: 0 2px 6px rgba(0,0,0,.25);
    }
    #time {
      position: fixed; top: 16px; right: 16px;
      font-size: 22px; color: #fff; font-weight: bold;
    }
    #target {
      font-size: 96px; cursor: pointer; user-select: none;
      transition: transform .1s;
    }
    #target:active { transform: scale(.9); }
    #hint { position: fixed; bottom: 24px; color: #fff; font-size: 16px; }
    #gameover {
      position: fixed; inset: 0; display: none;
      align-items: center; justify-content: center;
      flex-direction: column; background: rgba(0,0,0,.65); color: #fff;
    }
    #gameover button {
      margin-top: 20px; padding: 14px 28px; font-size: 20px;
      border: none; border-radius: 18px; background: #ffeaa7; cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div id="time">时间：30</div>
  <div id="target">⭐</div>
  <div id="hint">点击星星得分，收集 10 颗就胜利！</div>
  <div id="gameover">
    <h1 id="result">胜利！</h1>
    <button id="restart">再玩一次</button>
  </div>
  <!-- SFX: collect -->
  <script>
    let score = 0;
    let timeLeft = 30;
    let playing = true;
    const target = document.getElementById('target');
    const scoreEl = document.getElementById('score');
    const timeEl = document.getElementById('time');
    const overEl = document.getElementById('gameover');
    const resultEl = document.getElementById('result');

    function endGame(win) {
      if (!playing) return;
      playing = false;
      resultEl.textContent = win ? '胜利！' : '失败！';
      overEl.style.display = 'flex';
    }

    target.addEventListener('click', () => {
      if (!playing) return;
      score += 1;
      scoreEl.textContent = '得分：' + score;
      target.style.transform = 'scale(.8)';
      setTimeout(() => { target.style.transform = ''; }, 100);
      if (score >= 10) endGame(true);
    });

    const timer = setInterval(() => {
      if (!playing) return;
      timeLeft -= 1;
      timeEl.textContent = '时间：' + timeLeft;
      if (timeLeft <= 0) endGame(false);
    }, 1000);

    document.getElementById('restart').addEventListener('click', () => {
      clearInterval(timer);
      score = 0; timeLeft = 30; playing = true;
      scoreEl.textContent = '得分：0';
      timeEl.textContent = '时间：30';
      overEl.style.display = 'none';
    });
  </script>
</body>
</html>`;

const results = [];

function record(id, name, ok, detail = '') {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const health = await fetch(`${API}/models`).catch(() => null);
  if (!health || !health.ok) {
    throw new Error(`真实后端不可用：${API}`);
  }

  console.log('[real] 发起真实模型 Remix，请耐心等待...');
  const started = Date.now();
  const res = await fetch(`${API}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: 'animal',
      userPrompt: '把星星换成宝石，并加一个会扣分的炸弹',
      remixFrom: 'real-original-1',
      remixInstruction: '把星星换成宝石，并加一个会扣分的炸弹',
      originalTitle: '星星收集大冒险',
      originalUserPrompt: '做一个点击收集星星的游戏，30 秒内收集 10 颗星星胜利',
      originalGameHtml: sourceGame,
    }),
  });
  const latency = Date.now() - started;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const data = json?.data || {};
  record(
    'REAL-01a',
    '真实模型 Remix 返回成功',
    res.status === 200 && json?.success === true && typeof data.gameHtml === 'string',
    `status=${res.status}, latency=${latency}ms, htmlLen=${data.gameHtml?.length}`
  );
  record(
    'REAL-01b',
    '返回 Remix 模式与档案',
    data.remixMode === 'full' &&
      data.remixProfile?.title === '星星收集大冒险' &&
      data.remixProfile?.interactions?.includes('点击') &&
      data.remixProfile?.hasScore === true,
    JSON.stringify({
      mode: data.remixMode,
      profile: data.remixProfile,
    })
  );
  record(
    'REAL-01c',
    '结构审计保留原玩法',
    data.remixAudit?.renderPreserved === true &&
      data.remixAudit?.interactionsPreserved === true &&
      data.remixAudit?.scorePreserved === true &&
      data.remixAudit?.winLosePreserved === true &&
      data.remixAudit?.preserved === true,
    JSON.stringify(data.remixAudit)
  );
  record(
    'REAL-01d',
    '改编结果与原游戏不同',
    data.remixAudit?.changed === true && data.gameHtml !== sourceGame,
    ''
  );
  record(
    'REAL-01e',
    '标题保留原游戏标题',
    data.title === '星星收集大冒险' || data.remixAudit?.titlePreserved === true,
    data.title
  );

  if (typeof data.gameHtml === 'string' && data.gameHtml.trim()) {
    const outPath = 'temp/v3.3/real-remix-output.html';
    writeFileSync(outPath, data.gameHtml, 'utf8');
    console.log(`[real] 输出已写入 ${outPath}`);
  }

  // 输出模型与耗时信息，便于报告记录
  console.log(
    `[real] model=${data.modelName || data.model || 'unknown'}, latency=${(latency / 1000).toFixed(1)}s`
  );
  if (data.warning) console.log(`[real] warning=${data.warning}`);

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n===== 真实模型：${passed}/${results.length} 通过，${failed} 失败 =====`
  );
  if (failed > 0) {
    console.log(text.slice(0, 1000));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
