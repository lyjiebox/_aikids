/**
 * V3.3 Remix 专用测试桩
 *
 * 模拟 OpenAI 兼容的 /v1/chat/completions：
 * - remix-stub：基于 Prompt 中的原游戏源码做增量修改（加 Boss），保留标题
 * - remix-no-score：返回删掉得分系统的版本（验证审计）
 * - remix-force-500：返回 500（验证保留原游戏）
 * - remix-plain：返回纯 HTML（验证解析）
 * - stub-model：普通生成
 *
 * 辅助接口：
 * - GET  /last-request：查看最近一次请求体
 * - POST /reset：清空捕获
 *
 * 启动：node temp/v3.3/stub-remix-server.mjs
 * 监听：http://localhost:4998
 */

import http from 'node:http';

const PORT = Number(process.env.STUB_PORT) || 4998;

const standardGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>测试收集小游戏</title>
  <style>
    body { margin:0; background:#fff3cd; font-family:system-ui, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    #score { position:fixed; top:12px; left:12px; font-size:24px; font-weight:bold; }
    .star { font-size:60px; cursor:pointer; }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div class="star" id="star">⭐</div>
  <div id="status">收集 10 颗星星胜利，时间到失败</div>
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
    setInterval(() => { timeLeft -= 1; }, 1000);
  </script>
</body>
</html>`;

let lastRequest = null;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendText(res, status, body) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendChat(res, content) {
  sendJson(res, 200, {
    id: 'chatcmpl-remix-stub',
    model: 'remix-stub',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  });
}

function extractUserPrompt(messages) {
  const user = messages.find((message) => message.role === 'user');
  return String(user?.content || '');
}

function extractTitle(prompt) {
  const match = prompt.match(/- 标题：([^\n]+)/);
  return match ? match[1].trim() : '测试收集小游戏';
}

function extractSource(prompt) {
  const match = prompt.match(/<game_source>\n?([\s\S]*?)\n?<\/game_source>/);
  return match ? match[1] : '';
}

function addBoss(source) {
  const boss =
    '\n<div id="boss" style="position:fixed;right:12px;bottom:12px;font-size:40px">👾 BOSS</div>\n<!-- SFX: boss-appear -->\n';
  if (source.includes('</body>')) {
    return source.replace('</body>', `${boss}</body>`);
  }
  return `${source}\n${boss}`;
}

function buildRemixContent(prompt, { noScore = false } = {}) {
  const source = extractSource(prompt);
  const title = extractTitle(prompt);

  // outline / preview 无法直接还原完整代码：返回同结构标准游戏
  const base = source && !source.includes('片段 1/3') ? source : standardGame;

  let html = addBoss(base);
  if (noScore) {
    html = html
      .replace(/<div id="score">[\s\S]*?<\/div>/i, '')
      .replace(/\bscore\b/gi, 'quantity')
      .replace(/得分/g, '数量');
  }

  return JSON.stringify({ title, html });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/last-request') {
    sendJson(res, 200, lastRequest ? lastRequest : { empty: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/reset') {
    lastRequest = null;
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/v1/chat/completions')) {
    sendJson(res, 404, { error: { message: 'not found' } });
    return;
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: { message: 'invalid json' } });
    return;
  }

  lastRequest = body;

  const model = body.model || 'unknown';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userPrompt = extractUserPrompt(messages);
  const systemPrompt = String(
    messages.find((message) => message.role === 'system')?.content || ''
  );

  console.log(
    JSON.stringify({
      model,
      max_tokens: body.max_tokens,
      remix: systemPrompt.includes('Remix 模式'),
      promptLen: userPrompt.length,
      hasSource: userPrompt.includes('<game_source>'),
      title: extractTitle(userPrompt),
    })
  );

  switch (model) {
    case 'remix-force-500':
      sendJson(res, 500, { error: { message: 'stub internal error' } });
      return;

    case 'remix-no-score':
      sendChat(res, buildRemixContent(userPrompt, { noScore: true }));
      return;

    case 'remix-plain': {
      const content = buildRemixContent(userPrompt);
      const parsed = JSON.parse(content);
      sendChat(res, parsed.html);
      return;
    }

    case 'remix-stub':
      sendChat(res, buildRemixContent(userPrompt));
      return;

    case 'stub-model':
    default:
      if (systemPrompt.includes('Remix 模式')) {
        sendChat(res, buildRemixContent(userPrompt));
      } else {
        sendChat(res, JSON.stringify({
          title: '测试收集小游戏',
          html: standardGame,
        }));
      }
      return;
  }
});

server.listen(PORT, () => {
  console.log(`[remix-stub] listening on http://localhost:${PORT}`);
});
