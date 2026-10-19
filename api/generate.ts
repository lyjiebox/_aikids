/**
 * ============================================================
 * Vercel Serverless Function: POST /api/generate
 * ============================================================
 *
 * 这是部署在 Vercel 上的后端 API，负责：
 * 1. 接收前端的游戏生成请求（模板ID + 用户语音/文字输入）
 * 2. 解析请求中的模型（内置 modelId / 自定义 modelConfig / 环境变量默认）
 * 3. 调用 OpenAI 兼容的 Chat Completions API 生成 HTML5 儿童游戏
 * 4. AI 调用失败时降级到本地 Mock 游戏模板
 * 5. 返回游戏 HTML 代码 + 引擎标识 + 实际使用的模型
 *
 * 依赖的环境变量（在 Vercel Settings 中配置）：
 *   VOLCENGINE_API_KEY       - 火山方舟 API Key
 *   VOLCENGINE_BASE_URL      - 可选，内置模型接口地址（默认火山方舟）
 *   DEEPSEEK_ENDPOINT_ID     - DeepSeek V4 Pro 推理接入点 ID（ep-xxx）
 *   DOUBAO_ENDPOINT_ID       - Doubao Seed 2.0 Pro 推理接入点 ID（ep-xxx）
 *   VOLCENGINE_ENDPOINT_ID   - 可选，Doubao 旧变量回退
 *   GAME_MODEL               - 默认模型：deepseek | doubao（可选）
 *   ALLOWED_MODEL_HOSTS      - 自定义模型域名白名单（逗号分隔，可选）
 *   ALLOW_LOCAL_MODEL_HOSTS  - 是否允许 localhost（仅本地测试）
 *   MODEL_TIMEOUT_MS         - 生成超时（默认 280000）
 *
 * 超时配置：vercel.json 中 generate maxDuration=300，test maxDuration=60。
 */
import { Hono } from 'hono';
import {
  ModelCallError,
  ModelConfigError,
  callChatCompletion,
  getGenerationTimeoutMs,
  resolveRequestModel,
} from './_model';

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
 * 请求体：{ templateId?, userPrompt, remixFrom?, remixInstruction?, ...,
 *           modelId?, model?, modelConfig? }
 * 响应体：{ success: true, data: { title, gameHtml, engine, model, modelName, modelSource } }
 *
 * 模型选择优先级：
 * 1. modelConfig（自定义模型）
 * 2. modelId / model（内置模型）
 * 3. 环境变量 GAME_MODEL（未选择时）
 * 4. 无可用模型 → Mock
 */
app.post('*', async (c) => {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await c.req.json();
      body =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : {};
    } catch {
      return c.json({ success: false, message: '请求参数格式错误' }, 400);
    }

    const {
      templateId,
      userPrompt,
      remixFrom,
      remixInstruction,
      originalUserPrompt,
      originalTitle,
      originalGameHtmlPreview,
      modelId,
      model: legacyModel,
      modelConfig,
    } = body;

    if (
      typeof userPrompt !== 'string' ||
      !userPrompt.trim()
    ) {
      return c.json(
        { success: false, message: '请先说出你的游戏创意！' },
        400
      );
    }

    const promptText = userPrompt as string;

    console.log('[generate] 请求:', {
      templateId,
      prompt: promptText.slice(0, 50),
      remix: Boolean(remixFrom),
      modelId: modelId || legacyModel || null,
      customModel: Boolean(modelConfig),
    });

    // 拼接最终 Prompt
    let finalPrompt = promptText;
    if (remixFrom && remixInstruction) {
      finalPrompt = `
原始游戏信息：
- 原始用户描述：${originalUserPrompt || ''}
- 原始游戏标题：${originalTitle || ''}
- 原始游戏 HTML 片段：${originalGameHtmlPreview || ''}

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个完整的新游戏。新游戏应体现用户的改编意图，同时保持适合 3-10 岁儿童的简洁玩法。
`;
    } else if (
      typeof templateId === 'string' &&
      TEMPLATE_HINTS[templateId]
    ) {
      finalPrompt = TEMPLATE_HINTS[templateId] + '。' + promptText;
    }

    // 解析模型：自定义 modelConfig > 内置 modelId/model > GAME_MODEL 默认模型
    let resolved;
    try {
      resolved = resolveRequestModel({
        modelId: modelId || legacyModel,
        modelConfig,
      });
    } catch (error) {
      if (error instanceof ModelConfigError) {
        return c.json({ success: false, message: error.message }, 400);
      }
      throw error;
    }

    // 没有任何可用模型 → Mock 兜底（与旧行为一致）
    if (!resolved) {
      console.log('[generate] 未配置可用模型，使用 Mock');
      const game = generateMockGame(promptText, templateId as string | undefined);
      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'mock',
          model: 'mock',
          modelName: '本地模板',
        },
      });
    }

    console.log(
      `[generate] 使用模型: ${resolved.name} (${resolved.source}), host=${safeHost(resolved.baseUrl)}`
    );

    try {
      const { text, latencyMs } = await callChatCompletion(
        resolved,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: finalPrompt },
        ],
        {
          maxTokens: 8192,
          temperature: 0.7,
          timeoutMs: getGenerationTimeoutMs(),
        }
      );

      console.log(
        `[generate] ${resolved.name} 响应耗时 ${latencyMs}ms，原始输出前 200 字符:`,
        text.slice(0, 200)
      );

      const game = parseGameOutput(text);
      console.log(`[generate] ✅ ${resolved.name} 生成成功:`, game.title);

      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'volcengine',
          model: resolved.id,
          modelName: resolved.name,
          modelSource: resolved.source,
        },
      });
    } catch (aiError) {
      const warning =
        aiError instanceof ModelCallError
          ? aiError.message
          : '模型调用失败';
      console.warn('[generate] ⚠️ 模型调用失败，降级 Mock:', warning);

      const game = generateMockGame(promptText, templateId as string | undefined);
      return c.json({
        success: true,
        data: {
          title: game.title,
          gameHtml: game.html,
          engine: 'mock',
          model: 'mock',
          modelName: '本地模板',
          warning: `${warning}，已降级为本地模板`,
        },
      });
    }
  } catch (error) {
    console.error('[generate] 失败:', error);
    return c.json(
      { success: false, message: '生成失败，请稍后再试' },
      500
    );
  }
});

/** 只打印主机名，避免日志出现完整地址或密钥 */
function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-url';
  }
}

/** Vercel 要求使用命名 HTTP 方法导出 */
export const POST = (request: Request) => app.fetch(request);
