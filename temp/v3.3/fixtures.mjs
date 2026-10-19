/**
 * V3.3 测试共用样本
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
