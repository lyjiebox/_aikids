import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types";

const generateRoute = new Hono();

// Mock HTML 模板，模拟 AI 生成结果
const MOCK_GAME_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{TITLE}}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #74b9ff, #a29bfe);
      color: #fff;
    }
    #container {
      text-align: center;
      padding: 20px;
      width: 90%;
      max-width: 600px;
      border-radius: 24px;
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(10px);
    }
    h1 { font-size: 28px; margin-bottom: 20px; }
    button {
      font-size: 24px;
      padding: 16px 40px;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      background: #fd79a8;
      color: #fff;
      font-weight: bold;
      box-shadow: 0 8px 20px rgba(0,0,0,0.2);
      transition: transform 0.1s;
    }
    button:active { transform: scale(0.96); }
    #score {
      font-size: 64px;
      font-weight: bold;
      margin: 20px 0;
    }
    #prompt {
      margin-top: 20px;
      font-size: 16px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div id="container">
    <h1>🎉 {{TITLE}}</h1>
    <div id="score">0</div>
    <button id="btn">点击我！</button>
    <div id="prompt">你的创意: {{PROMPT}}</div>
  </div>
  <script>
    let score = 0;
    const btn = document.getElementById('btn');
    const scoreEl = document.getElementById('score');
    btn.addEventListener('click', () => {
      score += 1;
      scoreEl.textContent = String(score);
      if (score % 10 === 0) {
        scoreEl.style.transform = 'scale(1.2)';
        setTimeout(() => {
          scoreEl.style.transform = 'scale(1)';
        }, 200);
      }
    });
  </script>
</body>
</html>
`;

generateRoute.post("/", async (c) => {
  try {
    const body = (await c.req.json()) as GenerateRequest;
    const userPrompt = body.userPrompt || "创建一个小游戏";

    // 模拟 AI 生成过程
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 生成标题
    const title = generateTitle(userPrompt);
    // 替换模板内容
    const gameHtml = MOCK_GAME_HTML
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{PROMPT\}\}/g, userPrompt);

    return c.json({
      success: true,
      data: { gameHtml, title },
    } as GenerateResponse);
  } catch (e) {
    console.error(e);
    return c.json(
      {
        success: false,
        message: "魔法好像失灵了，再试一次吧！",
      } as GenerateResponse,
      500
    );
  }
});

function generateTitle(prompt: string): string {
  const shortPrompt = prompt.length > 20 ? prompt.slice(0, 20) + "..." : prompt;
  const suffixes = ["小游戏", "魔法屋", "乐园", "世界", "冒险记"];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${shortPrompt}的${suffix}`;
}

export default generateRoute;
