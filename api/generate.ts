import { Hono } from 'hono';
import { handle } from '@hono/node-server/vercel';

// ============================================================
// 火山引擎 Agent Plan Responses API 调用
// ============================================================

const SYSTEM_PROMPT = `你是一个专为儿童设计游戏的 AI 游戏工程师。
你的任务是根据用户的描述，生成一个完整、可运行的 HTML5 游戏。

## 要求：

1. **受众**：3-10 岁儿童
2. **内容**：积极向上、无暴力、无恐怖元素、色彩明亮
3. **操作**：简单直观，以点击/拖拽为主，无需复杂操作
4. **技术**：单文件 HTML，内联 CSS + JS，无外部依赖
5. **安全性**：不要使用 <iframe>、<form>、window.open、eval 等危险功能
6. **游戏时长**：30秒 - 3分钟
7. **反馈**：包含简单的音效反馈（Web Audio API 或 AudioContext）

## 输出格式：

只返回一个 JSON 对象，格式如下：
{
  "title": "游戏标题（中文，10字以内）",
  "html": "完整的 HTML 代码"
}

## HTML 游戏规范：

- 使用 <!DOCTYPE html>
- 包含 <meta charset="utf-8"> 和 <meta name="viewport" content="width=device-width,initial-scale=1">
- 样式写在 <style> 标签内，脚本写在 <script> 标签内
- 使用 emoji 做素材，无需图片
- 配色明亮、卡通风格
- 包含简单的得分系统或目标
- 有游戏结束和重试功能

现在，根据用户的描述生成游戏吧！`;

/**
 * 调用火山引擎 Agent Plan Responses API
 */
async function callVolcengineAI(userPrompt: string): Promise<{ title: string; html: string }> {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  const model = process.env.VOLCENGINE_MODEL || 'doubao-seed-1-8-251228';

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
      ],
      max_output_tokens: 4096
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`火山引擎 API 失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // 解析 Responses API 格式
  const assistantOutput = data.output?.find(
    (item: any) => item.type === 'message' && item.role === 'assistant'
  );
  if (!assistantOutput) throw new Error('API 未返回 assistant 消息');

  const text = assistantOutput.content?.find((c: any) => c.type === 'output_text')?.text;
  if (!text) throw new Error('API 未返回文本内容');

  return parseGameOutput(text);
}

function parseGameOutput(text: string): { title: string; html: string } {
  // 直接解析 JSON
  try { return JSON.parse(text); } catch {}

  // 提取 ```json ... ```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }

  // 提取 ``` ... ```
  const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch {}
  }

  throw new Error('无法解析 AI 输出');
}

// ============================================================
// Mock 兜底
// ============================================================

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
    .game { width:100%; max-width:500px; text-align:center; padding:20px; }
    .bunny { font-size:100px; cursor:pointer; display:inline-block; transition:transform 0.1s; }
    .bunny:active { transform:translateY(-20px) scale(1.1); }
    .score { font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="bunny" id="bunny">🐰</div>
  </div>
  <script>
    let score=0;const b=document.getElementById('bunny'),s=document.getElementById('score');
    b.addEventListener('click',()=>{score++;s.textContent=score;b.style.animation='none';setTimeout(()=>b.style.animation='',10)});
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
    .game { width:100%; max-width:500px; text-align:center; padding:20px; }
    .rocket { font-size:100px; cursor:pointer; display:inline-block; transition:transform 0.1s; }
    .rocket:active { transform:translateY(-20px) scale(1.1); }
    .score { font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div class="game">
    <div class="score">得分: <span id="score">0</span></div>
    <div class="rocket" id="rocket">🚀</div>
  </div>
  <script>
    let score=0;const r=document.getElementById('rocket'),s=document.getElementById('score');
    r.addEventListener('click',()=>{score++;s.textContent=score;r.style.animation='none';setTimeout(()=>r.style.animation='',10)});
  </script>
</body>
</html>`
    }
  ];
  
  if (templateId === 'animal') return games[0];
  if (templateId === 'space') return games[1];
  return games[Math.floor(Math.random() * games.length)];
}

// ============================================================
// Hono App
// ============================================================

const app = new Hono();

app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { templateId, userPrompt } = body;
    
    console.log('[generate] 请求:', { templateId, prompt: userPrompt?.slice(0, 50) });

    let game;
    let engine: 'volcengine' | 'mock' = 'mock';

    // 尝试火山引擎 AI 生成
    if (process.env.VOLCENGINE_API_KEY) {
      try {
        console.log('[generate] 调用火山引擎 Responses API...');
        game = await callVolcengineAI(userPrompt);
        engine = 'volcengine';
        console.log('[generate] ✅ AI 生成成功:', game.title);
      } catch (aiError: any) {
        console.warn('[generate] ⚠️ AI 失败，降级 Mock:', aiError.message);
        game = generateMockGame(userPrompt, templateId);
      }
    } else {
      console.log('[generate] 未配置 API Key，使用 Mock');
      game = generateMockGame(userPrompt, templateId);
    }

    return c.json({
      success: true,
      data: {
        title: game.title,
        gameHtml: game.html,
        engine,  // ← 告诉前端用了哪个引擎
      }
    });
  } catch (error) {
    console.error('[generate] 失败:', error);
    return c.json({
      success: false,
      message: "生成失败，请稍后再试"
    }, 500);
  }
});

export default handle(app);
