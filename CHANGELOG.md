# Changelog

本项目遵循「一个版本一个 tag」的发布方式。版本号与 `package.json`、`server/package.json` 保持一致。

## [3.6.0] - 2026-10-23

扩展性缝版本：不改变主流程，把存储、数据模型、配置、事件四条边界做成可替换的缝，并为 V5.1 云端准备迁移脚本。唯一新增用户入口是 Settings 内由家长验证保护的「数据备份 / 诊断日志」。

### Added

- 存储 schema 与迁移：`src/services/storage-schema.js` 提供规范化、`schemaVersion`、UUID、导出信封、导入解析、合并/覆盖、云端迁移纯函数。
- 数据备份：Settings 支持导出全部数据（作品 / 设置 / 自定义模型，含 API Key）与导入备份；支持合并（默认）与覆盖（二次确认），并显示新增/跳过摘要。
- 本地 telemetry：`src/services/telemetry.js` 记录 `generate / play / remix / failure` 四类事件，最多 200 条，只存 `localStorage`，支持手动导出与清空；不记录 Prompt、HTML、API Key。
- 配置外置：新增 `shared/config/{templates,prompts,models}.ts` 作为模板、Prompt、内置模型清单与前端模型预设的单一来源。
- V5.1 迁移：`buildCloudMigration` 纯函数 + `npm run migrate:storage` CLI，输出保留本地 ID、补齐 `ownerId/visibility`、剔除 API Key 的迁移 JSON。
- 新增单元测试：`storage-schema`、`telemetry`、`config`，并登记进 `check:docs`。

### Changed

- 新作品 ID 改为 UUID v4（`createWorkId`）；**旧作品保留原 ID**，加载时只补 `schemaVersion=1`、`ownerId=null`、`visibility=private`。
- `src/services/storage.js` 的读写统一经过 schema 规范化；作品、设置、自定义模型的存储键不变。
- `src/context/AppContext.jsx` 新增 `IMPORT_SNAPSHOT` / `importSnapshot`，导入仍由既有保存 effect 落盘。
- `settings` 页面在「AI 模型配置」与「清空所有作品」之间新增「数据备份 / 诊断日志」区块。
- `src/pages/Create.tsx`、`src/pages/Play.jsx` 接入本地 telemetry；`src/services/api.js` 的错误对象附带 `code/status`。
- 服务端 `prompt.ts`、`remix.ts`、`model.ts` 改为读取 `shared/config/*`，旧导出名保留。
- `server/tsconfig.json` 的 `rootDir` 放宽到项目根以编译 `shared/`；构建产物路径变为 `dist/server/src/index.js`，`npm start` 同步更新。
- 版本号更新为 `3.6.0`（根 / server / lock）。

### Security

- 按产品决策，备份文件**包含自定义模型 API Key**；Settings 显著提示仅保存在自己设备，下载不经过服务端，导出内容不写日志。
- 导入只做 JSON 解析与字段校验，不执行内容；游戏 HTML 仍在 `sandbox="allow-scripts"` iframe 中运行。
- Telemetry 不含 Prompt 全文、游戏 HTML、API Key、完整接口地址；消息截断并脱敏。
- 云端迁移产物显式剔除 `apiKey`。

### Verified

- `npm run typecheck` / `npm run build` / `npm run build:server` / `npm run build:api`：通过。
- `npm test`：90 项全部通过（新增 storage-schema / telemetry / config 用例）。
- `npm run check:inline`：三个 `api/` 生成物与源码一致。
- `npm run check:docs`：版本、CHANGELOG、design/uat、配置与测试资产一致。
- `npm run smoke:preview`：构建产物首页/SPA 路由正常。
- 迁移 CLI：样例备份 2 个旧作品保留原 ID，输出无 `apiKey`，非法 JSON 退出码 1。
- 远端 CI / 生产冒烟结果见 `docs/uat-v3.6.md` 执行记录。

## [3.5.0] - 2026-10-21

API 拆分、类型与性能基线版本：不改变用户可见需求，把生成链路拆成可维护的分层，消除 `api/` 与 `server/` 双实现，并建立可复跑的耗时/成功率/token 基线。

### Added

- 新增生成链路分层：
  - `server/src/services/prompt.ts`：System Prompt、模板提示、输出上限常量。
  - `server/src/services/parse.ts`：五种模型输出格式解析 + `GameParseError`。
  - `server/src/services/mock.ts`：本地兜底游戏（唯一实现）。
  - `server/src/services/generate.ts`：请求校验、Remix 准备、模型调用、解析、降级、指标编排。
  - `server/src/services/metrics.ts`：`[metrics]` 事件、token 估算、nearest-rank 分位数、成本换算。
  - `server/src/errors.ts`：`ModelConfigError` / `ModelCallError` / `GameParseError`。
- 新增 `api-src/{generate,models-index,models-test}.ts` 作为 Vercel 入口源码；`api/` 改由 `scripts/build-api.mjs`（esbuild）生成。
- 新增 `scripts/bench-generate.mjs` 与 `npm run bench`：固定 Prompt 集，输出 p50/p90、成功率、降级率、token 与可选成本；支持 `--real` 调真实模型。
- 新增 `tests/contract/parity.test.mjs`：同一请求分别打 `server/` 与 `api/`，比较状态码、错误码、字段与关键内容。
- 新增 `tests/unit/generate-service.test.mjs`、`tests/unit/metrics.test.mjs`。
- 错误响应新增稳定 `code` 字段（如 `EMPTY_PROMPT`、`INVALID_JSON`、`MODEL_NOT_FOUND`）。
- `callChatCompletion` 提取上游 `usage`，指标记录真实 token；缺失时使用估算并标注。

### Changed

- `server/src/types/index.ts` 成为契约类型与错误码的唯一来源；`services/model.ts`、`services/remix.ts` 改为导入并在原路径 re-export，消除类型漂移。
- `server/src/routes/{generate,models}.ts` 改为薄 HTTP 适配层；业务逻辑统一在 services。
- `server/src/services/ai.ts` 改为兼容导出层，保留 V3.4 的导入路径。
- Remix 判定统一为 `remixFrom + 非空 remixInstruction`；只有 `remixFrom` 时按普通生成处理。
- 模型输出无法解析时统一抛 `OUTPUT_PARSE_FAILED` 并降级（普通生成 → 本地模板，Remix → 保留原游戏），不再出现 `api/` 500 与 `server/` 默认游戏的行为差异。
- 根 `package.json` / `server/package.json` 版本号更新为 `3.5.0`；Hono 统一到 `^4.13.13`；新增 `esbuild` devDependency。
- CI 步骤名称改为「Check generated API functions」；`check:inline` 的语义变为「生成物与源码逐字节一致」。
- `README.md`、`DEPLOY.md`、`.env.example`、`docs/proposal.md` 更新版本、分层结构、生成流程与基线命令。

### Removed

- 删除 `api/_model.ts`（模型实现已在 `server/src/services/model.ts`）。
- 删除 `scripts/inline-api-model.mjs`（由 `scripts/build-api.mjs` 取代）。

### Verified

- `npm run typecheck`：通过。
- `npm run build` / `npm run build:server`：通过。
- `npm test`：单元 + 集成 + 生产函数契约 + 双端一致性全部通过。
- `npm run check:inline`：三个 `api/` 生成物与源码一致。
- `npm run check:docs`：版本、CHANGELOG、design/uat、生成物 banner、测试资产一致。
- `npm run smoke:preview`：构建产物首页/SPA 路由正常。
- 性能基线：
  - 桩模式：24 次，成功率 100%，p50 3.62ms / p90 5.81ms（`temp/v3.5/baseline-stub-2026-10-21.md`）。
  - 真实模型：8 次，7 次真实生成成功（87.5%），p50 67.5s / p90 180.2s；doubao 一次上游连接失败已降级并记录（`temp/v3.5/baseline-real-2026-10-21.md`）。
  - 成本：未配置单价，基线只记录 token（成功样本优先使用上游 usage）。
- 远端 CI：GitHub Actions run `39612404376`（`bf22c3c`）success。
- 生产冒烟（`https://www.boxaikids.top`）：首页 200、`/api/models` 200、生成 200（`engine=volcengine`，74.1s）、Remix 200（`remixMode=full`，审计通过）、空 Prompt/非法 JSON 返回 400 与稳定错误码。

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
- `docs/design-v3.2/3.3.md`、`docs/uat-v3.2/3.3.md` 增加测试脚本迁移说明，避免读者继续引用已删除的 `temp/*.mjs`。

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
