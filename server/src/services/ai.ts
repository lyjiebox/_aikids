/**
 * ============================================================
 * AI 游戏生成服务（本地开发用）
 * ============================================================
 *
 * 注意：Vercel 部署使用的是 api/generate.ts（内联版本），
 * 这个文件仅用于本地开发（npm run dev）时 server/ 目录下的后端服务。
 *
 * V3.2 起模型解析交给 services/model.ts：
 * - 内置模型由环境变量提供
 * - 自定义模型由请求携带 modelConfig
 * - 默认模型由 GAME_MODEL 决定
 *
 * 本文件只负责：组装 Prompt → 调用模型 → 解析游戏输出。
 */

import {
  callChatCompletion,
  getGenerationTimeoutMs,
  type ResolvedModel,
  type ModelSource,
} from './model';

// ============================================================
// System Prompt — 告诉 AI 如何生成儿童游戏
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
// 类型定义
// ============================================================

/** 解析后的游戏数据 */
interface ParsedGame {
  title: string;
  html: string;
}

/** AI 生成的游戏结果 */
export interface GameGenerationResult extends ParsedGame {
  modelId: string;
  modelName: string;
  modelSource: ModelSource;
  engine: 'volcengine';
}

/** 游戏生成请求参数 */
export interface GameGenerationRequest {
  templateId?: string;          // 模板 ID（可选）
  userPrompt: string;           // 用户语音/文字输入
  ageRange?: [number, number];  // 目标年龄段
  remixFrom?: string;           // Remix: 来源作品 ID
  remixInstruction?: string;    // Remix: 用户的改编指令
  modelId?: string;             // 内置模型 ID
  model?: string;               // 兼容旧字段
  modelConfig?: unknown;        // 自定义模型配置
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

/**
 * 调用 AI API 生成游戏
 *
 * 模型由调用方（routes/generate.ts）通过 model.ts 解析后传入，
 * 本函数不再自行决定使用哪个模型。
 */
export async function generateGameWithAI(
  req: GameGenerationRequest,
  model: ResolvedModel
): Promise<GameGenerationResult> {
  // 拼接模板提示前缀
  let userPrompt = req.userPrompt;
  if (req.templateId && TEMPLATE_HINTS[req.templateId]) {
    userPrompt = TEMPLATE_HINTS[req.templateId] + '。' + userPrompt;
  }

  // 拼接 Remix 指令
  if (req.remixFrom && req.remixInstruction) {
    userPrompt = `【改编请求】基于原始游戏「${req.userPrompt}」进行改编。用户改编要求：${req.remixInstruction}。请保留原游戏核心玩法，根据改编要求进行修改。`;
  }

  console.log(
    `[ai] 使用模型: ${model.name} (${model.source}), host=${safeHost(model.baseUrl)}`
  );

  const { text, latencyMs } = await callChatCompletion(
    model,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    {
      maxTokens: 8192,
      temperature: 0.7,
      timeoutMs: getGenerationTimeoutMs(),
    }
  );

  console.log(`[ai] 模型响应耗时 ${latencyMs}ms，开始解析游戏输出`);

  const parsed = parseGameOutput(text);

  return {
    ...parsed,
    modelId: model.id,
    modelName: model.name,
    modelSource: model.source,
    engine: 'volcengine',
  };
}

/** 只打印主机名，避免日志出现完整地址或密钥 */
function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-url';
  }
}

/**
 * 解析 AI 输出的文本，提取 JSON 游戏数据
 *
 * 支持五种格式：
 * 1. 纯 JSON: {"title":"xxx","html":"..."}
 * 2. Markdown 代码块: ```json { ... } ```
 * 3. 普通代码块: ``` { ... } ```
 * 4. JSON 被截断时，尝试从已有内容提取 title 和 html
 * 5. 纯 HTML（没有 JSON 包裹）
 *
 * 全部失败时返回默认游戏（兜底）
 */
function parseGameOutput(text: string): ParsedGame {
  // 尝试 1：直接解析 JSON
  try { return JSON.parse(text) as ParsedGame; } catch {}

  // 尝试 2：提取 ```json ... ```
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]) as ParsedGame; } catch {}
  }

  // 尝试 3：提取 ``` ... ```
  const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]) as ParsedGame; } catch {}
  }

  // 尝试 4：JSON 被截断时，正则提取 title 和 html
  const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
  const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*\}|$)/);
  if (titleMatch && htmlMatch) {
    const html = htmlMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
    return { title: titleMatch[1], html };
  }

  // 尝试 5：纯 HTML
  const doctypeMatch = text.match(/<!DOCTYPE html>[\s\S]*/i);
  if (doctypeMatch) {
    const titleFromTag = text.match(/<title>([^<]*)<\/title>/i);
    return {
      title: titleFromTag ? titleFromTag[1] : 'AI 生成的游戏',
      html: doctypeMatch[0],
    };
  }

  // 全部失败 → 返回默认游戏
  return buildDefaultGame(text);
}

/**
 * 构建默认游戏（最终兜底方案）
 *
 * 当 AI 返回的内容无法解析时，生成一个简单的点击 emoji 游戏。
 */
function buildDefaultGame(description: string): ParsedGame {
  const title = description.slice(0, 8) || "我的小游戏";

  return {
    title,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { 
      background: linear-gradient(135deg, #90ee90 0%, #87ceeb 100%);
      display:flex; align-items:center; justify-content:center; 
      min-height:100vh; font-family:system-ui, sans-serif;
    }
    .game { width:100%; max-width:500px; text-align:center; padding:20px; }
    .emoji { font-size:100px; cursor:pointer; display:inline-block; transition:transform 0.1s; }
    .emoji:active { transform:translateY(-20px) scale(1.1); }
    .score { font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3); }
    .title { font-size:24px; color:#333; margin-bottom:20px; }
  </style>
</head>
<body>
  <div class="game">
    <div class="title">${title}</div>
    <div class="score">得分: <span id="score">0</span></div>
    <div class="emoji" id="target">🎮</div>
  </div>
  <script>
    let score=0;const t=document.getElementById('target'),s=document.getElementById('score');
    const e=['🎮','🎨','🎯','🎪','🎭','🎬','🎤','🎧','🎸','🎹'];
    t.addEventListener('click',()=>{score++;s.textContent=score;t.textContent=e[Math.floor(Math.random()*e.length)];t.style.transform='scale(0.8)';setTimeout(()=>t.style.transform='',100)});
  </script>
</body>
</html>`
  };
}
