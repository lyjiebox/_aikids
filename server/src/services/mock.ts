/**
 * ============================================================
 * 本地兜底游戏（V3.5 唯一实现）
 * ============================================================
 *
 * 仅在「没有可用模型」或「模型调用/解析失败且不是 Remix」时使用。
 * 保持 V1.0 起的两个固定模板与主题映射。
 */

export interface MockGame {
  title: string;
  html: string;
}

const MOCK_GAMES: MockGame[] = [
  {
    title: '跳跃的小兔子',
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
</html>`,
  },
  {
    title: '太空飞船大冒险',
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
</html>`,
  },
];

/**
 * 生成本地 Mock 游戏。
 * animal → 小兔子；space → 太空船；其他模板随机。
 */
export function createMockGame(templateId?: string): MockGame {
  if (templateId === 'animal') return MOCK_GAMES[0];
  if (templateId === 'space') return MOCK_GAMES[1];
  return MOCK_GAMES[Math.floor(Math.random() * MOCK_GAMES.length)];
}
