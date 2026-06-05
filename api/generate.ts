import { Hono } from 'hono';
import { handle } from '@hono/node-server/vercel';

// 简单的Mock游戏生成器
function generateMockGame(prompt: string, templateId?: string) {
  const games = [
    {
      title: "跳跃的小兔子",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>跳跃的小兔子</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { 
      background: linear-gradient(135deg, #90ee90 0%, #87ceeb 100%);
      display:flex; align-items:center; justify-content:center; 
      min-height:100vh; font-family:system-ui, sans-serif;
    }
    .game {
      width:100%; max-width:500px; text-align:center; padding:20px;
    }
    .bunny {
      font-size:100px; cursor:pointer; display:inline-block;
      transition: transform 0.1s;
    }
    .bunny:active { transform: translateY(-20px) scale(1.1); }
    .score {
      font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="bunny" id="bunny">🐰</div>
  </div>
  <script>
    let score = 0;
    const bunny = document.getElementById('bunny');
    const scoreEl = document.getElementById('score');
    bunny.addEventListener('click', () => {
      score++;
      scoreEl.textContent = score;
      bunny.style.animation = 'none';
      setTimeout(() => bunny.style.animation = '', 10);
    });
  </script>
</body>
</html>`
    },
    {
      title: "太空飞船大冒险",
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>太空飞船大冒险</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { 
      background: linear-gradient(135deg, #0c0c1e 0%, #3a1c71 100%);
      display:flex; align-items:center; justify-content:center; 
      min-height:100vh; font-family:system-ui, sans-serif;
    }
    .game {
      width:100%; max-width:500px; text-align:center; padding:20px;
    }
    .rocket {
      font-size:100px; cursor:pointer; display:inline-block;
      transition: transform 0.1s;
    }
    .rocket:active { transform: translateY(-20px) scale(1.1); }
    .score {
      font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="rocket" id="rocket">🚀</div>
  </div>
  <script>
    let score = 0;
    const rocket = document.getElementById('rocket');
    const scoreEl = document.getElementById('score');
    rocket.addEventListener('click', () => {
      score++;
      scoreEl.textContent = score;
      rocket.style.animation = 'none';
      setTimeout(() => rocket.style.animation = '', 10);
    });
  </script>
</body>
</html>`
    }
  ];
  
  // 根据模板返回对应游戏
  if (templateId) {
    if (templateId === 'animal') return games[0];
    if (templateId === 'space') return games[1];
  }
  
  // 随机返回一个
  return games[Math.floor(Math.random() * games.length)];
}

const app = new Hono();

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { templateId, userPrompt } = body;
    
    const game = generateMockGame(userPrompt, templateId);
    
    return c.json({
      success: true,
      data: {
        title: game.title,
        gameHtml: game.html
      }
    });
  } catch (error) {
    console.error(error);
    return c.json({
      success: false,
      message: "生成失败"
    }, 500);
  }
});

export default handle(app);
