/**
 * 测试共用样本游戏。
 */

export const sourceGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>星星收集大冒险</title>
  <style>
    body { margin:0; background:#ffeaa7; font-family:system-ui, sans-serif; }
    #score { position:fixed; top:12px; left:12px; font-size:26px; font-weight:bold; }
    .star { font-size:64px; cursor:pointer; }
  </style>
</head>
<body>
  <div id="score">得分：0</div>
  <div class="star" id="star">⭐</div>
  <div id="status">收集 10 颗星星就胜利，时间到则失败</div>
  <!-- SFX: collect -->
  <script>
    let score = 0;
    let timeLeft = 30;
    const star = document.getElementById('star');
    const scoreEl = document.getElementById('score');
    star.addEventListener('click', () => {
      score += 1;
      scoreEl.textContent = '得分：' + score;
      if (score >= 10) { alert('胜利！'); }
    });
    setInterval(() => { timeLeft -= 1; if (timeLeft <= 0) { alert('失败'); } }, 1000);
  </script>
</body>
</html>`;

export const canvasGame = `<html>
<head><title>太空躲避</title></head>
<body>
<canvas id="game" width="400" height="600"></canvas>
<script>
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let score = 0;
const rocks = [];
function spawn() { rocks.push({ x: Math.random() * 400, y: 0, r: 15 }); }
document.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') player.x -= 20; });
canvas.addEventListener('touchstart', (e) => { player.x = e.touches[0].clientX; });
canvas.addEventListener('pointerdown', () => { score += 1; });
function loop() { ctx.clearRect(0, 0, 400, 600); spawn(); requestAnimationFrame(loop); }
loop();
</script>
</body>
</html>`;

export const BIG_MARKER = 'MIDDLE_MARKER_SHOULD_BE_OMITTED';

export const bigGame = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>超长源码游戏</title>
  <style>${'body{margin:0;background:#fff}\n'.repeat(700)}</style>
</head>
<body>
  <div id="score">得分：0</div>
  <div id="win">胜利</div>
  ${'<div class="item">⭐</div>\n'.repeat(500)}
  <div id="middle">${BIG_MARKER}</div>
  ${'<div class="item">💎</div>\n'.repeat(500)}
  <script>
    let score = 0;
    document.addEventListener('click', () => { score += 1; });
    setInterval(() => {}, 1000);
  </script>
</body>
</html>`;

/** 构造一个指向本地测试桩的自定义模型配置 */
export function customModel(stubUrl, model = 'stub-model') {
  return {
    id: 'custom-test-model',
    name: '本地测试桩',
    baseUrl: stubUrl,
    model,
    apiKey: 'test-key',
  };
}
