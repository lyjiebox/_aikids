# Design: AI 儿童创意游戏平台 V3.1（System Prompt 升级）

> 版本：v3.1
> 对应文档：`docs/proposal.md`
> 编写日期：2026-06-30
> 说明：仅优化 System Prompt，不改架构、不新增依赖、不改前端

---

## 1. 核心功能

V3.1 是 V3.0 提示词工程的第一个子版本：**只改 System Prompt 常量，让豆包模型生成更高质量的儿童游戏**。

### 1.1 范围界定（与 proposal 对齐）

| 功能 | V3.1 范围 | 说明 |
|------|----------|------|
| System Prompt 重写 | ✅ 必做 | 替换现有 SYSTEM_PROMPT 常量 |
| 同步更新两个入口文件 | ✅ 必做 | `server/src/services/ai.ts` + `api/generate.ts` |
| 模板提示前缀保留 | ✅ 保留 | V1.0 的 TEMPLATE_HINTS 逻辑不变 |
| Remix Prompt 分支保留 | ✅ 保留 | V2.0 的 Remix 逻辑不变 |
| 前端改动 | ❌ 不做 | 零前端变更 |
| 架构改动 | ❌ 不做 | 不新增依赖、不改路由、不改数据模型 |
| V3.2 模板结构化 | ❌ 不做 | 后续版本 |
| V3.3 Remix 上下文增强 | ❌ 不做 | 后续版本 |
| V3.4 后处理增强引擎 | ❌ 不做 | 后续版本 |

---

## 2. 改动详情

### 2.1 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `server/src/services/ai.ts` | 修改常量 | 替换 `SYSTEM_PROMPT` |
| `api/generate.ts` | 修改常量 | 替换 `SYSTEM_PROMPT`（与 server 保持一致） |

### 2.2 新版 System Prompt

以下为替换后的 `SYSTEM_PROMPT` 常量值：

```typescript
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
```

### 2.3 与旧版 Prompt 的差异对比

| 维度 | 旧版 Prompt | 新版 Prompt | 改进点 |
|------|------------|------------|--------|
| 交互方式 | "以点击/拖拽为主" | "至少包含 3 种交互" | 强制多样性，避免单一点击游戏 |
| 得分系统 | "包含简单的得分系统或目标" | "必须有分数显示或进度条，左上角显示" | 位置明确、必须有 |
| 音效 | "包含简单的音效反馈" | "用注释标注音效触发点" | 明确标注方式，便于后处理 |
| 游戏时长 | "30秒 - 3分钟" | "一局 30-60 秒" | 缩短时长，适配儿童注意力 |
| 胜利/失败 | 未明确要求 | "必须有明确的胜利条件和失败条件" | 强制游戏完整性 |
| 默认类型 | 无默认 | "默认生成收集类游戏" | 模糊输入兜底 |
| 移动端 | viewport 建议但无 touch 要求 | "使用 touch 事件，禁止页面缩放" | 强制移动端可玩 |
| 视觉风格 | "配色明亮、卡通风格" | "明亮卡通、大按钮、圆角 UI、高对比度色彩" | 更具体的 UI 规范 |
| 标题长度 | "10字以内" | "4-8个字" | 更简短，适合儿童阅读 |
| 技术约束 | 列出禁止项（iframe/form/eval） | 移除技术约束列表 | 减少 Token 占用，靠模型常识约束 |
| 游戏类型参考 | 列出 5 种参考类型 | 移除 | 让模型自由发挥，减少偏向 |

### 2.4 关键设计决策

**Q: 为什么移除技术安全约束（禁止 iframe/form/eval）？**

A: 豆包模型已具备基本安全常识，移除这些约束可以节省 Token 预算给更重要的游戏规则。如果后续发现安全问题，在 V3.4 后处理增强引擎中补回。

**Q: 为什么缩短游戏时长到 30-60 秒？**

A: 3-10 岁儿童注意力短暂，30-60 秒一局更适合反复挑战。旧版最长 3 分钟导致模型生成过于复杂的游戏，失败率偏高。

**Q: 为什么移除游戏类型参考列表？**

A: 旧版列出"点击类、记忆类、躲避类、涂色类、拼图"，模型容易局限在这 5 种。移除后让模型根据用户描述自由发挥，同时保留"默认收集类"作为模糊输入的兜底。

**Q: 用户提供的 Prompt 末尾有 `{userPrompt}`，如何处理？**

A: `{userPrompt}` 是用户输入，不应放在 System Prompt 中。当前架构中 userPrompt 作为独立的 user message 传给 API（见 `callVolcengineResponses` 函数），System Prompt 只定义角色和规则。因此新版 Prompt **不包含 `{userPrompt}` 占位符**，用户输入仍通过 user message 传递。

**Q: 为什么同时修改两个文件？**

A: 项目采用双后端模式——`api/generate.ts` 用于 Vercel Serverless 部署，`server/src/services/ai.ts` 用于本地开发。两个文件各自维护一份 `SYSTEM_PROMPT` 常量，必须保持一致。

---

## 3. 不变的部分

以下部分在 V3.1 中**完全不动**：

### 3.1 模板提示前缀（TEMPLATE_HINTS）

```typescript
const TEMPLATE_HINTS: Record<string, string> = {
  'animal': '这是一个关于动物的游戏',
  'vehicle': '这是一个关于交通工具/汽车的游戏',
  'princess': '这是一个关于公主/魔法的游戏',
  'dinosaur': '这是一个关于恐龙的游戏',
  'space': '这是一个关于太空的游戏'
};
```

模板前缀仍拼接在 userPrompt 前面，作为 user message 传递。

### 3.2 Remix Prompt 分支

V2.0 的 Remix 逻辑（`remixFrom` + `remixInstruction`）保持不变，新版 System Prompt 自动适用于 Remix 生成。

### 3.3 AI 调用链

- 火山引擎 Responses API 优先
- Anthropic Claude 备选（仅 `server/src/services/ai.ts`）
- OpenAI 最后备选（仅 `server/src/services/ai.ts`）
- Mock 兜底

### 3.4 输出解析

`parseGameOutput` 函数不变，仍支持纯 JSON、Markdown 代码块、截断 JSON 提取、纯 HTML 兜底等策略。

### 3.5 前端

零前端变更。UI、路由、存储、状态管理全部不变。

---

## 4. 数据模型

无变更。`GameWork` 类型定义与 V2.0 完全一致。

---

## 5. 交互流程

无变更。用户创作、Remix、播放、Gallery 等流程与 V2.0 完全一致。

---

## 6. 异常与降级

| 场景 | 预期行为 |
|------|---------|
| AI 返回的 JSON 缺少 title 或 html | `parseGameOutput` 策略兜底（与 V1.0/V2.0 一致） |
| AI 返回纯 HTML 无 JSON 包裹 | 策略 5 兜底（与 V1.0/V2.0 一致） |
| AI 生成超时 | Vercel maxDuration 300s 不变，超时走 Mock |
| AI 不可用 | Mock 兜底（与 V1.0/V2.0 一致） |
| 新 Prompt 导致 Token 超限 | 新 Prompt 比旧版更短，Token 占用反而降低 |

---

## 7. 实现优先级

| 优先级 | 项 | 阻塞发布 |
|--------|-----|---------|
| P0 | `server/src/services/ai.ts` 替换 SYSTEM_PROMPT | 是 |
| P0 | `api/generate.ts` 替换 SYSTEM_PROMPT | 是 |
| P0 | 两个文件 Prompt 内容完全一致 | 是 |
| P1 | 构建无报错（`npm run build`） | 是 |
| P1 | 旧版 Prompt 的有效规则未被丢弃 | 是 |
| P2 | 新 Prompt Token 数 <= 旧版 | 否（优化项） |

---

## 8. 目录与文件变更

```text
server/src/services/
└── ai.ts                        # 修改：替换 SYSTEM_PROMPT 常量

api/
└── generate.ts                  # 修改：替换 SYSTEM_PROMPT 常量

temp/
└── v3.1/                        # V3.1 测试报告等临时文件
```

无新增文件，无删除文件。

---

## 9. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 移除技术约束导致不安全代码 | 低 | 中 | 模型自带安全常识；V3.4 后处理引擎可补回 |
| 缩短游戏时长导致内容过少 | 低 | 低 | 30-60 秒对儿童足够，且可重玩 |
| 移除游戏类型参考导致类型偏窄 | 低 | 低 | "默认收集类"兜底 + 模型自由发挥 |
| 两个文件 Prompt 不一致 | 中 | 高 | UAT 验收时检查一致性 |
| 新 Prompt 效果不如旧版 | 中 | 中 | 可通过 Git 快速回滚；UAT 人工测试把关 |

---

*本文件为 V3.1 版本的设计文档，对应 `docs/proposal.md` 和 `docs/uat-v3.1.md`。*
