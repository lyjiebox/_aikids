/**
 * V3.3 线上 Vercel Remix 验收
 *
 * 前置：GitHub push 后 Vercel 自动部署完成
 * 运行：node temp/v3.3/vercel-remix-check.mjs
 *
 * 会真实调用线上模型，耗时约 1-5 分钟。
 */

import { writeFileSync } from 'node:fs';

const SITE = process.env.SITE || 'https://www.boxaikids.top';
const API = `${SITE}/api`;

const sourceGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>云朵收集小游戏</title>
  <style>
    body { margin:0; background:linear-gradient(#87ceeb,#e0f7ff); min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:system-ui,sans-serif; }
    #score { position:fixed; top:16px; left:16px; font-size:26px; font-weight:bold; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,.25); }
    #target { font-size:88px; cursor:pointer; user-select:none; }
    #hint { position:fixed; bottom:20px; color:#fff; font-size:15px; }
    #over { position:fixed; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; background:rgba(0,0,0,.55); color:#fff; }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div id="target">☁️</div>
  <div id="hint">点击云朵得分，收集 8 朵胜利，30 秒内没收集完就失败</div>
  <div id="over"><h1 id="result">胜利！</h1><button id="restart">再玩一次</button></div>
  <!-- SFX: collect -->
  <script>
    let score = 0;
    let timeLeft = 30;
    let playing = true;
    const target = document.getElementById('target');
    const scoreEl = document.getElementById('score');
    const overEl = document.getElementById('over');
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
      target.style.transform = 'scale(.85)';
      setTimeout(() => { target.style.transform = ''; }, 120);
      if (score >= 8) endGame(true);
    });

    setInterval(() => {
      if (!playing) return;
      timeLeft -= 1;
      if (timeLeft <= 0) endGame(false);
    }, 1000);

    document.getElementById('restart').addEventListener('click', () => {
      score = 0; timeLeft = 30; playing = true;
      scoreEl.textContent = '得分：0';
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
  // ------------------------------------------------------------
  // PROD-01 前端资源已更新
  // ------------------------------------------------------------
  {
    const htmlRes = await fetch(`${SITE}/`, { redirect: 'follow' });
    const html = await htmlRes.text();
    const match = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/);
    let hasNewCopy = false;
    let asset = '';
    if (match) {
      asset = match[1];
      const jsRes = await fetch(asset.startsWith('http') ? asset : `${SITE}${asset}`);
      const js = await jsRes.text();
      hasNewCopy =
        js.includes('基于《') &&
        js.includes('保留原玩法') &&
        js.includes('不会重新生成一个完全不同的游戏');
    }
    record(
      'PROD-01a',
      '线上页面可访问且引用 JS 资源',
      htmlRes.status === 200 && Boolean(match),
      `status=${htmlRes.status}, asset=${asset}`
    );
    record(
      'PROD-01b',
      '线上前端包含 V3.3 Remix 文案',
      hasNewCopy,
      asset
    );
  }

  // ------------------------------------------------------------
  // PROD-02 线上 API Remix
  // ------------------------------------------------------------
  let data = {};
  {
    console.log('[prod] 发起线上真实 Remix，请耐心等待...');
    const started = Date.now();
    const res = await fetch(`${API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: 'free',
        userPrompt: '把云朵换成彩虹，并加一个会扣分的闪电',
        remixFrom: 'prod-original-1',
        remixInstruction: '把云朵换成彩虹，并加一个会扣分的闪电',
        originalTitle: '云朵收集小游戏',
        originalUserPrompt: '做一个点击收集云朵的游戏，30 秒内收集 8 朵胜利',
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
    data = json?.data || {};

    record(
      'PROD-02a',
      '线上 Remix 返回成功',
      res.status === 200 &&
        json?.success === true &&
        typeof data.gameHtml === 'string',
      `status=${res.status}, latency=${(latency / 1000).toFixed(1)}s, htmlLen=${data.gameHtml?.length}`
    );
    record(
      'PROD-02b',
      '线上使用 full 模式并返回档案',
      data.remixMode === 'full' &&
        data.remixProfile?.interactions?.includes('点击') &&
        data.remixProfile?.hasScore === true,
      `mode=${data.remixMode}`
    );
    record(
      'PROD-02c',
      '线上结构审计保留原玩法',
      data.remixAudit?.preserved === true &&
        data.remixAudit?.renderPreserved === true &&
        data.remixAudit?.interactionsPreserved === true &&
        data.remixAudit?.scorePreserved === true &&
        data.remixAudit?.winLosePreserved === true,
      JSON.stringify(data.remixAudit)
    );
    record(
      'PROD-02d',
      '线上改编结果与原游戏不同',
      data.remixAudit?.changed === true && data.gameHtml !== sourceGame,
      ''
    );

    if (typeof data.gameHtml === 'string' && data.gameHtml.trim()) {
      const outPath = 'temp/v3.3/vercel-remix-output.html';
      writeFileSync(outPath, data.gameHtml, 'utf8');
      console.log(`[prod] 输出已写入 ${outPath}`);
    }
    if (data.warning) console.log(`[prod] warning=${data.warning}`);
  }

  // ------------------------------------------------------------
  // PROD-03 线上普通生成回归
  // ------------------------------------------------------------
  {
    const res = await fetch(`${API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: 'space',
        userPrompt: '做一个太空收集星星的小游戏',
      }),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const plain = json?.data || {};
    record(
      'PROD-03a',
      '线上普通生成成功',
      res.status === 200 && json?.success === true && Boolean(plain.gameHtml),
      `status=${res.status}`
    );
    record(
      'PROD-03b',
      '线上普通生成不带 Remix 字段',
      plain.remixMode === undefined &&
        plain.remixAudit === undefined &&
        plain.remixFallback === undefined,
      ''
    );
  }

  // ------------------------------------------------------------
  // PROD-04 安全
  // ------------------------------------------------------------
  record(
    'PROD-04a',
    '线上响应不泄露 API Key',
    !JSON.stringify(data).includes('apiKey') &&
      !JSON.stringify(data).includes('sk-'),
    ''
  );

  // ============================================================
  // 汇总
  // ============================================================
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n===== 线上 Vercel：${passed}/${results.length} 通过，${failed} 失败 =====`
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
