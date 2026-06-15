# Design: AI 儿童创意游戏平台 V2.0（Remix）

> 版本：v2.0
> 对应文档：`docs/proposal.md`
> 编写日期：2026-06-15
> 修订日期：2026-06-15
> 说明：仅包含 V2.0 新增功能（Remix），不改变 V1.0 已有架构

---

## 1. 核心功能

V2.0 仅实现 Remix 功能（V1.0 已有功能保持不变）：基于现有游戏作品，用户输入新想法（如"加个 Boss 关"、"换成海底主题"），AI 重新生成新游戏，并记录 Remix 来源。

### 1.1 范围界定（与 proposal 对齐）

| 功能 | V2.0 范围 | 说明 |
|------|----------|------|
| 播放页 Remix 入口 | ✅ 必做 | Play.jsx 顶部浮动栏 |
| Remix 弹窗输入 | ✅ 必做 | RemixModal.jsx |
| Remix Prompt 组装 | ✅ 必做 | 拼接原始 userPrompt + remixInstruction |
| remixFrom / remixInstruction 记录 | ✅ 必做 | 新作品持久化 |
| Gallery「改编自 XXX」 | ✅ 必做 | 卡片顶部来源标识 |
| remixCount 计数 | ✅ 必做 | 保存新 Remix 作品时 +1 |
| Remix 链条查看（多级溯源 UI） | ⏭️ V2.x | 仅展示直接来源，不做链条导航页 |
| 社区广场按 remixCount 热度排序 | ⏭️ V2.1 | 依赖云端作品广场，V2.0 无社区 Tab |
| Gallery 卡片「🔄 Remix」按钮 | ⏭️ V2.x | 播放页入口已覆盖主流程 |
| Gallery「被改编了 N 次」展示 | ⏭️ V2.x | remixCount 已存储，UI 后续迭代 |

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
  remixFrom?: string;         // 来源作品 ID
  remixInstruction?: string;  // 用户输入的改编想法
  remixCount: number;         // 被 Remix 次数（默认 0）
};
```

### 2.2 旧数据兼容

V1.0 已存作品不含 V2.0 字段，读取时必须兼容：

- `loadWorks()` 返回后，对每条作品做 normalize：
  - 无 `remixCount` → 补 `0`
  - 无 `remixFrom` / `remixInstruction` → 保持 `undefined`，视为非 Remix 作品
- 新建作品（含普通创作与 Remix）必须显式写入 `remixCount: 0`（非 Remix）或继承来源逻辑
- 不在读取时批量写回 localStorage（避免无谓 I/O）；仅在 `addWork` / `updateWork` 时持久化完整字段

### 2.3 remixCount 更新规则

- 触发时机：Remix 新作品**保存成功**后，对 `remixFrom` 指向的原始作品 `remixCount += 1`
- 不触发：生成失败、用户取消、弹窗关闭未提交
- 原始作品已删除：跳过更新，不报错（Remix 作品仍正常保存，`remixFrom` 保留 ID）
- 同一作品连续被 Remix N 次：`remixCount` 累计 +N

---

## 3. UI 设计

### 3.1 播放页（Play.jsx）- 新增 Remix 入口

修改现有 `Play.jsx`：

- 顶部浮动栏（`top-bar`）新增「🔄 Remix」按钮，放在「✕ 关闭」右侧
- 按钮样式：`border-radius >= 16px`，字号 >= 20px，紫色渐变（与 V1.0 主题一致）
- 点击后打开 `RemixModal`，不离开播放页

### 3.2 Remix 弹窗（新增组件 `RemixModal.jsx`）

新增大尺寸弹窗组件：

| 元素 | 规格 |
|------|------|
| 遮罩 | 半透明黑色（`rgba(0,0,0,0.5)`），点击遮罩不关闭（防误触） |
| 标题 | 「🔄 改编这个游戏」，字号 >= 24px，居中 |
| 副标题 | 「说说你想怎么改？」，字号 >= 18px，居中 |
| 输入框 | 多行 textarea，`border-radius >= 16px`，字号 >= 18px |
| placeholder | 「比如：加个 Boss 关、换成海底主题、增加关卡」 |
| 取消按钮 | 灰色，点击关闭弹窗，不跳转 |
| 确认按钮 | 「✨ 生成新游戏」，紫色渐变，触发 Remix 流程 |

**交互约束：**

- 空输入点击确认 → 提示「请说说你想怎么改」，不关闭弹窗
- 确认后关闭弹窗，进入生成流程

### 3.3 作品卡片（Gallery.jsx）- 新增 Remix 标识

修改现有 `GameCard` 组件：

- Remix 作品（`remixFrom` 存在）卡片顶部显示：「改编自 XXX」
  - XXX = 原始作品标题，超过 10 字截断并加「…」
  - 原始作品已删除 → 显示「改编自已删除的作品」（不跳转）
- 非 Remix 作品不显示来源标识
- Gallery 卡片「🔄 Remix」按钮、被改编次数展示 → V2.x 迭代（见 1.1）

---

## 4. 路由与状态传递

V2.0 不新增路由，复用现有 `/create` 创作页。

### 4.1 Remix 流程

```
播放页点击 Remix → RemixModal 输入 → 写入 sessionStorage → 跳转 /create?remix=1 → 自动进入生成
```

### 4.2 sessionStorage 传递方案

使用一次性上下文，避免 URL 过长或泄露 gameHtml：

| Key | 值 | 说明 |
|-----|-----|------|
| `aikids-remix-context` | JSON 字符串 | 读取后立即 `removeItem` |

```typescript
type RemixContext = {
  remixFrom: string;           // 原始作品 ID
  remixInstruction: string;    // 用户改编指令
  originalTitle: string;       // 原始标题（用于 UI 展示）
  originalUserPrompt: string;  // 原始 userPrompt
  originalGameHtml: string;    // 原始 gameHtml（Prompt 组装用）
  templateId: string;          // 继承原始 templateId
};
```

### 4.3 Create 页 Remix 模式

`/create?remix=1` 且存在有效 `aikids-remix-context` 时：

- 跳过步骤 1（模板选择）和步骤 2（语音输入 UI）
- 直接进入步骤 3（生成中），展示 LoadingAnimation
- 页面标题区可选展示：「正在改编：{originalTitle}」
- 生成请求携带 `remixFrom`、`remixInstruction` 及原始作品摘要

**无效上下文处理：**

- 无 sessionStorage 或 JSON 解析失败 → 提示「改编信息已失效，请重新操作」，跳转 Gallery
- `remixFrom` 对应作品在 localStorage 中不存在 → 仍可用 sessionStorage 快照生成；保存时不更新 remixCount

---

## 5. 存储与服务端

V2.0 继续采用前端 localStorage，不接入云端数据库：

- 新增 `updateWork(id, patch)` 或在 `AppContext` 中提供 `incrementRemixCount(sourceId)` 用于更新原始作品
- 生成时记录 `remixFrom`、`remixInstruction`
- 保存成功后更新原始作品 `remixCount`

**API 变更（`api/generate.ts` / `server/src/routes/generate.ts`）：**

请求体扩展可选字段：

```typescript
type GenerateRequest = {
  templateId: string;
  userPrompt: string;
  // V2.0 新增（Remix 时传入）
  remixFrom?: string;
  remixInstruction?: string;
  originalUserPrompt?: string;
  originalTitle?: string;
  originalGameHtmlPreview?: string; // 前端截取前 300 字符
};
```

后端优先组装 Remix Prompt；若 Remix 字段缺失则走 V1.0 原有逻辑。

---

## 6. Prompt 增强（核心逻辑）

### 6.1 Remix Prompt 组装

在 `api/generate.ts`（及本地 `server/` 对应路由）中新增 Remix 分支：

```typescript
if (remixFrom && remixInstruction) {
  finalPrompt = `
${SYSTEM_PROMPT}

原始游戏信息：
- 原始用户描述：${originalUserPrompt}
- 原始游戏标题：${originalTitle}
- 原始游戏 HTML 片段：${originalGameHtmlPreview}

用户的改编想法：${remixInstruction}

请根据原始游戏和改编想法，生成一个完整的新游戏。新游戏应体现用户的改编意图，同时保持适合 3-10 岁儿童的简洁玩法。
`;
} else {
  // V1.0 原有逻辑
  finalPrompt = `${SYSTEM_PROMPT}\n\n用户描述：${userPrompt}\n${templateHint}`;
}
```

### 6.2 核心约束

- 原始 `gameHtml` 仅传前 300 字符（`originalGameHtmlPreview`），避免 Token 爆炸
- 重点传递 `originalUserPrompt` + `remixInstruction`
- `remixInstruction` 不做前端截断（与 V1.0 超长 Prompt 策略一致）
- Mock 降级时：新作品仍记录 Remix 元数据，`userPrompt` 可拼接为「[Remix] {remixInstruction}（改编自：{originalTitle}）」

---

## 7. 交互流程

```
用户在播放页
    ↓
点击「🔄 Remix」按钮
    ↓
弹出 RemixModal
    ↓
用户输入新想法，点击「✨ 生成新游戏」
    ↓
校验非空 → 写入 sessionStorage → 跳转 /create?remix=1
    ↓
Create 页读取上下文，自动进入生成（LoadingAnimation）
    ↓
调用 API（携带 Remix 字段）→ AI 生成新游戏
    ↓
保存新作品（remixFrom、remixInstruction、remixCount: 0）
    ↓
更新原始作品 remixCount +1（若原始作品仍存在）
    ↓
跳转到新作品播放页 /play/{newId}
```

---

## 8. 异常与降级

| 场景 | 预期行为 |
|------|---------|
| 空 Remix 指令 | 弹窗内提示「请说说你想怎么改」，不跳转 |
| 点击「取消」 | 关闭弹窗，留在播放页 |
| 生成 API 失败 | 与 V1.0 一致：友好提示 + 可重试；不保存半成品、不更新 remixCount |
| 生成中用户返回/关闭 | 与 V1.0 一致：cleanup 计时器；未保存则不产生 Remix 记录 |
| sessionStorage 丢失 | 提示失效，引导回 Gallery 重新 Remix |
| 原始作品已删除 | Gallery 显示「改编自已删除的作品」；Remix 流程仍可用（依赖快照） |
| AI 不可用 Mock 降级 | 正常保存 Remix 元数据，`engine='mock'` |
| 对 Mock 引擎作品 Remix | 允许，走相同流程 |

---

## 9. 目录与文件变更

```text
src/
├── components/
│   ├── RemixModal.jsx          # 新增：Remix 输入弹窗
│   └── RemixModal.css
├── pages/
│   ├── Play.jsx                # 修改：Remix 入口 + 打开弹窗
│   ├── Create.tsx              # 修改：Remix 模式自动触发生成
│   └── Gallery.jsx             # 修改：「改编自 XXX」标识
├── context/
│   └── AppContext.jsx          # 修改：incrementRemixCount / normalize
├── services/
│   ├── storage.js              # 修改：loadWorks normalize
│   └── api.js                  # 修改：generateGame 传 Remix 字段
api/
└── generate.ts                 # 修改：Remix Prompt 分支
server/src/routes/
└── generate.ts                 # 修改：与 api/ 保持一致
temp/
└── v2.0/                       # V2.0 测试报告等临时文件
```

---

## 10. 实现优先级

| 优先级 | 项 | 阻塞发布 |
|--------|-----|---------|
| P0 | 播放页「🔄 Remix」按钮 + RemixModal | 是 |
| P0 | sessionStorage 传递 + `/create?remix=1` 自动生成 | 是 |
| P0 | API Remix Prompt 组装 | 是 |
| P0 | 新作品 remixFrom / remixInstruction 持久化 | 是 |
| P0 | 原始作品 remixCount 更新 | 是 |
| P1 | Gallery「改编自 XXX」展示 | 是 |
| P1 | 旧数据 normalize（remixCount 默认 0） | 是 |
| P1 | 空指令、上下文失效、源作品删除等异常处理 | 是 |
| P2 | Gallery 卡片 Remix 按钮 | 否（V2.x） |
| P2 | 「被改编了 N 次」展示 | 否（V2.x） |
| P2 | Remix 链条查看 UI | 否（V2.x） |
| P2 | 按 remixCount 热度排序 | 否（V2.1） |

---

*本文件为 V2.0 版本的设计文档，对应 `docs/proposal.md` 和 `docs/uat-v2.0.md`。*
