import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types";

// 简单的 Mock 游戏生成器（兜底方案）
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
  
  if (templateId === 'animal') return games[0];
  if (templateId === 'space') return games[1];
  return games[Math.floor(Math.random() * games.length)];
}

const generateRoute = new Hono();

generateRoute.post("/", async (c) => {
  try {
    const body = (await c.req.json()) as GenerateRequest;
    const { templateId, userPrompt, remixFrom, remixInstruction } = body;
    
    console.log('生成游戏请求:', { templateId, userPrompt: userPrompt?.slice(0, 50) });
    
    // 检查是否配置了 AI API Key
    const hasVolcengine = process.env.VOLCENGINE_API_KEY && process.env.VOLCENGINE_ENDPOINT_ID;
    const hasApiKey = hasVolcengine || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    
    let game;
    
    if (hasApiKey) {
      try {
        const { generateGameWithAI } = await import('../services/ai');
        game = await generateGameWithAI({ templateId, userPrompt, ageRange: [3, 10] });
        console.log('AI 游戏生成成功');
      } catch (aiError) {
        console.warn('AI 生成失败，使用 Mock 兜底:', aiError);
        game = generateMockGame(userPrompt, templateId);
      }
    } else {
      console.log('未配置 API Key，使用 Mock 生成');
      game = generateMockGame(userPrompt, templateId);
    }

    return c.json({
      success: true,
      data: { gameHtml: game.html, title: game.title },
    } as GenerateResponse);
  } catch (e) {
    console.error('生成失败:', e);
    return c.json(
      {
        success: false,
        message: "魔法好像失灵了，再试一次吧！",
      } as GenerateResponse,
      500
    );
  }
});

export default generateRoute;
