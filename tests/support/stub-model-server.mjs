/**
 * OpenAI 兼容测试桩（进程内）。
 *
 * 每个测试文件自行 createStubServer()，端口 0 动态分配，互不干扰。
 * 通过 lastRequest / reset() 断言上游 Prompt。
 */

import http from 'node:http';

const standardGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>测试收集小游戏</title>
  <style>
    body { margin:0; background:#fff3cd; font-family:system-ui, sans-serif; }
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

function sendChat(res, content) {
  sendJson(res, 200, {
    id: 'chatcmpl-test-stub',
    model: 'stub',
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

/**
 * @param {{ host?: string, port?: number }} [options]
 */
export async function createStubServer(options = {}) {
  const host = options.host || '127.0.0.1';
  let lastRequest = null;

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

    if (req.method !== 'POST' || !req.url?.startsWith('/v1/chat/completions')) {
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

    switch (model) {
      case 'stub-force-500':
        sendJson(res, 500, { error: { message: 'stub internal error' } });
        return;
      case 'stub-empty':
        sendChat(res, '');
        return;
      case 'stub-remix-no-score':
        sendChat(res, buildRemixContent(userPrompt, { noScore: true }));
        return;
      case 'stub-remix-plain': {
        const parsed = JSON.parse(buildRemixContent(userPrompt));
        sendChat(res, parsed.html);
        return;
      }
      case 'stub-remix':
        sendChat(res, buildRemixContent(userPrompt));
        return;
      case 'stub-model':
      default:
        if (systemPrompt.includes('Remix 模式')) {
          sendChat(res, buildRemixContent(userPrompt));
        } else {
          sendChat(res, JSON.stringify({ title: '测试收集小游戏', html: standardGame }));
        }
        return;
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, resolve);
  });

  const { port } = server.address();
  const baseUrl = `http://${host}:${port}`;

  return {
    baseUrl,
    chatUrl: `${baseUrl}/v1/chat/completions`,
    getLastRequest: () => lastRequest,
    reset: () => {
      lastRequest = null;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
