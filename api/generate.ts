/**
 * ============================================================
 * Vercel Serverless Function: POST /api/generate
 * ============================================================
 * 
 * 这是部署在 Vercel 上的后端 API，负责：
 * 1. 接收前端的游戏生成请求（模板ID + 用户语音/文字输入）
 * 2. 调用火山引擎 Agent Plan Responses API 生成 HTML5 儿童游戏
 * 3. AI 调用失败时降级到本地 Mock 游戏模板
 * 4. 返回游戏 HTML 代码 + 引擎标识（volcengine/mock）
 * 
 * 依赖的环境变量（在 Vercel Settings 中配置）：
 *   VOLCENGINE_API_KEY      — 火山引擎 API Key
 *   VOLCENGINE_ENDPOINT_ID  — 推理接入点 ID（ep-xxx）
 * 
 * 超时配置：vercel.json 中 maxDuration 设为 300 秒（5 分钟）
 * （火山引擎生成完整 HTML5 游戏通常需要 1-3 分钟）
 */
import { Hono } from 'hono';

// ============================================================
// AI System Prompt — 告诉 AI 怎么生成儿童游戏
// ============================================================
// 这段 Prompt 是整个项目的核心，定义了 AI 生成游戏的规则：
// - 面向 3-10 岁儿童
// - 单文件 HTML（内联 CSS + JS）
// - 安全限制（禁止 iframe/form/eval 等）
// - 输出 JSON 格式 { title, html }

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
 * 调用火山引擎 Agent Plan Responses API 生成游戏
 * 
 * 这是核心 AI 调用函数，消耗你订阅的 Agent Plan 预付费额度。
 * 
 * @param userPrompt 用户的语音/文字输入（已拼接模板提示前缀）
 * @returns { title: 游戏标题, html: 完整 HTML 代码 }
 * 
 * API 文档：https://www.volcengine.com/docs/82379（Responses API）
 */
async function callVolcengineAI(userPrompt: string): Promise<{ title: string; html: string }> {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  const endpointId = process.env.VOLCENGINE_ENDPOINT_ID;

  if (!apiKey || !endpointId) {
    throw new Error('缺少 VOLCENGINE_API_KEY 或 VOLCENGINE_ENDPOINT_ID');
  }

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: endpointId,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
      ],
      max_output_tokens: 8192
    })
  });

  // 检查 HTTP 状态码
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`火山引擎 API 失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Responses API 的响应格式和 Chat Completions 不同：
  // output[] 是一个数组，包含 reasoning（思考过程）和 message（回复）
  // 我们需要找到 role=assistant 的 message
  const assistantOutput = data.output?.find(
    (item: any) => item.type === 'message' && item.role === 'assistant'
  );
  if (!assistantOutput) throw new Error('API 未返回 assistant 消息');

  // 从 assistant 消息中提取文本内容
  const text = assistantOutput.content?.find((c: any) => c.type === 'output_text')?.text;
  if (!text) throw new Error('API 未返回文本内容');

  // 打印 AI 原始输出（前 500 字符），方便调试解析失败
  console.log('[generate] AI 原始输出 (前500字符):', text.slice(0, 500));

  // 解析 AI 返回的 JSON（AI 应该返回 { title, html }）
  return parseGameOutput(text);
}

/**
 * 解析 AI 输出的文本，提取 JSON 游戏数据
 * 
 * AI 可能返回多种格式：
 * 1. 纯 JSON: {"title":"xxx","html":"..."}
 * 2. Markdown 代码块: ```json { ... } ```
 * 3. 普通代码块: ``` { ... } ```
 * 4. JSON 被截断时，尝试从已有内容提取 title 和 html
 * 
 * @throws 如果所有解析方式都失败
 */
function parseGameOutput(text: string): { title: string; html: string } {
  // 策略 1：直接解析 JSON
  try { return JSON.parse(text); } catch {}

  // 策略 2：提取 ```json ... ```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }

  // 策略 3：提取 ``` ... ```
  const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch {}
  }

  // 策略 4：JSON 被截断时，尝试用正则提取 title 和 html
  // 匹配 "title": "..." 和 "html": "..."（即使 JSON 不完整）
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/);
  if (titleMatch && htmlMatch) {
    let html = htmlMatch[1]
      .replace(/\\n/g, '\n')   // 反转义换行
      .replace(/\\"/g, '"')    // 反转义引号
      .replace(/\\t/g, '\t')   // 反转义制表符
      .replace(/\\\\/g, '\\'); // 反转义反斜杠
    console.log('[generate] ⚠️ JSON 不完整，通过正则提取了 title 和 html');
    return { title: titleMatch[1], html };
  }

  // 策略 5：如果返回的是纯 HTML（没有 JSON 包裹），直接当 html 用
  const doctypeMatch = text.match(/<!DOCTYPE html>[\s\S]*/i);
  if (doctypeMatch) {
    const titleFromTag = text.match(/<title>([^<]*)<\/title>/i);
    console.log('[generate] ⚠️ AI 返回了纯 HTML，直接使用');
    return {
      title: titleFromTag ? titleFromTag[1] : 'AI 生成的游戏',
      html: doctypeMatch[0],
    };
  }

  throw new Error('无法解析 AI 输出');
}

// ============================================================
// Mock 兜底 — AI 不可用时的本地备用游戏
// ============================================================
// 当火山引擎 API 调用失败或未配置 API Key 时，
// 返回这两个预设的简单游戏，确保用户始终能得到一个可玩的游戏。

/**
 * 生成本地 Mock 游戏
 * @param _prompt 用户输入（当前未使用，仅保留接口一致性）
 * @param templateId 模板 ID，匹配对应主题的预设游戏
 */
function generateMockGame(_prompt: string, templateId?: string) {
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
  
  // 根据模板 ID 返回对应主题的游戏
  if (templateId === 'animal') return games[0];  // 动物 → 兔子
  if (templateId === 'space') return games[1];   // 太空 → 火箭
  // 没有匹配的模板时随机返回一个
  return games[Math.floor(Math.random() * games.length)];
}

// ============================================================
// 模板提示前缀 — 根据用户选择的模板增强 Prompt
// ============================================================
const TEMPLATE_HINTS: Record<string, string> = {
  'animal': '这是一个关于动物的游戏',
  'vehicle': '这是一个关于交通工具/汽车的游戏',
  'princess': '这是一个关于公主/魔法的游戏',
  'dinosaur': '这是一个关于恐龙的游戏',
  'space': '这是一个关于太空的游戏'
};

// ============================================================
// Hono 路由处理 — 接收前端请求，返回游戏
// ============================================================

const app = new Hono();

/**
 * POST /api/generate
 * 
 * 请求体：{ templateId?: string, userPrompt: string }
 * 响应体：{ success: true, data: { title, gameHtml, engine } }
 * 
 * 处理流程：
 * 1. 检查是否配置了 VOLCENGINE_API_KEY
 * 2. 有 Key → 调用火山引擎 AI 生成
 * 3. AI 失败 → 降级到 Mock 本地游戏
 * 4. 无 Key → 直接用 Mock
 * 5. 返回结果 + engine 标识（前端据此显示不同 UI）
 */
app.post('*', async (c) => {
  try {
    const body = await c.req.json();
    const { templateId, userPrompt, remixFrom, remixInstruction, originalUserPrompt, originalTitle, originalGameHtmlPreview } = body;
    
    console.log('[generate] 请求:', { templateId, prompt: userPrompt?.slice(0, 50), remix: !!remixFrom });

    let finalPrompt = userPrompt;
    if (remixFrom && remixInstruction) {
      // Remix 模式：拼接原始游戏信息 + 改编想法
      finalPrompt = `
原始游戏信息：
- 原始用户描述：${originalUserPrompt || ''}
- 原始游戏标题：${originalTitle || ''}
- 原始游戏 HTML 片段：${originalGameHtmlPreview || ''}

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个完整的新游戏。新游戏应体现用户的改编意图，同时保持适合 3-10 岁儿童的简洁玩法。
`;
    } else if (templateId && TEMPLATE_HINTS[templateId]) {
      // 普通创作模式：拼接模板提示前缀
      finalPrompt = TEMPLATE_HINTS[templateId] + '。' + userPrompt;
    }

    let game;
    let engine: 'volcengine' | 'mock' = 'mock';

    // 尝试火山引擎 AI 生成（需同时配置 Key 与接入点 ID）
    if (process.env.VOLCENGINE_API_KEY && process.env.VOLCENGINE_ENDPOINT_ID) {
      try {
        console.log('[generate] 调用火山引擎 Responses API, endpoint:', process.env.VOLCENGINE_ENDPOINT_ID.slice(0, 8) + '...');
        game = await callVolcengineAI(finalPrompt);
        engine = 'volcengine';
        console.log('[generate] ✅ AI 生成成功:', game.title);
      } catch (aiError: any) {
        console.warn('[generate] ⚠️ AI 失败，降级 Mock:', aiError.message);
        game = generateMockGame(userPrompt, templateId);
      }
    } else {
      const missing = [
        !process.env.VOLCENGINE_API_KEY && 'VOLCENGINE_API_KEY',
        !process.env.VOLCENGINE_ENDPOINT_ID && 'VOLCENGINE_ENDPOINT_ID',
      ].filter(Boolean);
      console.log('[generate] 火山引擎未配置完整，缺少:', missing.join(', '), '→ 使用 Mock');
      game = generateMockGame(userPrompt, templateId);
    }

    // 返回结果，engine 字段告诉前端用了哪个引擎
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

/** Vercel 要求使用命名 HTTP 方法导出，否则 Response 会被忽略导致超时 */
export const POST = (request: Request) => app.fetch(request);
