# Changelog

本项目遵循「一个版本一个 tag」的发布方式。版本号与 `package.json`、`server/package.json` 保持一致。

## [3.4.0] - 2026-10-20

工程收敛版本：不改变任何用户可见需求，把项目变成可类型检查、可回归、可发布的工程。

### Added

- 新增根 `tsconfig.json` 与 `npm run typecheck`，覆盖 `api/**/*.ts`、`src/**/*.{ts,tsx}` 与 `server/src/**/*.ts`。
- 新增 GitHub Actions CI（`.github/workflows/ci.yml`）：typecheck → build → 核心回归 → 内联检查 → 文档检查 → 构建产物冒烟。
- 新增 `tests/` 可重复测试资产：
  - `tests/unit/storage.test.mjs`：作品、设置、自定义模型的容错与往返（存储路径）。
  - `tests/unit/model-utils.test.mjs`：模型校验、脱敏、展示与请求参数。
  - `tests/unit/remix-core.test.mjs`：Remix 档案、Prompt、预算、审计与前后端一致性。
  - `tests/integration/generate.test.mjs`：生成路径（真实 Hono 路由 + 本地测试桩）。
  - `tests/integration/remix.test.mjs`：Remix full / outline / preview / fallback / 审计 / 无模型。
  - `tests/contract/production-api.test.mjs`：直接调用 `api/generate.ts`，锁定生产函数契约。
  - `tests/support/*`：进程内 OpenAI 兼容测试桩、后端生命周期、样本游戏。
- 新增 `scripts/run-tests.mjs`、`scripts/check-docs.mjs`、`scripts/smoke-preview.mjs`。
- 新增 `scripts/inline-api-model.mjs --check`，防止 `api/_model.ts` 与三个自包含函数漂移。
- 新增 `CHANGELOG.md` 与本发布流程。

### Changed

- 根 `package.json` / `server/package.json` 版本号统一为 `3.4.0`。
- 根 `package.json` 新增 `typecheck`、`test`、`check:inline`、`check:docs`、`smoke:preview`、`ci` 脚本。
- `src/services/api.js` 补充 JSDoc 类型（生成请求/响应），`src/pages/Create.tsx` 补充本地状态与 Remix 上下文类型；运行时行为不变。
- `README.md`、`DEPLOY.md` 更新目录结构、测试命令与本地开发步骤。
- `docs/proposal.md` 标记 V3.4 完成，并修正 V3.3 遗留的版本归属（后处理增强引擎归 V4.0）。
- `docs/design-v3.3.md` 末尾的后续版本说明从 V3.4 修正为 V4.0。

### Removed

- 删除已废弃的 `client-taro-broken/`（早期 Taro 方案残留，不参与构建，git 历史可恢复）。
- 删除根目录临时文件 `test-game.html`。
- 删除已迁移到 `tests/` 的 `temp/v3.2/*.mjs`、`temp/v3.3/*.mjs` 重复测试脚本；历史 UAT 报告与截图保留。

### Verified

- `npm run typecheck`：通过。
- `npm run build` / `npm --prefix server run build`：通过。
- `npm test`：单元 + 集成 + 契约全部通过。
- `npm run check:inline`：`api/_model.ts` 与三个自包含函数一致。
- `npm run check:docs`：版本号、CHANGELOG、design/uat、README、CI 步骤一致。
- `npm run smoke:preview`：构建产物首页、`/create`、JS 资源与 SPA fallback 正常。
- 不包含：`api/generate.ts` 拆分、存储层重构、UI 重构（按要求留给 V3.5 / V3.6 / V4.x）。

## [3.3.0] - 2026-10-19

- Remix 透传原游戏完整 HTML（预算 32,000 字符）与结构档案。
- Remix 专用 System Prompt：保留原玩法、计分、操作与美术风格。
- 源码超预算进入 `outline` 摘要模式；旧客户端仅 preview 时进入 `preview` 模式。
- 生成后审计 `remixMode / remixProfile / remixAudit`；模型不可用时保留原游戏（`remixFallback`）。
- 前端 Remix 弹窗展示保留标签，Play / Gallery 展示改编来源与审计结果。

## [3.2.1] - 2026-10-19

- 修复 Vercel 函数 500：内联模型核心，避免 `api/` 跨文件相对导入。

## [3.2.0] - 2026-10-19

- 首页模型选择；设置内模型添加、编辑、删除、测试。
- 自定义模型保存在浏览器 `localStorage`，生成/测试随请求提交。
- 自定义接口地址白名单（SSRF 防护）、API Key 不回显、iframe 沙箱收紧。
- 高级配置入口预留（提示词优化 / 最长提示词 / 最长等待时间）。

## [3.1.0] - 2026-06-30

- System Prompt 注入游戏设计规则：3 种交互、得分、胜负、默认收集类。

## [2.0.0] - 2026-06-15

- 新增 Remix、作品来源追踪与 Remix 计数。

## [1.0.0] - 2026-06-04

- 首个可用版本：模板选择、语音/文字输入、AI 生成游戏、本地作品库、家长设置。
