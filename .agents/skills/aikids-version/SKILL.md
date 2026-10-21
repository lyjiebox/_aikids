---
name: aikids-version
version: 1.0.0
description: "aikids 项目标准版本开发模式：按版本号读取/更新 Proposal，生成 Design/UAT，直接开发、测试、本地部署、提交 GitHub 并验证 Vercel Web。当用户要求“迭代 aikids 到 vX.Y”“按标准模式开发某版本”“按 proposal 交付 vX.Y”，或只给版本号要求开发交付时使用。"
metadata:
  requires:
    bins: ["node", "npm", "git"]
---

# aikids 标准版本开发模式

## 输入

- **必填**：版本号，例如 `v3.4`。
- **可选**：一句话版本描述。

判定：

- 给了描述：以描述为准；若 `docs/proposal.md` 没有该版本或与描述冲突，先更新 proposal。
- 没给描述：读 `docs/proposal.md` 中该版本的范围；范围清晰就直接执行，不追问。
- proposal 也没有该版本，或范围有歧义：只问一个最关键的问题（“这个版本要解决什么？”），得到答案后继续。

## 当前阶段约束（2026-10）

- 默认服务“家庭自用 + 亲友圈”；V3.x/V4.x 不引入账号、云端、社区、商业化。
- 除非目标版本明确要求，否则不要新增登录、数据库、支付、小程序、原生 App。
- 安全/隐私/审核只在版本范围内做最小实现；不要提前平台化。
- 数据仍以 localStorage 为主；如需改存储，先确认是否属于 V3.6/V5.1。

## 不可违反的约束

1. 先读 `docs/proposal.md`，再读该版本相关的 design/uat（若存在）。
2. 文档规范：`docs/design-vX.Y.md`、`docs/uat-vX.Y.md`；临时产物放 `temp/vX.Y/`。
3. 不提交 `.env`、密钥、token；不 force push；不覆盖用户未提交的改动。
4. 不扩大范围：不引入未要求的新依赖/新架构；保持 `api/` 与 `server/` 行为一致。
5. 先本地构建、类型检查、UAT，再 commit；commit 并部署后再验证 Vercel。
6. 如果 Vercel 无法访问或没有权限，如实报告，不要假装验证过。

## 流程

### Phase 0 — Preflight

- `git status --short`、`git branch --show-current`、`git log -1 --oneline`
- 读 `docs/proposal.md` 的版本段，确认版本号、范围、验收标准
- 读 `package.json` 版本；确认 design/uat 是新建还是更新
- 若 proposal 需要更新：先改 proposal（范围/状态/勾选），并展示 diff
- 若工作区有未提交改动：先判断归属；不要擅自 `reset` / `checkout`

### Phase 1 — Design + UAT

- 写 `docs/design-vX.Y.md`：目标、范围/非范围、数据模型/API 变更、UI/交互、错误与降级、测试计划、发布/回滚
- 写 `docs/uat-vX.Y.md`：环境、P0/P1/P2 用例、通过标准、证据要求
- 小版本可以精简，但必须可测试、无歧义
- 若 design/uat 已存在：在原文件上更新，保留历史结论；不要直接覆盖
- 若版本只改文档/配置，也要有 design/uat，或在文档中明确说明为何不需要

### Phase 2 — Implement

- 按 design 实现；最小 diff；同步更新类型、测试、文档
- 涉及 AI 调用时，保持 `api/` 与 `server/` 的契约一致；优先复用现有 model/remix 服务
- 不删除旧兼容逻辑，除非 design 明确要求

### Phase 3 — Local verify（每次必跑）

- 首次或依赖变化：`npm ci` + `npm ci --prefix server`
- **本地 CI 门禁**：`npm run ci`
  - 等价于 GitHub Actions 的 verify job：typecheck → build → server build → unit/integration/contract → `check:inline` → `check:docs` → `smoke:preview`
  - 任一步失败：先修复，再重跑；不允许跳过
- **核心回归**：`npm test`（`tests/unit` + `tests/integration` + `tests/contract`）
- **冒烟**：`npm run smoke:preview`（dist 构建产物）
- **手动 UAT**：启动本地后端 + 前端，按 UAT 逐项验证；无真实 Key 时用 stub/mock，并在报告中注明
- 边界：空输入、超长输入、模型失败、超时、旧数据兼容、移动端
- 测试报告写入 `temp/vX.Y/uat-test-report-YYYY-MM-DD.md`，包含命令、结果、证据、未覆盖项

> 纯文档/配置版本可降级为 `npm run check:docs` + `npm run build`，但必须在报告中说明为什么没有跑完整 CI。

### 质量门禁与职责

| 门禁 | 命令/位置 | 何时跑 | 失败处理 |
|---|---|---|---|
| 本地 CI | `npm run ci` | 每次版本开发，commit 前 | 修复后重跑 |
| 核心回归 | `npm test` | 每次版本开发 | 修复或说明 |
| 构建冒烟 | `npm run smoke:preview` | 每次版本开发 | 修复构建/路由 |
| 远端 CI | `.github/workflows/ci.yml` | push 后 | `gh run list` / Actions 页面；红了不进入 Vercel 验收 |
| 生产冒烟 | `curl` / `web_fetch` 生产 URL | Vercel 部署后 | 记录状态；失败则回滚/修复 |

> 注意：`skill` 本身不能代替 GitHub Actions。它负责在本地执行等价命令，并在 push 后检查远端 CI 状态。

### Phase 4 — Git

- `git diff` 自查；确认无密钥、大文件、临时产物
- `git add` 相关文件；commit message 用 `feat(vX.Y): ...` / `fix(vX.Y): ...` / `docs(vX.Y): ...`
- `git push origin main`（除非用户指定分支）；不 force push
- push 后检查远端 CI：
  - 有 `gh`：`gh run list --limit 1`，失败时 `gh run view <run-id> --log-failed`
  - 无 `gh`：在 GitHub Actions 页面确认 `CI / verify` 为绿
- 记录 commit hash 与 CI 结果

### Phase 5 — Vercel

- 先确认 Phase 4 的远端 CI 为绿；CI 红了不要进入生产验收
- 等待 Vercel 部署完成；确认 Production URL 与 commit 对应
- 生产冒烟（至少）：
  ```bash
  PROD_URL=https://boxaikids.top
  curl -sS -o /dev/null -w '%{http_code}\n' "$PROD_URL/"
  curl -sS "$PROD_URL/api/models" | head -c 500
  ```
- 验证：首页、生成、Remix、模型选择/配置（若涉及）、`/api/*` 健康
- 若无 `vercel` CLI：用 `web_fetch` 或 `curl` 检查生产首页与 `/api/*`，用 GitHub commit 时间对应部署
- 验证清单：首页 200、静态资源加载、`/api/models`（若涉及）、生成/Remix（有 Key 时）、无 500
- 若失败：查 build logs / function logs / env；修复后重新提交；仍失败则报告具体错误
- 记录 URL、commit、验证时间、CI 结果、未覆盖项

### Phase 6 — Close

- 更新 proposal 的版本总览表状态（✅/🚧/⬜）与对应复选框
- 更新 `CHANGELOG.md`（若存在）与 `package.json` 版本（如项目惯例）
- 如用户同意，打 tag（如 `vX.Y.0`）
- 输出交付报告（模板见下）

## 判定规则

| 情况 | 动作 |
|---|---|
| proposal 已有清晰范围 | 直接执行，不问描述 |
| 用户给了描述，proposal 无此版本 | 先更新 proposal，再生成 design/uat |
| 用户只给版本号，proposal 无此版本 | 问一个最关键问题：这个版本要解决什么？ |
| 设计/实现与 proposal 冲突 | 停下来说明冲突，先确认再改 |
| 需要删除数据 / force push / 改生产配置 | 先确认 |
| 缺少 API Key / Vercel 权限 | 用 mock/stub 完成本地验证；Vercel 项标注“未验证”并说明原因 |
| 测试失败 | 先修复；不能修复则报告失败项，不提交“假通过” |
| 只改文档/配置 | 可跳过代码实现与本地服务测试，但仍需 build/链接检查 |

## 常见失败与处理

- **Vercel 500**：检查 Serverless 函数是否内联依赖、env 是否缺失、`maxDuration` 是否足够。
- **本地 API 502/404**：检查 `server/` 是否在 4000 端口、Vite proxy、CORS。
- **类型错误**：先 `cd server && npx tsc -p . --noEmit`，再改代码。
- **测试无 Key**：用 `temp/vX.Y/stub-*.mjs` 或 Mock；报告中注明“未验证真实模型”。
- **Git push 被拒**：先 `git pull --rebase`，不要 force push。
- **Vercel 未自动部署**：确认 GitHub 集成是否启用；必要时在 Vercel Dashboard 手动 Redeploy，并记录。

## 每次调用都会跑 CI 吗？

默认会。版本开发的 Phase 3 强制执行 `npm run ci`；Phase 4 push 后检查远端 CI；Phase 5 做生产冒烟。只有纯文档/配置版本允许降级为 `check:docs + build`，且必须在报告中说明。

`skill` 不能直接执行 GitHub Actions；它做两件事：

1. 在本地跑与 CI 等价的命令；
2. push 后检查远端 CI 结果。

## CI / 核心回归 / 冒烟 分别是什么？

| 名称 | 覆盖 | 命令 |
|---|---|---|
| CI | 类型、构建、测试、inline、docs、preview smoke | `npm run ci` |
| 核心回归 | 生成、Remix、存储、模型工具、生产契约 | `npm test` |
| 构建冒烟 | dist 首页、SPA 路由、JS 资源、404 行为 | `npm run smoke:preview` |
| 生产冒烟 | Vercel 首页、API、生成/Remix（有 Key） | `curl` / `web_fetch` |

## 交付报告模板

```text
版本：vX.Y
状态：完成 / 部分完成 / 阻塞
变更：...
文档：docs/design-vX.Y.md / docs/uat-vX.Y.md
测试：npm run ci（typecheck/build/test/inline/docs/smoke）
CI：本地通过 / 远端 <run-id> 绿
证据：temp/vX.Y/uat-test-report-...
提交：<hash> <message>
Vercel：<url> / <commit> / 已验证项
未覆盖/风险：...
下一步：...
```

## 项目速查

- 前端：`npm run dev`（:3000）、`npm run build`
- 本地后端：`cd server && npm run dev`（:4000）
- 全量门禁：`npm run ci`（typecheck + build + server build + tests + inline + docs + preview smoke）
- 类型检查：`npm run typecheck`（api + src + server）
- 核心回归：`npm test`（`tests/unit` + `tests/integration` + `tests/contract`）
- 构建冒烟：`npm run smoke:preview`
- 远端 CI：`.github/workflows/ci.yml`
- 测试资产：`tests/unit`、`tests/integration`、`tests/contract`、`tests/support`
- 辅助脚本：`scripts/run-tests.mjs`、`scripts/smoke-preview.mjs`、`scripts/check-docs.mjs`、`scripts/inline-api-model.mjs`
- 发布：`CHANGELOG.md`、`vX.Y.0` tag
- 生产：Vercel，`api/` Serverless；域名以 README/Vercel 为准（当前 `boxaikids.top`）
- 环境变量：`VOLCENGINE_API_KEY`、`DOUBAO_ENDPOINT_ID`、`DEEPSEEK_ENDPOINT_ID`、`GAME_MODEL`
- 模型接口：火山方舟 Chat Completions；本地可用 `tests/support/stub-model-server.mjs`
- 文档：`docs/proposal.md`、`docs/design-vX.Y.md`、`docs/uat-vX.Y.md`
- 临时：`temp/vX.Y/`；历史测试脚本已迁入 `tests/`，不要再引用已删除的 `temp/*.mjs`
