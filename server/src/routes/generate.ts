import { Hono } from "hono";
import type { GenerateRequest, GenerateResponse } from "../types";
import { generateGameWithAI } from "../services/ai";
import {
  ModelCallError,
  ModelConfigError,
  resolveRequestModel,
} from "../services/model";

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
    let body: GenerateRequest;
    try {
      body = (await c.req.json()) as GenerateRequest;
    } catch {
      return c.json(
        { success: false, message: "请求参数格式错误" } as GenerateResponse,
        400
      );
    }

    const {
      templateId,
      userPrompt,
      remixFrom,
      remixInstruction,
      modelId,
      model,
      modelConfig,
    } = body;

    if (!userPrompt || typeof userPrompt !== "string" || !userPrompt.trim()) {
      return c.json(
        { success: false, message: "请先说出你的游戏创意！" } as GenerateResponse,
        400
      );
    }

    console.log("生成游戏请求:", {
      templateId,
      userPrompt: userPrompt.slice(0, 50),
      remix: Boolean(remixFrom),
      modelId: modelId || model || null,
      customModel: Boolean(modelConfig),
    });

    // 解析模型：自定义 modelConfig > 内置 modelId/model > GAME_MODEL 默认模型
    let resolved;
    try {
      resolved = resolveRequestModel({
        modelId: modelId || model,
        modelConfig,
      });
    } catch (e) {
      if (e instanceof ModelConfigError) {
        return c.json(
          { success: false, message: e.message } as GenerateResponse,
          400
        );
      }
      throw e;
    }

    // 没有任何可用模型 → Mock 兜底（与旧行为一致）
    if (!resolved) {
      console.log("未配置可用模型，使用 Mock 生成");
      const game = generateMockGame(userPrompt, templateId);
      return c.json({
        success: true,
        data: {
          gameHtml: game.html,
          title: game.title,
          engine: "mock",
          model: "mock",
          modelName: "本地模板",
        },
      } as GenerateResponse);
    }

    try {
      const game = await generateGameWithAI(
        {
          templateId,
          userPrompt,
          ageRange: [3, 10],
          remixFrom,
          remixInstruction,
        },
        resolved
      );

      console.log("AI 游戏生成成功:", game.title);

      return c.json({
        success: true,
        data: {
          gameHtml: game.html,
          title: game.title,
          engine: game.engine,
          model: game.modelId,
          modelName: game.modelName,
          modelSource: game.modelSource,
        },
      } as GenerateResponse);
    } catch (aiError) {
      const warning =
        aiError instanceof ModelCallError
          ? aiError.message
          : "模型调用失败";
      console.warn("AI 生成失败，使用 Mock 兜底:", warning);

      const game = generateMockGame(userPrompt, templateId);
      return c.json({
        success: true,
        data: {
          gameHtml: game.html,
          title: game.title,
          engine: "mock",
          model: "mock",
          modelName: "本地模板",
          warning: `${warning}，已降级为本地模板`,
        },
      } as GenerateResponse);
    }
  } catch (e) {
    console.error("生成失败:", e);
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
