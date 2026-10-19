# UAT: AI 儿童创意游戏平台 V3.3（Remix 上下文增强）

> 版本：v3.3
> 对应文档：`docs/proposal.md`、`docs/design-v3.3.md`
> 编写日期：2026-10-19
> 验收方式：静态检查 + 构建验证 + 单元测试 + API 自动化测试 + 浏览器 UI 自动化 + 真实模型验证 + Vercel 线上验收
> 说明：只覆盖 V3.3 新增/变更项；V1.0/V2.0/V3.1/V3.2 的完整用例不重复，仅在回归章节抽查。

---

## 目录

1. [测试环境](#1-测试环境)
2. [验收准则总表](#2-验收准则总表)
3. [静态检查与构建](#3-静态检查与构建)
4. [单元测试](#4-单元测试)
5. [本地 API 验收](#5-本地-api-验收)
6. [Vercel 产物对等验收](#6-vercel-产物对等验收)
7. [前端 UI 验收](#7-前端-ui-验收)
8. [真实模型验收](#8-真实模型验收)
9. [线上 Vercel 验收](#9-线上-vercel-验收)
10. [回归验收](#10-回归验收)
11. [边界与异常场景](#11-边界与异常场景)
12. [BUG 修复确认表](#12-bug-修复确认表)
13. [附：验收流程与通过标准](#13-附验收流程与通过标准)

---

## 1. 测试环境

### 1.1 软件环境

| 项目 | 版本 |
|------|------|
| Node.js | >= 18（本地验证使用 v24） |
| 浏览器 | Chrome 最新稳定版（CDP 自动化）、Safari 手工抽查 |
| 前端 | Vite + React 18 |
| 后端 | Hono（本地 `server/` 与 Vercel `api/` 双模式） |
| 测试桩 | `temp/v3.3/stub-remix-server.mjs`（Node 原生 HTTP） |

### 1.2 测试前置

#### 1.2.1 启动 Remix 测试桩

```bash
node temp/v3.3/stub-remix-server.mjs
# 监听 http://localhost:4998
```

测试桩能力：

| 模型标识 | 行为 |
|----------|------|
| `remix-stub` | 默认：返回一个保留原结构的改编游戏（标题加「改编版」，追加 Boss 元素） |
| `remix-force-500` | 返回 HTTP 500，用于验证失败保留原游戏 |
| `remix-plain` | 返回纯 HTML（无 JSON 包裹），用于解析回归 |
| `remix-no-score` | 返回删掉得分系统的游戏，用于验证审计能识别未保留 |

测试桩额外接口：

| 接口 | 用途 |
|------|------|
| `GET /last-request` | 返回最近一次 Chat Completions 请求体（用于断言 Prompt 内容） |
| `POST /reset` | 清空捕获的请求 |

#### 1.2.2 启动本地后端（指向测试桩）

```bash
cd server
VOLCENGINE_API_KEY=test-key \
VOLCENGINE_BASE_URL=http://localhost:4998/v1/chat/completions \
DOUBAO_ENDPOINT_ID=ep-doubao-uat \
DEEPSEEK_ENDPOINT_ID=ep-deepseek-uat \
GAME_MODEL=deepseek \
ALLOW_LOCAL_MODEL_HOSTS=1 \
MODEL_TEST_TIMEOUT_MS=2000 \
npm run dev
# 监听 http://localhost:4000
```

#### 1.2.3 启动前端

```bash
npm run dev
# 默认 http://localhost:3000
```

#### 1.2.4 测试产物

- 测试桩、自动化脚本、日志、报告统一放在 `temp/v3.3/`
- 报告命名：`uat-test-report-YYYY-MM-DD.md`

#### 1.2.5 自动化脚本

| 脚本 | 用途 |
|------|------|
| `temp/v3.3/stub-remix-server.mjs` | Remix 专用 OpenAI 兼容测试桩 |
| `temp/v3.3/remix-core.test.mjs` | 档案/Prompt/预算/审计/前后端一致性单元测试 |
| `temp/v3.3/api-uat.mjs` | 本地 `server/` Remix API 自动化验收 |
| `temp/v3.3/api-vercel-uat.mjs` | Vercel `api/` 产物对等验收 |
| `temp/v3.3/ui-remix-uat.mjs` | Chrome CDP UI 自动化（弹窗、生成、元数据、回退、列表） |
| `temp/v3.3/real-remix-check.mjs` | 真实模型 Remix 保真验证 |
| `temp/v3.3/vercel-remix-check.mjs` | 线上 Vercel Remix 验收 |

---

## 2. 验收准则总表

| 编号 | 验收项 | 优先级 | 通过标准 |
|------|--------|--------|----------|
| V3.3-01 | Remix 透传完整原游戏 HTML | P0 | 请求体中的 `originalGameHtml` 等于原作品 `gameHtml`（非 300 字符切片） |
| V3.3-02 | 游戏档案注入 Prompt | P0 | Prompt 含标题、模板、渲染方式、交互、机制、得分、胜负 |
| V3.3-03 | Remix 专用 System Prompt | P0 | 含「不是从零创作」「保留核心玩法」等硬性规则 |
| V3.3-04 | 完整源码预算模式 | P0 | ≤ 32,000 字符时为 `full`，Prompt 含完整源码 |
| V3.3-05 | 源码过长摘要模式 | P0 | > 32,000 字符时为 `outline`，含结构摘要与省略标注 |
| V3.3-06 | 旧客户端预览兼容 | P1 | 只有 `originalGameHtmlPreview` 时为 `preview`，请求成功 |
| V3.3-07 | Remix 结果审计 | P1 | 响应含 `remixAudit`，保留时 `preserved=true` |
| V3.3-08 | 模型失败保留原游戏 | P0 | `remixFallback=true`，`gameHtml` 与原 HTML 完全一致 |
| V3.3-09 | 无模型保留原游戏 | P0 | 无可用模型时同上，不返回随机 Mock |
| V3.3-10 | 前端弹窗展示原游戏信息 | P1 | 显示「基于《标题》改编」与保留标签 |
| V3.3-11 | 前端保存 Remix 元数据 | P1 | 作品含 `remixFromTitle/remixMode/remixProfile/remixAudit` |
| V3.3-12 | 失败不新增重复作品 | P0 | `remixFallback` 时回到原作品，作品数不变 |
| V3.3-13 | 作品列表来源展示 | P1 | 显示「改编自 XXX」，源作品删除后仍可显示 |
| V3.3-14 | 播放页保留标识 | P2 | 审计通过时显示「已保留原玩法」 |
| V3.3-15 | 普通生成不回归 | P0 | 非 Remix 请求 Prompt/行为与 V3.2 一致 |
| V3.3-16 | 构建通过 | P0 | `npm run build`、`cd server && npm run build` 均成功 |
| V3.3-17 | 本地/线上逻辑对等 | P0 | Vercel 产物测试与本地结果一致 |
| V3.3-18 | 真实模型保真 | P0 | 真实模型 Remix 后 `remixAudit.preserved=true` 且源码有变化 |
| V3.3-19 | Vercel 线上可用 | P0 | 线上 Remix 请求返回成功，页面可玩 |
| V3.3-20 | 安全约束 | P0 | 源码不写日志、iframe 仍为 `allow-scripts`、无 Key 回显 |

---

## 3. 静态检查与构建

### UAT-3.3-STATIC-01 前端构建

- **步骤**：`npm run build`
- **预期**：退出码 0，`dist/` 生成，无 TypeScript/JSX 错误。

### UAT-3.3-STATIC-02 后端构建

- **步骤**：`cd server && npm run build`
- **预期**：`tsc` 退出码 0，`server/dist/` 生成。

### UAT-3.3-STATIC-03 版本号

- **步骤**：检查根 `package.json` 与 `server/package.json`
- **预期**：均为 `3.3.0`。

### UAT-3.3-STATIC-04 无跨文件 API 导入

- **步骤**：检查 `api/generate.ts` 的 import
- **预期**：只依赖 `hono`，不 import `api/_*.ts` 或 `server/`，保持 Vercel 自包含。

---

## 4. 单元测试

执行：`npx tsx temp/v3.3/remix-core.test.mjs`

### UAT-3.3-UNIT-01 DOM 游戏档案

- **输入**：含 `click`、`score`、胜负文案、`setInterval`、`viewport` 的 DOM 游戏
- **预期**：`render='dom'`，交互含「点击」，`hasScore=true`，`hasWinLose=true`，`hasMobileViewport=true`，机制含「得分/胜负/计时」。

### UAT-3.3-UNIT-02 Canvas 游戏档案

- **输入**：含 `<canvas>`、`keydown`、`touchstart`、`Math.random`、碰撞检测的源码
- **预期**：`render='canvas'`，交互含「键盘/触摸」，机制含「随机生成/碰撞检测」。

### UAT-3.3-UNIT-03 完整源码 Prompt

- **输入**：15,000 字符以内的游戏 + 改编指令
- **预期**：`sourceMode='full'`；Prompt 含完整源码、标题、模板、交互、机制、得分、胜负、改编指令；System Prompt 含 Remix 硬性规则。

### UAT-3.3-UNIT-04 超长源码摘要

- **输入**：> 32,000 字符的游戏
- **预期**：`sourceMode='outline'`；Prompt 含「源码过长」「片段」「省略」标记；含脚本关键块；不包含超过预算的连续全文。

### UAT-3.3-UNIT-05 旧客户端预览

- **输入**：只有 `originalGameHtmlPreview`
- **预期**：`sourceMode='preview'`，Prompt 含片段与「未提供完整源码」提示。

### UAT-3.3-UNIT-06 无源码

- **输入**：只有标题/描述/改编指令
- **预期**：`sourceMode='none'`，Prompt 仍含档案与「不要从零重写」约束。

### UAT-3.3-UNIT-07 输出审计

- **输入**：原游戏与保留结构的改编游戏 / 删除得分系统的改编游戏
- **预期**：前者 `preserved=true`；后者 `scorePreserved=false`、`preserved=false`；两者 `changed=true`。

### UAT-3.3-UNIT-08 前后端档案规则一致

- **输入**：同一组 3 个游戏样本
- **预期**：`server/src/services/remix.ts` 与 `src/services/remix.js` 输出的核心字段完全一致。

### UAT-3.3-UNIT-09 源码边界

- **输入**：空字符串、非字符串、含 `</game_source>` 的源码
- **预期**：不抛异常；标签被转义/移除；空源码进入 `none`。

---

## 5. 本地 API 验收

执行：`node temp/v3.3/api-uat.mjs`

### UAT-3.3-API-01 完整源码 Remix

- **请求**：`POST /api/generate`，携带 `remixFrom/remixInstruction/originalTitle/originalUserPrompt/originalGameHtml`，`modelConfig.model='remix-stub'`
- **预期**：
  - HTTP 200，`success=true`
  - `data.gameHtml` 可直接运行
  - `data.remixMode='full'`
  - `data.remixProfile.title` 等档案字段存在
  - `data.remixAudit.preserved=true`

### UAT-3.3-API-02 测试桩收到的 Prompt

- **步骤**：调用 `GET /last-request`
- **预期**：
  - system 消息含 Remix 规则与「不是从零创作」
  - user 消息含标题、模板、渲染方式、核心交互、核心机制、得分/胜负、完整源码
  - `max_tokens=16384`

### UAT-3.3-API-03 超长源码摘要

- **请求**：`originalGameHtml` 长度 > 32,000
- **预期**：`remixMode='outline'`；Prompt 含「源码过长」「片段」「省略」；不把 32,000 字符之后的全部内容塞入 Prompt。

### UAT-3.3-API-04 旧客户端预览

- **请求**：仅 `originalGameHtmlPreview`
- **预期**：`remixMode='preview'`，请求成功。

### UAT-3.3-API-05 模型失败保留原游戏

- **请求**：`modelConfig.model='remix-force-500'`，携带完整原 HTML
- **预期**：
  - HTTP 200，`success=true`
  - `data.remixFallback=true`
  - `data.gameHtml === originalGameHtml`
  - `data.warning` 含「保留原游戏」
  - `data.remixMode='fallback'`

### UAT-3.3-API-06 无模型保留原游戏

- **前置**：启动一个不带任何模型环境变量的后端实例（端口 4001）
- **请求**：Remix 请求
- **预期**：`remixFallback=true`，`gameHtml` 等于原 HTML，不是随机 Mock。

### UAT-3.3-API-07 非 Remix 生成回归

- **请求**：普通 `{ userPrompt, templateId }`
- **预期**：
  - 不含 `remixMode/remixAudit/remixFallback`
  - Prompt 不含 Remix 专用规则
  - `max_tokens=8192`
  - Mock/正常逻辑与 V3.2 一致

### UAT-3.3-API-08 解析兼容

- **请求**：`modelConfig.model='remix-plain'`
- **预期**：纯 HTML 返回被正确解析，`remixAudit` 正常生成。

### UAT-3.3-API-09 审计识别未保留

- **请求**：`modelConfig.model='remix-no-score'`
- **预期**：`remixAudit.scorePreserved=false`、`preserved=false`，但结果仍返回（不拦截）。

### UAT-3.3-API-10 安全

- **检查**：
  - 响应不回显 API Key
  - 服务端日志不出现完整源码
  - 原 HTML 中的 `</game_source>` 不会破坏 Prompt 结构（单元测试覆盖）

---

## 6. Vercel 产物对等验收

执行：

```bash
npx esbuild api/generate.ts --bundle --platform=node --format=esm --outdir=temp/v3.3/esbuild-check
node temp/v3.3/api-vercel-uat.mjs
```

### UAT-3.3-VERCEL-01 打包

- **预期**：esbuild 成功，生成 `temp/v3.3/esbuild-check/generate.js`。

### UAT-3.3-VERCEL-02 完整源码 Remix

- **预期**：与 API-01 相同的响应字段与审计结果。

### UAT-3.3-VERCEL-03 失败保留原游戏

- **预期**：与 API-05 一致。

### UAT-3.3-VERCEL-04 普通生成回归

- **预期**：与 V3.2 行为一致，无 Remix 字段。

### UAT-3.3-VERCEL-05 源码预算

- **预期**：`outline` 模式与本地一致。

---

## 7. 前端 UI 验收

执行：`node temp/v3.3/ui-remix-uat.mjs`

### UAT-3.3-UI-01 Remix 弹窗信息

- **步骤**：种子一个作品 → 打开 `/play/:id` → 点击「🔄 Remix」
- **预期**：
  - 显示「基于《标题》改编」
  - 显示「会保留：…」标签（至少包含点击/得分）
  - 显示「只改你要求的部分」说明
  - 显示快捷想法 chips

### UAT-3.3-UI-02 完整源码透传

- **步骤**：输入改编要求 → 确认
- **预期**：
  - 跳转 `/create?remix=1` 并自动生成
  - 测试桩 `/last-request` 中的 user Prompt 含完整原 HTML（长度 > 300）
  - 请求含 `originalTitle/originalUserPrompt/templateId`

### UAT-3.3-UI-03 生成成功与元数据

- **步骤**：等待生成完成
- **预期**：
  - 跳转新作品播放页
  - localStorage 新作品含 `remixFrom/remixInstruction/remixFromTitle/remixMode='full'/remixProfile/remixAudit`
  - `remixAudit.preserved=true`

### UAT-3.3-UI-04 播放页来源展示

- **预期**：顶部显示「改编自《原标题》」与「已保留原玩法」。

### UAT-3.3-UI-05 作品列表来源展示

- **步骤**：进入 `/gallery`
- **预期**：
  - 新作品卡片显示「改编自 原标题」
  - 删除源作品后仍显示来源标题（使用 `remixFromTitle`）
  - 显示「🧬 保留原玩法」标签

### UAT-3.3-UI-06 失败回退

- **步骤**：将模型切换为 `remix-force-500` 的自定义模型，再次 Remix
- **预期**：
  - 弹出提示「已保留原游戏」
  - 回到原作品
  - 作品数量不变

### UAT-3.3-UI-07 旧客户端兼容

- **步骤**：手工构造只含 `originalGameHtmlPreview` 的 Remix 上下文
- **预期**：生成流程可用，`remixMode='preview'`。

### UAT-3.3-UI-08 移动端布局

- **步骤**：Chrome 375×812 视口打开 Remix 弹窗
- **预期**：弹窗不溢出、按钮可点击、文案完整。

---

## 8. 真实模型验收

执行：`node temp/v3.3/real-remix-check.mjs`（使用根目录 `.env`，真实模型）

### UAT-3.3-REAL-01 真实 Remix

- **步骤**：用一个小型 DOM 游戏（点击、得分、胜负、viewport）发起真实模型 Remix，指令为「把目标换成宝石，并加一个会扣分的炸弹」
- **预期**：
  - 返回 HTTP 200、`success=true`
  - `gameHtml` 长度合理（非空、含 `<!DOCTYPE`/`<html`）
  - `remixAudit.renderPreserved=true`
  - `remixAudit.interactionsPreserved=true`
  - `remixAudit.scorePreserved=true`
  - `remixAudit.preserved=true`
  - `remixAudit.changed=true`
  - 标题仍保留原游戏标题（或按指令合理微调）

### UAT-3.3-REAL-02 真实 Remix 可玩性

- **步骤**：将返回 HTML 写入临时文件并在 Chrome 中打开/iframe 运行
- **预期**：无 JS 报错，得分元素存在，点击可得分。

### UAT-3.3-REAL-03 与普通生成对比

- **步骤**：同一原游戏，普通生成一次 vs Remix 一次
- **预期**：普通生成与原游戏结构无关；Remix 保留原渲染方式、交互、得分与胜负。该用例用于人工观察，不强制自动断言。

---

## 9. 线上 Vercel 验收

### UAT-3.3-PROD-01 部署成功

- **步骤**：`git push` 后等待 Vercel 部署完成，访问 `https://www.boxaikids.top/`
- **预期**：HTTP 200，页面资源为最新构建。

### UAT-3.3-PROD-02 线上 API Remix

- **步骤**：执行 `node temp/v3.3/vercel-remix-check.mjs`（携带小型原游戏，使用默认模型）
- **预期**：
  - HTTP 200，`success=true`
  - `remixMode` 为 `full`
  - `remixAudit` 存在
  - `gameHtml` 可运行

### UAT-3.3-PROD-03 线上 UI Remix

- **步骤**：Chrome 打开线上站点，种子一个作品，执行 Remix
- **预期**：
  - 弹窗展示原游戏信息
  - 生成完成并进入播放页
  - 显示「改编自」与「已保留原玩法」

### UAT-3.3-PROD-04 线上普通生成

- **步骤**：线上普通创作一次
- **预期**：与 V3.2 行为一致，正常生成/降级。

---

## 10. 回归验收

### UAT-3.3-REG-01 首页模型选择

- **预期**：模型选择器仍可用，选择写入 sessionStorage。

### UAT-3.3-REG-02 普通创作

- **预期**：模板选择、语音/文字输入、生成、保存、跳转播放均正常。

### UAT-3.3-REG-03 作品回放/删除

- **预期**：iframe 可玩，删除后列表更新。

### UAT-3.3-REG-04 模型配置

- **预期**：设置 → 模型配置（家长验证）增删改测正常。

### UAT-3.3-REG-05 旧作品兼容

- **预期**：无 Remix 字段的旧作品正常打开、游玩、删除。

---

## 11. 边界与异常场景

| 场景 | 预期 |
|------|------|
| `originalGameHtml` 为空字符串 | 进入 `none` 或 `preview`，不报 500 |
| `originalGameHtml` 非字符串（对象/数组） | 忽略，不报 500 |
| 源码含 `</game_source>` | 被移除/转义，Prompt 结构完整 |
| 源码含恶意 `<script>` | 仅作为数据；生成结果仍在 sandbox iframe 运行 |
| 改编指令为空 | 沿用 V3.2 校验（400 或按 userPrompt 处理），不崩溃 |
| 改编指令超长 | 截断到合理长度（≤ 2,000 字符） |
| 模型返回空内容 | 解析失败 → 保留原游戏（有源码时） |
| 模型返回截断 HTML | 现有解析器兜底；有 `<!DOCTYPE` 时仍可用 |
| 原 HTML 200,000+ 字符 | 截断后进入 `outline`，请求不失败 |
| 审计输出解析异常 | 返回 `remixAudit=null`，不影响游戏 |
| 源作品已删除 | 播放页/列表使用 `remixFromTitle` 展示 |

---

## 12. BUG 修复确认表

| BUG ID | 描述 | 根因 | 修复 | 复测结果 |
|--------|------|------|------|----------|
| BUG-3.3-01 | `REMIX_SOURCE_MAX_CHARS` / `REMIX_MAX_TOKENS` 未设置时取到最小值 | `Number('') === 0` 被当作合法数字并 clamp 到下限 | 先判断空字符串再转数字 | 单元 37/37 通过 |
| BUG-3.3-02 | 普通生成响应多出 `remixAudit: null` | 响应无条件写入 `remixAudit ?? null` | 仅在 Remix 且审计存在时写入 | API-07b / VERCEL-05b 通过 |
| BUG-3.3-03 | 旧客户端仅 preview 时 `remixMode=none` | Create 总是用完整 HTML 派生 preview | 优先使用 context 中的 `originalGameHtmlPreview` | UI-09b 通过 |
| BUG-3.3-04 | 纯 HTML 输出测试被误判为上游非法 JSON | 测试桩把 HTML 直接作为 HTTP body 返回 | 测试桩改为 Chat Completions 正常包装 | API-08a / VERCEL-06a 通过 |

---

## 13. 附：验收流程与通过标准

### 13.1 执行顺序

1. 静态检查与构建
2. 单元测试
3. 启动测试桩与本地后端
4. 本地 API 验收
5. Vercel 产物对等验收
6. 启动前端，UI 自动化验收
7. 真实模型验收
8. 提交 GitHub，等待 Vercel 部署
9. 线上 API + UI 验收
10. 汇总测试报告到 `temp/v3.3/uat-test-report-YYYY-MM-DD.md`

### 13.2 通过标准

- P0 用例 100% 通过；
- P1 用例 100% 通过（或经确认的合理偏差）；
- P2 用例不阻塞发布；
- 构建、真实模型、线上 Vercel 三项必须通过；
- 所有失败项需修复后复测，不能以「已知问题」带病交付。

### 13.3 验收失败处理

1. 记录失败用例、实际结果、日志/截图。
2. 定位根因，补充/修正自动化用例。
3. 修复后重跑相关用例与回归用例。
4. 若需求本身需要调整，同步更新 `docs/design-v3.3.md` 与本 UAT 文档。
