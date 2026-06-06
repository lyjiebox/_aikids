/**
 * AI 游戏生成服务
 * 使用 Claude API / OpenAI API 生成 HTML5 儿童游戏
 */

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

## 常见游戏类型参考：

- 点击类：点击出现的物品得分
- 记忆类：翻牌配对
- 简单躲避：用键盘或点击控制角色躲避障碍物
- 涂色类：点击填色
- 简单拼图

现在，根据用户的描述生成游戏吧！`;

export interface GameGenerationResult {
  title: string;
  html: string;
}

export interface GameGenerationRequest {
  templateId?: string;
  userPrompt: string;
  ageRange?: [number, number];
}

/**
 * 调用 AI API 生成游戏
 */
export async function generateGameWithAI(req: GameGenerationRequest): Promise<GameGenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("缺少 API Key，请配置环境变量 ANTHROPIC_API_KEY 或 OPENAI_API_KEY");
  }

  // 构建用户 Prompt
  let userPrompt = req.userPrompt;
  if (req.templateId) {
    const templateHints: Record<string, string> = {
      'animal': '这是一个关于动物的游戏',
      'vehicle': '这是一个关于交通工具/汽车的游戏',
      'princess': '这是一个关于公主/魔法的游戏',
      'dinosaur': '这是一个关于恐龙的游戏',
      'space': '这是一个关于太空的游戏'
    };
    if (templateHints[req.templateId]) {
      userPrompt = templateHints[req.templateId] + '。' + userPrompt;
    }
  }

  // 优先尝试 Claude (Anthropic)
  if (process.env.ANTHROPIC_API_KEY) {
    return await callAnthropic(apiKey, userPrompt);
  }

  // 其次尝试 OpenAI
  if (process.env.OPENAI_API_KEY) {
    return await callOpenAI(apiKey, userPrompt);
  }

  throw new Error("未配置有效的 AI API Key");
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropic(apiKey: string, userPrompt: string): Promise<GameGenerationResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `${SYSTEM_PROMPT}\n\n用户描述：${userPrompt}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API 失败: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  return parseGameOutput(text);
}

/**
 * 调用 OpenAI API
 */
async function callOpenAI(apiKey: string, userPrompt: string): Promise<GameGenerationResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API 失败: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  return parseGameOutput(text);
}

/**
 * 解析 AI 输出，提取 JSON
 */
function parseGameOutput(text: string): GameGenerationResult {
  // 尝试直接解析 JSON
  try {
    return JSON.parse(text) as GameGenerationResult;
  } catch {
    // 尝试提取 ```json ... ``` 包裹的内容
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as GameGenerationResult;
      } catch {
        // 继续尝试其他方式
      }
    }
    
    // 尝试提取 ``` ... ``` 包裹的内容
    const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1]) as GameGenerationResult;
      } catch {
        // 继续尝试其他方式
      }
    }

    // 如果找不到有效 JSON，构建一个简单的默认游戏
    return buildDefaultGame(text);
  }
}

/**
 * 构建默认游戏（兜底方案）
 */
function buildDefaultGame(description: string): GameGenerationResult {
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
    .game {
      width:100%; max-width:500px; text-align:center; padding:20px;
    }
    .emoji {
      font-size:100px; cursor:pointer; display:inline-block;
      transition: transform 0.1s;
    }
    .emoji:active { transform: translateY(-20px) scale(1.1); }
    .score {
      font-size:30px; color:#fff; font-weight:bold; margin-bottom:20px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .title {
      font-size:24px; color:#333; margin-bottom:20px;
    }
  </style>
</head>
<body>
  <div class="game">
    <div class="title">${title}</div>
    <div class="score">得分: <span id="score">0</span></div>
    <div class="emoji" id="target">🎮</div>
  </div>
  <script>
    let score = 0;
    const target = document.getElementById('target');
    const scoreEl = document.getElementById('score');
    const emojis = ['🎮', '🎨', '🎯', '🎪', '🎭', '🎬', '🎤', '🎧', '🎸', '🎹'];
    
    target.addEventListener('click', () => {
      score++;
      scoreEl.textContent = score;
      target.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      target.style.transform = 'scale(0.8)';
      setTimeout(() => target.style.transform = '', 100);
    });
  </script>
</body>
</html>`
  };
}
