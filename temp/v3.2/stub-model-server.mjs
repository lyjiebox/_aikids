/**
 * V3.2 UAT 模型测试桩
 *
 * 模拟 OpenAI 兼容的 /v1/chat/completions 接口，用于本地验证：
 * - 模型测试（固定短 Prompt，返回 OK）
 * - 游戏生成（返回可解析的 JSON / Markdown / 纯 HTML / 截断 JSON）
 * - 401 / 500 / 空响应 / 超时 / 重定向
 *
 * 启动：node temp/v3.2/stub-model-server.mjs
 * 监听：http://localhost:4999
 */

import http from 'node:http';

const PORT = Number(process.env.STUB_PORT) || 4999;

const gameHtml = `<!DOCTYPE html>
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
  <!-- SFX: collect -->
  <script>
    let score = 0;
    const star = document.getElementById('star');
    const scoreEl = document.getElementById('score');
    star.addEventListener('click', () => {
      score += 1;
      scoreEl.textContent = '得分：' + score;
    });
  </script>
</body>
</html>`;

const game = {
  title: '测试收集小游戏',
  html: gameHtml,
};

function jsonGame() {
  return JSON.stringify(game);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } catch (error) {
        reject(error);
      }
    });
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
    id: 'chatcmpl-stub',
    model: 'stub-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
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

  // 用于测试 redirect: 'error'
  if (req.url === '/redirect') {
    res.writeHead(302, {
      Location: `http://localhost:${PORT}/v1/chat/completions`,
    });
    res.end();
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

  const model = body.model || 'unknown';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const isTest =
    Number(body.max_tokens) <= 8 ||
    messages.some((message) =>
      String(message.content || '').includes('请只回复：OK')
    );

  // 日志用于 UAT 核对（不输出 Authorization）
  console.log(
    JSON.stringify({
      model,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      test: isTest,
      messages: messages.map((message) => ({
        role: message.role,
        content: String(message.content || '').slice(0, 80),
      })),
    })
  );

  const testReply = 'OK';

  switch (model) {
    case 'force-401':
      sendJson(res, 401, {
        error: { message: 'invalid api key', type: 'authentication_error' },
      });
      return;

    case 'force-500':
      sendJson(res, 500, { error: { message: 'internal server error' } });
      return;

    case 'force-empty':
      sendChat(res, '');
      return;

    case 'force-timeout':
      setTimeout(() => {
        sendChat(res, isTest ? testReply : jsonGame());
      }, 10000);
      return;

    case 'markdown-game':
      if (isTest) {
        sendChat(res, testReply);
      } else {
        sendChat(res, '```json\n' + jsonGame() + '\n```');
      }
      return;

    case 'plain-html':
      if (isTest) {
        sendChat(res, testReply);
      } else {
        sendChat(res, gameHtml);
      }
      return;

    case 'truncated-json':
      if (isTest) {
        sendChat(res, testReply);
      } else {
        sendChat(
          res,
          '{"title":"截断游戏","html":"<!DOCTYPE html><html><head><title>x</title></head><body>'
        );
      }
      return;

    case 'stub-model':
    default:
      sendChat(res, isTest ? testReply : jsonGame());
      return;
  }
});

server.listen(PORT, () => {
  console.log(`[stub] listening on http://localhost:${PORT}`);
});
