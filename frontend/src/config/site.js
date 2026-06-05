export const SITE_CONFIG = {
  appName: "AI 魔法游戏",
  apiBaseUrl: "/api",
};

export const DEFAULT_SETTINGS = {
  dailyTimeLimit: 30,
  sessionTimeLimit: 20,
  allowVoiceInput: true,
  contentFilterLevel: "strict",
};

export const TEMPLATES = [
  {
    id: "free",
    name: "自由创作",
    icon: "✨",
    promptHint: "根据孩子的自由想象生成游戏",
    category: "other",
  },
  {
    id: "animal",
    name: "动物乐园",
    icon: "🐰",
    promptHint: "生成以动物为主题的游戏，如打地鼠、喂兔子等",
    category: "animal",
  },
  {
    id: "vehicle",
    name: "汽车王国",
    icon: "🚗",
    promptHint: "生成以交通工具为主题的游戏，如赛车、停车等",
    category: "vehicle",
  },
  {
    id: "princess",
    name: "公主城堡",
    icon: "🏰",
    promptHint: "生成以公主/城堡为主题的游戏，如收集宝石、装扮等",
    category: "fantasy",
  },
  {
    id: "dinosaur",
    name: "恐龙世界",
    icon: "🦕",
    promptHint: "生成以恐龙为主题的游戏，如找恐龙、孵化恐龙蛋等",
    category: "fantasy",
  },
  {
    id: "space",
    name: "太空冒险",
    icon: "🚀",
    promptHint: "生成以太空为主题的游戏，如开飞船、打陨石等",
    category: "other",
  },
];
