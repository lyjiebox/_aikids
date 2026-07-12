/**
 * ============================================================
 * Vercel Serverless Function: POST /api/generate
 * ============================================================
 * 
 * 这是部署在 Vercel 上的后端 API，负责：
 * 1. 接收前端的游戏生成请求（模板ID + 用户语音/文字输入）
 * 2. 调用火山引擎 Chat Completions API 生成 HTML5 儿童游戏
 * 3. 支持 DeepSeek V4 Pro 和 Doubao Seed 2.0 Pro 双模型切换
 * 4. AI 调用失败时降级到本地 Mock 游戏模板
 * 5. 返回游戏 HTML 代码 + 引擎标识（volcengine/mock）+ 模型名
 * 
 * 依赖的环境变量（在 Vercel Settings 中配置）：
 *   VOLCENGINE_API_KEY       - 火山引擎 API Key（两个模型共用）
 *   DEEPSEEK_ENDPOINT_ID     - DeepSeek V4 Pro 推理接入点 ID（ep-xxx）
 *   DOUBAO_ENDPOINT_ID       - Doubao Seed 2.0 Pro 推理接入点 ID（ep-xxx）
 *   GAME_MODEL               - 默认模型选择：deepseek | doubao（可选，默认 doubao）
 * 
 * 超时配置：vercel.json 中 maxDuration 设为 300 秒（5 分钟）
 */
import { Hono } from 'hono';

// ============================================================
// AI System Prompt - 告诉 AI 怎么生成儿童游戏
// ============================================================
const SYSTEM_PROMPT = `你是一个儿童游戏生成专家。你必须生成一个完整、可玩的 HTML5 游戏。

## 必须遵循的规则
1. **交互方式**：至少包含 3 种交互（点击、拖拽、键盘方向键等）
2. **得分系统**：必须有分数显示或进度条，左上角显示
3. **音效触发**：在关键事件处用注释标注音效触发点（如 <!-- SFX: jump -->）
4. **游戏时长**：一局 30-60 秒，结束后显示得分和重玩按钮
5. **胜利/失败**：必须有明确的胜利条件和失败条件
6. **默认类型**：如果用户描述不明确，默认生成「收集类」游戏（最受 3-10 岁儿童欢迎）
7. **移动端适配**：使用 touch 事件，viewport width=device-width，禁止页面缩放
8. **视觉风格**：明亮卡通、大按钮、圆角 UI、高对比度色彩

## 输出格式
严格输出 JSON：
{
  "title": "游戏名称（4-8个字）",
  "html": "完整的 HTML5 游戏代码"
}`;

// ============================================================
// 模型配置
// ============================================================

/** 支持的模型标识 */
type ModelType = 'deepseek' | 'doubao';

/** 模型显示名映射 */
const MODEL_NAMES: Record<ModelType, string> = {
  deepseek: 'DeepSeek V4 Pro',
  doubao: 'Doubao Seed 2.0 Pro',
};

/**
 * 根据模型类型获取对应的 endpoint ID
 */
function getEndpointId(model: ModelType): string | undefined {
  if (model === 'deepseek') return process.env.DEEPSEEK_ENDPOINT_ID;
  if (model === 'doubao') return process.env.DOUBAO_ENDPOINT_ID;
  return undefined;
}

/**
 * 获取已配置的模型列表（至少配了 endpoint 才算可用）
 */
function getAvailableModels(): ModelType[] {
  const models: ModelType[] = [];
  if (process.env.DOUBAO_ENDPOINT_ID) models.push('doubao');
  if (process.env.DEEPSEEK_ENDPOINT_ID) models.push('deepseek');
  return models;
}

// ============================================================
// 核心AI调用 - Chat Completions API
// ============================================================

/**
 * 调用火山引擎 Chat Completions API 生成游戏
 * 
 * 统一使用 Chat Completions 接口，兼容 DeepSeek 和 Doubao 模型。
 * 
 * @param userPrompt 用户的语音/文字输入（已拼接模板提示前缀）
 * @param model 模型类型：deepseek | doubao
 * @returns { title: 游戏标题, html: 完整 HTML 代码 }
 */
async function callVolcengineAI(
  userPrompt: string,
  model: ModelType
): Promise<{ title: string; html: string }> {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  const endpointId = getEndpointId(model);

  if (!apiKey || !endpointId) {
    throw new Error(`模型 ${MODEL_NAMES[model]} 未配置完整（需要 VOLCENGINE_API_KEY 和 endpoint ID）`);
  }

  console.log(`[generate] 调用 ${MODEL_NAMES[model]}, endpoint: ${endpointId.slice(0, 8)}...`);

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: endpointId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 8192,
      temperature: 0.7
    })
  });

  // 检查 HTTP 状态码
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${MODEL_NAMES[model]} API 失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Chat Completions 响应格式：choices[0].message.content
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${MODEL_NAMES[model]} 未返回文本内容`);

  // 打印 AI 原始输出（前 500 字符），方便调试解析失败
  console.log(`[generate] ${MODEL_NAMES[model]} 原始输出 (前500字符):`, text.slice(0, 500));

  // 打印实际返回的模型名（用于验证 endpoint 绑定正确）
  if (data.model) {
    console.log(`[generate] 实际模型: ${data.model}`);
  }

  return parseGameOutput(text);
}

// ============================================================
// 输出解析
// ============================================================

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
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/);
  if (titleMatch && htmlMatch) {
    let html = htmlMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
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
// Mock 兜底 - AI 不可用时的本地备用游戏
// ============================================================

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
  
  if (templateId === 'animal') return games[0];
  if (templateId === 'space') return games[1];
  return games[Math.floor(Math.random() * games.length)];
}

// ============================================================
// 模板提示前缀
// ============================================================
const TEMPLATE_HINTS: Record<string, string> = {
  'animal': '这是一个关于动物的游戏',
  'vehicle': '这是一个关于交通工具/汽车的游戏',
  'princess': '这是一个关于公主/魔法的游戏',
  'dinosaur': '这是一个关于恐龙的游戏',
  'space': '这是一个关于太空的游戏'
};

// ============================================================
// Hono 路由处理
// ============================================================

const app = new Hono();

/**
 * POST /api/generate
 * 
 * 请求体：{ templateId?: string, userPrompt: string, model?: 'deepseek'|'doubao', remixFrom?, remixInstruction?, ... }
 * 响应体：{ success: true, data: { title, gameHtml, engine, model } }
 * 
 * 模型选择优先级：
 * 1. 请求体中的 model 参数（前端动态指定）
 * 2. 环境变量 GAME_MODEL
 * 3. 默认 doubao（更快）
 * 
 * 如果指定的模型未配置 endpoint，自动降级到另一个已配置的模型。
 */
app.post('*', async (c) => {
  try {
    const body = await c.req.json();
    const { templateId, userPrompt, remixFrom, remixInstruction, originalUserPrompt, originalTitle, originalGameHtmlPreview, model: requestModel } = body;
    
    console.log('[generate] 请求:', { 
      templateId, 
      prompt: userPrompt?.slice(0, 50), 
      remix: !!remixFrom,
      model: requestModel 
    });

    // 拼接最终 Prompt
    let finalPrompt = userPrompt;
    if (remixFrom && remixInstruction) {
      finalPrompt = `
原始游戏信息：
- 原始用户描述：${originalUserPrompt || ''}
- 原始游戏标题：${originalTitle || ''}
- 原始游戏 HTML 片段：${originalGameHtmlPreview || ''}

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个完整的新游戏。新游戏应体现用户的改编意图，同时保持适合 3-10 岁儿童的简洁玩法。
`;
    } else if (templateId && TEMPLATE_HINTS[templateId]) {
      finalPrompt = TEMPLATE_HINTS[templateId] + '。' + userPrompt;
    }

    // 确定使用哪个模型
    const availableModels = getAvailableModels();
    let model: ModelType | undefined;

    if (availableModels.length === 0) {
      // 没有配置任何 endpoint，直接 Mock
      console.log('[generate] 未配置任何模型 endpoint，使用 Mock');
      const game = generateMockGame(userPrompt, templateId);
      return c.json({
        success: true,
        data: { title: game.title, gameHtml: game.html, engine: 'mock', model: 'none' }
      });
    }

    // 优先用请求参数，其次环境变量，最后默认 doubao
    const preferredModel = (requestModel as ModelType) || (process.env.GAME_MODEL as ModelType) || 'doubao';

    if (availableModels.includes(preferredModel)) {
      model = preferredModel;
    } else {
      // 指定模型未配置，降级到第一个可用的
      model = availableModels[0];
      console.log(`[generate] ⚠️ 指定模型 ${preferredModel} 未配置，降级到 ${MODEL_NAMES[model]}`);
    }

    console.log(`[generate] 使用模型: ${MODEL_NAMES[model]}`);

    // 调用 AI 生成
    let game;
    let engine: 'volcengine' | 'mock' = 'mock';

    try {
      game = await callVolcengineAI(finalPrompt, model);
      engine = 'volcengine';
      console.log(`[generate] ✅ ${MODEL_NAMES[model]} 生成成功:`, game.title);
    } catch (aiError: any) {
      console.warn(`[generate] ⚠️ ${MODEL_NAMES[model]} 失败，降级 Mock:`, aiError.message);
      game = generateMockGame(userPrompt, templateId);
    }

    return c.json({
      success: true,
      data: {
        title: game.title,
        gameHtml: game.html,
        engine,
        model: engine === 'volcengine' ? model : 'mock',
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

/** Vercel 要求使用命名 HTTP 方法导出 */
export const POST = (request: Request) => app.fetch(request);
