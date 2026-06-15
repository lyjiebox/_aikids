# Design: AI 儿童创意游戏平台 V2.0（Remix）

> 版本：v2.0
> 对应文档：`docs/proposal.md`
> 编写日期：2026-06-15
> 说明：仅包含 V2.0 新增功能（Remix），不改变 V1.0 已有架构

---

## 1. 核心功能

V2.0 仅实现 Remix 功能（V1.0 已有功能保持不变）：基于现有游戏作品，用户输入新想法（如"加个 Boss 关"、"换成海底主题"），AI 重新生成新游戏，并记录 Remix 来源。

---

## 2. 数据模型变更

### 2.1 GameWork 新增字段

```typescript
export type GameWork = {
  // V1.0 原有字段（保持不变）
  id: string;
  title: string;
  templateId: string;
  userPrompt: string;
  gameHtml: string;
  engine: 'volcengine' | 'mock';
  createdAt: number;
  playCount: number;
  generationTime?: number;

  // V2.0 新增字段
  remixFrom?: string;    // 来源作品 ID（表示是从哪个作品 Remix 来的）
  remixInstruction?: string; // Remix 指令（用户输入的新想法）
  remixCount: number;     // 被 Remix 次数（默认 0）
};
```

---

## 3. UI 设计

### 3.1 播放页（Play.jsx）- 新增 Remix 入口

修改现有 `Play.jsx`：

- 顶部浮动栏（`top-bar`）新增「🔄 Remix」按钮，放在「✕ 关闭」右侧
- 按钮样式：圆角、大图标、紫色渐变（和主题一致）

### 3.2 Remix 弹窗（新增组件 `RemixModal.jsx`）

新增大尺寸弹窗组件：

- 标题：「🔄 改编这个游戏」
- 副标题：「说说你想怎么改？」
- 输入框：大圆角、大字体、placeholder 文案："比如：加个 Boss 关、换成海底主题、增加关卡"
- 底部按钮：「取消」（灰色）+「✨ 生成新游戏」（紫色渐变）
- 居中展示，半透明黑色遮罩

### 3.3 作品卡片（Gallery.jsx）- 新增 Remix 标识

修改现有 `GameCard` 组件：

- 如果是 Remix 作品（`remixFrom` 存在），在卡片顶部显示小字：「改编自 XXX」（XXX 是原始作品标题，截断不超过 10 字）
- 卡片底部新增「🔄 Remix」按钮，和「▶️ 玩」并列
- 显示被 Remix 次数：「被改编了 N 次」（可选，后续迭代）

---

## 4. 路由变更

V2.0 不新增路由，复用现有 `/create` 创作页：

- Remix 流程：点击 Remix → 弹窗输入 → 跳转到 `/create`，自动填入 Remix 增强 Prompt → 点击生成

---

## 5. 服务端变更（可选）

V2.0 优先复用前端 localStorage 模式，暂不接入云端数据库：

- 生成时如果是 Remix，前端自动记录 `remixFrom` 和 `remixInstruction`
- 保存作品时，如果是从某个作品 Remix，更新原始作品的 `remixCount`（+1）

---

## 6. Prompt 增强（核心逻辑）

### 6.1 Remix Prompt 组装

在 `api/generate.ts` 中新增 Remix 分支（或在前端 `services/api.js` 中增强）：

```typescript
// 如果是 Remix，组装增强 Prompt
if (remixFrom) {
  finalPrompt = `
${SYSTEM_PROMPT}

原始游戏信息：
- 原始用户描述：${originalWork.userPrompt}
- 原始游戏标题：${originalWork.title}
- 原始游戏 HTML：${originalWork.gameHtml.substring(0, 300)}...

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个新游戏。
`;
} else {
  // V1.0 原有逻辑
  finalPrompt = `${SYSTEM_PROMPT}\n\n用户描述：${userPrompt}\n${templateHint}`;
}
```

### 6.2 核心约束

- 原始 `gameHtml` 只截取前 300 字符（避免 Token 爆炸），主要传递结构和风格
- 重点传递原始 `userPrompt` 和新增 `remixInstruction`

---

## 7. 交互流程

```
用户在播放页
    ↓
点击「🔄 Remix」按钮
    ↓
弹出 Remix 输入框
    ↓
用户输入新想法，点击「✨ 生成新游戏」
    ↓
前端获取原始作品信息，组装增强 Prompt
    ↓
跳转到 /create 创作页（可选：直接在 Play 页触发生成，复用 Create 的生成逻辑）
    ↓
AI 生成新游戏
    ↓
保存新作品，记录 remixFrom、remixInstruction，更新原始作品 remixCount
    ↓
跳转到新游戏的播放页
```

---

## 8. 实现优先级

1. ✅ 播放页新增「🔄 Remix」按钮
2. ✅ 新增 `RemixModal.jsx` 组件
3. ✅ Gallery 卡片展示「改编自 XXX」
4. ✅ 前端 Prompt 增强与 Remix 信息记录
5. ✅ 跳转与保存流程
6. ⏭️ Gallery 卡片新增「🔄 Remix」按钮（可选，后续迭代）
7. ⏭️ Remix 次数展示（可选，后续迭代）
