/**
 * ============================================================
 * 共享配置 — 游戏模板（V3.6）
 * ============================================================
 *
 * 本文件是模板清单的唯一来源，同时被前端与服务端使用：
 * - 前端：首页模板卡、创作页模板选择、作品元数据
 * - 服务端：普通生成的模板提示前缀、Remix 档案里的模板名称
 *
 * 修改方式：直接改本文件 → 重新构建
 * - 前端：npm run build
 * - Vercel 函数：npm run build:api
 * - 本地服务：npm run build:server
 *
 * 约束：
 * 1. 只放纯数据，不 import 任何业务模块。
 * 2. id 必须唯一且稳定；已发布作品的 templateId 依赖它。
 * 3. 新增模板时必须同时提供 promptHint 与 aiHint。
 */

export type TemplateCategory = 'animal' | 'vehicle' | 'fantasy' | 'other';

export interface GameTemplate {
  /** 唯一标识，用于 API 请求、路由参数与作品记录 */
  id: string;
  /** 显示名称（中文） */
  name: string;
  /** emoji 图标 */
  icon: string;
  /** 前端展示用的提示文案（保持 V3.1 起的字段语义） */
  promptHint: string;
  /** 服务端注入 Prompt 的模板前缀 */
  aiHint: string;
  /** 分类 */
  category: TemplateCategory;
}

export const GAME_TEMPLATES: GameTemplate[] = [
  {
    id: 'free',
    name: '自由创作',
    icon: '✨',
    promptHint: '根据孩子的自由想象生成游戏',
    aiHint: '',
    category: 'other',
  },
  {
    id: 'animal',
    name: '动物乐园',
    icon: '🐰',
    promptHint: '生成以动物为主题的游戏，如打地鼠、喂兔子等',
    aiHint: '这是一个关于动物的游戏',
    category: 'animal',
  },
  {
    id: 'vehicle',
    name: '汽车王国',
    icon: '🚗',
    promptHint: '生成以交通工具为主题的游戏，如赛车、停车等',
    aiHint: '这是一个关于交通工具/汽车的游戏',
    category: 'vehicle',
  },
  {
    id: 'princess',
    name: '公主城堡',
    icon: '🏰',
    promptHint: '生成以公主/城堡为主题的游戏，如收集宝石、装扮等',
    aiHint: '这是一个关于公主/魔法的游戏',
    category: 'fantasy',
  },
  {
    id: 'dinosaur',
    name: '恐龙世界',
    icon: '🦕',
    promptHint: '生成以恐龙为主题的游戏，如找恐龙、孵化恐龙蛋等',
    aiHint: '这是一个关于恐龙的游戏',
    category: 'fantasy',
  },
  {
    id: 'space',
    name: '太空冒险',
    icon: '🚀',
    promptHint: '生成以太空为主题的游戏，如开飞船、打陨石等',
    aiHint: '这是一个关于太空的游戏',
    category: 'other',
  },
];

/** 模板 ID → 显示名称（Remix 档案、作品展示共用） */
export const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  GAME_TEMPLATES.map((template) => [template.id, template.name])
);

/** 模板 ID → 服务端 Prompt 前缀（空字符串表示不追加） */
export const TEMPLATE_PROMPT_HINTS: Record<string, string> = Object.fromEntries(
  GAME_TEMPLATES.filter((template) => template.aiHint).map((template) => [
    template.id,
    template.aiHint,
  ])
);

/** 判断模板 ID 是否存在 */
export function isKnownTemplate(templateId: unknown): boolean {
  return (
    typeof templateId === 'string' &&
    GAME_TEMPLATES.some((template) => template.id === templateId)
  );
}
