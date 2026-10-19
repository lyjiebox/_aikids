/**
 * ============================================================
 * remix.js — Remix 前端辅助（V3.3）
 * ============================================================
 *
 * 纯函数，无 React 依赖：
 * - analyzeGameProfile()：从原游戏 HTML 提取结构档案（仅用于 UI 展示）
 * - getRemixPreserveLabels()：生成「将保留」标签
 * - createRemixContext()：组装写入 sessionStorage 的 Remix 上下文
 *
 * 注意：服务端会自行分析源码，前端档案只用于展示，不参与 Prompt 组装。
 * 规则需与 server/src/services/remix.ts 保持对等。
 */

const TEMPLATE_LABELS = {
  free: '自由创作',
  animal: '动物乐园',
  vehicle: '汽车王国',
  princess: '公主城堡',
  dinosaur: '恐龙世界',
  space: '太空冒险',
};

const MAX_INPUT_CHARS = 200000;

function asSource(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_INPUT_CHARS);
}

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

export function extractGameTitle(html) {
  if (!html) return '';
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 60);
}

function detectInteractions(source) {
  const list = [];
  if (/addEventListener\s*\(\s*['"]click|onclick\s*=|\.onclick\s*=/i.test(source)) {
    list.push('点击');
  }
  if (/touch(start|move|end|cancel)|ontouch/i.test(source)) {
    list.push('触摸');
  }
  if (/key(down|up)|keyCode|addEventListener\s*\(\s*['"]key/i.test(source)) {
    list.push('键盘');
  }
  if (/drag(start|move|end|enter|leave)?|pointer(down|move|up)|ondrag|draggable/i.test(source)) {
    list.push('拖拽');
  }
  if (/mousemove|mousedown|mouseup|onmousemove/i.test(source)) {
    list.push('鼠标移动');
  }
  return uniq(list);
}

function detectMechanics(source, title) {
  const combined = `${title}\n${source}`;
  const list = [];

  if (/\bscore\b|得分|分数|积分|points?\b/i.test(source)) list.push('得分');
  if (/\b(win|lose|game\s*over|gameover)\b|胜利|失败|游戏结束|挑战成功|挑战失败/i.test(source)) {
    list.push('胜负');
  }
  if (/\b(timer|countdown|timeLeft|timeLimit|timeRemaining)\b|倒计时|剩余时间|时间到/i.test(source)) list.push('倒计时');
  if (/Math\.random/i.test(source)) list.push('随机生成');
  if (/collision|intersect|getBoundingClientRect|hitTest|overlap/i.test(source)) {
    list.push('碰撞检测');
  }
  if (/\blevel\b|关卡|难度|stage/i.test(source)) list.push('关卡/难度');
  if (/SFX|Audio\s*\(|playSound|new\s+Audio|audio/i.test(source)) list.push('音效');
  if (/restart|重玩|再玩|reset/i.test(source)) list.push('重玩');
  if (/requestAnimationFrame|setInterval/i.test(source)) list.push('实时循环');

  if (/地鼠|mole|whack/i.test(combined)) list.push('打地鼠');
  if (/跳跃|jump|跳一跳/i.test(combined)) list.push('跳跃');
  if (/收集|collect|coin|金币|宝石|star|星星/i.test(combined)) list.push('收集');
  if (/躲避|dodge|avoid|障碍/i.test(combined)) list.push('躲避');
  if (/射击|shoot|bullet|子弹/i.test(combined)) list.push('射击');
  if (/配对|match|pair|翻牌|memory/i.test(combined)) list.push('配对');
  if (/拼图|puzzle/i.test(combined)) list.push('拼图');
  if (/跑酷|runner/i.test(combined)) list.push('跑酷');
  if (/喂养|feed|食物/i.test(combined)) list.push('喂养');
  if (/装扮|换装|dress/i.test(combined)) list.push('装扮');

  return uniq(list);
}

/**
 * 分析原游戏 HTML，返回用于展示的结构档案。
 * @param {string} html 原游戏源码
 * @param {{title?: string, templateId?: string}} options
 */
export function analyzeGameProfile(html, options = {}) {
  const source = asSource(html);
  const title =
    (options.title || '').trim().slice(0, 60) ||
    extractGameTitle(source) ||
    '原游戏';
  const templateId = (options.templateId || 'free').trim() || 'free';

  let render = 'unknown';
  if (/<canvas[\s>]/i.test(source)) render = 'canvas';
  else if (/<[a-z][\s\S]*>/i.test(source)) render = 'dom';

  return {
    title,
    templateId,
    templateName: TEMPLATE_LABELS[templateId] || '自由创作',
    render,
    interactions: detectInteractions(source),
    mechanics: detectMechanics(source, title),
    hasScore: /\bscore\b|得分|分数|积分|points?\b|进度/i.test(source),
    hasWinLose:
      /\b(win|lose|game\s*over|gameover)\b|胜利|失败|游戏结束|挑战成功|挑战失败/i.test(source),
    hasTimer: /\b(timer|countdown|timeLeft|timeLimit|timeRemaining)\b|倒计时|剩余时间|时间到/i.test(source),
    hasMobileViewport:
      /<meta[^>]+viewport[^>]*>/i.test(source) && /width\s*=\s*device-width/i.test(source),
    hasSoundCue: /SFX|Audio\s*\(|playSound|new\s+Audio|audio/i.test(source),
    lineCount: source ? source.split('\n').length : 0,
    charCount: source.length,
  };
}

/**
 * 生成「会保留」标签，例如：点击/触摸、得分、胜负。
 * 最多返回 5 个，避免弹窗拥挤。
 */
export function getRemixPreserveLabels(profile) {
  if (!profile) return [];
  const labels = [];

  if (profile.interactions && profile.interactions.length > 0) {
    labels.push(profile.interactions.slice(0, 2).join('/'));
  }
  if (profile.hasScore) labels.push('得分');
  if (profile.hasWinLose) labels.push('胜负');
  if (profile.hasTimer) labels.push('倒计时');
  if (profile.render === 'canvas') labels.push('Canvas 画面');
  if (profile.hasMobileViewport) labels.push('手机适配');

  return uniq(labels).slice(0, 5);
}

/**
 * 创建写入 sessionStorage 的 Remix 上下文。
 * 完整 gameHtml 会随请求发送给后端（不再截断为 300 字符）。
 */
export function createRemixContext(work, instruction) {
  if (!work) return null;
  return {
    remixFrom: work.id,
    remixInstruction: instruction,
    originalTitle: work.title,
    originalUserPrompt: work.userPrompt,
    originalGameHtml: work.gameHtml,
    templateId: work.templateId,
  };
}
