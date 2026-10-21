# UAT: AI 儿童创意游戏平台 V3.5（API 拆分、类型与性能基线）

> 版本：v3.5
> 对应文档：`docs/proposal.md`、`docs/design-v3.5.md`
> 编写日期：2026-10-21
> 验收方式：类型检查 + 构建 + 单元/集成/契约测试 + 双端一致性 + 生成物一致性 + 构建冒烟 + 性能基线 + 生产冒烟
> 说明：本版本不改变用户可见需求；UAT 以「分层是否生效、双端是否一致、基线是否可用」为主，UI 只做不回归抽查。

---

## 目录

1. [测试环境](#1-测试环境)
2. [验收准则总表](#2-验收准则总表)
3. [分层与生成物](#3-分层与生成物)
4. [类型与错误码](#4-类型与错误码)
5. [单元测试](#5-单元测试)
6. [集成测试](#6-集成测试)
7. [双端一致性契约](#7-双端一致性契约)
8. [性能与成本基线](#8-性能与成本基线)
9. [CI 与构建冒烟](#9-ci-与构建冒烟)
10. [生产冒烟](#10-生产冒烟)
11. [回归抽查](#11-回归抽查)
12. [BUG 修复确认表](#12-bug-修复确认表)
13. [执行记录](#13-执行记录)

---

## 1. 测试环境

| 项目 | 版本 |
|------|------|
| Node.js | >= 20（CI 20，本地 v24.18.0） |
| npm | 10+（本地 11.16.0） |
| 前端 | Vite 5 + React 18 |
| 后端 | Hono（本地 `server/` + Vercel `api/` 生成物） |
| 打包 | esbuild 0.21.x（生成 `api/`） |
| 测试 | Node 内置 `node:test` + `tsx` |
| CI | GitHub Actions `ubuntu-latest` |
| 浏览器 | Chrome 最新稳定版（抽查） |

测试资产：

| 资产 | 路径 | 说明 |
|------|------|------|
| 测试桩 | `tests/support/stub-model-server.mjs` | 进程内 OpenAI 兼容，返回固定 usage |
| 后端生命周期 | `tests/support/backend.mjs` | 动态端口启动 `server/`，可读日志 |
| 样本游戏 | `tests/support/fixtures.mjs` | DOM / Canvas / 超长源码 |
| 双端一致性 | `tests/contract/parity.test.mjs` | 同请求打 `server/` 与 `api/` |
| 基线脚本 | `scripts/bench-generate.mjs` | 桩 / 真实模型两种模式 |

前置条件：

```bash
npm ci
npm ci --prefix server
```

自动测试不需要真实 Key；真实模型基线（可选）才需要根目录 `.env`。

---

## 2. 验收准则总表

| ID | 验收项 | 优先级 | 通过标准 |
|----|--------|--------|----------|
| UAT-3.5-01 | 分层落地 | P0 | `api/generate.ts` 为生成物；路由/模型/提示词/解析/审计/编排分层存在且职责单一 |
| UAT-3.5-02 | 生成物自包含 | P0 | `npm run check:inline` 通过；产物无 `../server`、`_model` 相对导入 |
| UAT-3.5-03 | 生成物可重建 | P0 | `npm run build:api` 后 `git diff --exit-code api/` |
| UAT-3.5-04 | 类型收敛 | P0 | 契约类型只在 `server/src/types/index.ts` 定义；`npm run typecheck` 通过 |
| UAT-3.5-05 | 错误码 | P0 | 400/500 响应均含稳定 `code`；双端一致 |
| UAT-3.5-06 | 请求校验 | P0 | 非法 JSON/非对象/空 Prompt/类型不符行为符合设计 |
| UAT-3.5-07 | 解析与降级 | P0 | 五种输出格式可解析；不可解析时降级而非 500 |
| UAT-3.5-08 | 单元测试 | P0 | 指标、校验、token 估算、分位数用例全部通过 |
| UAT-3.5-09 | 集成测试 | P0 | V3.4 的 GEN / REMIX 用例全部通过 |
| UAT-3.5-10 | 双端一致性 | P0 | 普通/Remix/空 Prompt/非法 JSON/非法模型/上游 500 状态码与关键字段完全一致 |
| UAT-3.5-11 | 生产函数契约 | P0 | `production-api.test.mjs` 全部通过 |
| UAT-3.5-12 | 指标可用 | P1 | 每次生成有 `[metrics]` 日志；含耗时/模型/引擎/token/错误码 |
| UAT-3.5-13 | 桩模式基线 | P1 | `npm run bench -- --runs 3` 成功率 100%，输出 p50/p90 与 token |
| UAT-3.5-14 | 多模型基线 | P1 | doubao / deepseek 至少各 1 次真实生成，记录延迟/成功/token；样本量如实标注 |
| UAT-3.5-15 | 本地 CI | P0 | `npm run ci` 退出码 0 |
| UAT-3.5-16 | 文档一致 | P0 | `npm run check:docs` 通过，版本 3.5.0 |
| UAT-3.5-17 | 远端 CI | P0 | push 后 GitHub Actions verify 绿（无权限时如实记录） |
| UAT-3.5-18 | 生产冒烟 | P0 | `boxaikids.top` 首页 200、`/api/models` 正常、生成/Remix 无 500（有 Key 时） |
| UAT-3.5-19 | UI 不回归 | P1 | 首页/创作/Play/Gallery/设置/模型页可打开，控制台无新增错误 |
| UAT-3.5-20 | 发布记录 | P0 | CHANGELOG 3.5.0、tag `v3.5.0`、proposal 状态更新 |

---

## 3. 分层与生成物

### 3.1 UAT-3.5-01 分层静态检查

```bash
wc -l api/generate.ts api-src/*.ts server/src/routes/*.ts server/src/services/{prompt,parse,mock,metrics,generate}.ts
head -3 api/generate.ts
```

通过标准：

- `api/generate.ts` 顶部出现 `AUTO-GENERATED FILE — DO NOT EDIT`；
- `api-src/*.ts` 均 < 40 行，仅创建 Hono 实例与导出；
- `server/src/routes/*.ts` < 120 行，只负责 HTTP 适配；
- `server/src/services/generate.ts` 只做编排，不包含模型调用细节。

### 3.2 UAT-3.5-02 生成物自包含

```bash
npm run check:inline
grep -nE "from ['\"]\.\.?/(server|_model)" api/generate.ts api/models/*.ts
```

预期：

- `check:inline` 输出三个 `ok`；
- `grep` 无输出（产物不含跨目录相对导入）。

### 3.3 UAT-3.5-03 生成物可重建

```bash
npm run build:api
git diff --exit-code -- api/
```

预期：`git diff` 退出码 0，工作区无生成物差异（提交前执行）。

---

## 4. 类型与错误码

### 4.1 UAT-3.5-04 类型收敛

```bash
npm run typecheck
grep -rn "export interface GenerateRequest\|export interface ResolvedModel\|export type RemixSourceMode" server/src api-src
```

预期：

- typecheck 通过；
- 上述类型只在 `server/src/types/index.ts` 命中（service 内为 re-export 或 import）；
- `api-src` 直接使用共享类型，不重复声明。

### 4.2 UAT-3.5-05 错误码

用桩模式或本地后端执行：

| 请求 | 预期状态 | 预期 `code` |
|------|----------|-------------|
| 非法 JSON | 400 | `INVALID_JSON` |
| body 为数组 | 400 | `INVALID_BODY` |
| `userPrompt: "  "` | 400 | `EMPTY_PROMPT` |
| `modelId: "unknown"` | 400 | `MODEL_NOT_FOUND` |
| 自定义模型 `http://evil.example.com` | 400 | `MODEL_CONFIG_INVALID` |
| 未捕获异常（仅测试注入） | 500 | `GENERATION_FAILED` |

自动化覆盖：`tests/integration/generate.test.mjs`、`tests/contract/parity.test.mjs`、`tests/unit/generate-service.test.mjs`。

### 4.3 UAT-3.5-06 请求校验

`tests/unit/generate-service.test.mjs` 覆盖：

- `null` / 数组 / 字符串 body → `INVALID_BODY`；
- 空/纯空白/非字符串 Prompt → `EMPTY_PROMPT`；
- 数字 `modelId`、对象 `templateId` 被丢弃；
- 合法请求保留所有字符串字段；
- 可选字段 `undefined` 不出现在结果中。

---

## 5. 单元测试

### 5.1 UAT-3.5-08

```bash
node --import tsx --test tests/unit/generate-service.test.mjs
node --import tsx --test tests/unit/metrics.test.mjs
```

覆盖：

| 用例 | 断言 |
|------|------|
| METRICS-01 | `percentile([], 50) = 0` |
| METRICS-02 | nearest-rank：`[1,2,3,4]` → p50=2、p90=4 |
| METRICS-03 | 中英混排 token 估算单调且可复现 |
| METRICS-04 | 成本换算：未配置单价返回 `null` |
| METRICS-05 | 指标事件不含 Prompt 全文/API Key |
| METRICS-06 | `emitGenerationMetric` 输出单行 `[metrics] {json}` 且可解析 |
| PARSE-01 | 纯 JSON / ```json``` / ``` ``` / 截断 JSON / 纯 HTML 均可解析 |
| PARSE-02 | 空内容/无 html 抛出 `GameParseError`，code=`OUTPUT_PARSE_FAILED` |
| PARSE-03 | 标题缺失时从 `<title>` 回退 |

---

## 6. 集成测试

### 6.1 UAT-3.5-09

```bash
node --import tsx --test tests/integration/generate.test.mjs
node --import tsx --test tests/integration/remix.test.mjs
```

预期：V3.4 的 17 个 GEN/REMIX 用例全部通过；新增断言：

- 错误响应含 `code`；
- 解析失败（`stub-empty`）普通生成降级 Mock 且 `warning` 含「降级为本地模板」；
- Remix 仅在 `remixFrom + remixInstruction` 同时存在时触发。

### 6.2 重复执行

同一命令连续 3 次，结果一致，无端口占用、无残留进程。

---

## 7. 双端一致性契约

### 7.1 UAT-3.5-10

```bash
node --import tsx --test tests/contract/parity.test.mjs
```

测试流程：

1. 启动测试桩与本地后端；
2. 设置 `VOLCENGINE_BASE_URL` 指向测试桩；
3. `import { POST } from '../../api/generate.ts'`、`import { GET } from '../../api/models/index.ts'`；
4. 同一 body 分别打生产函数与本地后端；
5. 比较状态码、`success`、`code`、`message`、`data` 字段集合、`engine`、`model`、`modelSource`、`remixMode`、`gameHtml`、`title`、`remixAudit`。

| 用例 | 场景 |
|------|------|
| PARITY-01 | 普通生成（custom model） |
| PARITY-02 | Remix full |
| PARITY-03 | 空 Prompt |
| PARITY-04 | 非法 JSON |
| PARITY-05 | 未知 `modelId` |
| PARITY-06 | 上游 500 普通生成降级 |
| PARITY-07 | 上游 500 Remix 保留原游戏 |
| PARITY-08 | `GET /api/models` 目录一致且不回显 Key |

通过标准：全部通过；任何字段差异都视为双端漂移，必须修复后重跑。

---

## 8. 性能与成本基线

### 8.1 UAT-3.5-13 桩模式

```bash
npm run bench -- --runs 3 --out temp/v3.5/baseline-stub-2026-10-21
```

预期：

- 4 个场景 × 3 轮 = 12 次请求；
- 成功率 100%，降级率 0%；
- 输出 `p50Ms`、`p90Ms`、`avgPromptTokens=100`、`avgCompletionTokens=200`（桩固定 usage）；
- 生成 `.json` 与 `.md`。

### 8.2 UAT-3.5-14 真实模型

```bash
npm run bench -- --real --models doubao,deepseek --runs 1 --out temp/v3.5/baseline-real-2026-10-21
```

预期：

- 每个模型至少 1 次普通生成 + 1 次 Remix；
- 记录真实 `totalMs` / `upstreamMs` / `usage`（若上游返回）；
- 成功与失败都写入结果，不隐藏；
- 报告标注「样本量 1，p90 不具统计意义」。

失败处理：若额度不足/网络失败，保留错误记录并在 UAT 报告中注明「未验证真实模型」，不以桩结果冒充。

---

## 9. CI 与构建冒烟

### 9.1 UAT-3.5-15 本地 CI

```bash
npm run ci
```

依次：typecheck → build → build:server → test → check:inline → check:docs → smoke:preview。

### 9.2 UAT-3.5-17 远端 CI

```bash
git push origin main
# 无 gh CLI 时：打开 Actions 页面确认 CI / verify 绿
```

通过标准：verify 绿；红则修复后重推，不进入生产验收。

### 9.3 UAT-3.5-16 文档检查

```bash
npm run check:docs
```

预期：`version=3.5.0`，design/uat 存在，测试文件齐全，生成物 banner 正确。

---

## 10. 生产冒烟

### 10.1 UAT-3.5-18

```bash
PROD_URL=https://boxaikids.top
curl -sS -o /dev/null -w '%{http_code}\n' "$PROD_URL/"
curl -sS "$PROD_URL/api/models" | head -c 500
```

| 检查 | 通过标准 |
|------|----------|
| 首页 | 200，返回 HTML |
| 静态资源 | JS/CSS 200 |
| `/api/models` | 200，`success=true`，含模型目录，不含 Key |
| 生成 | 有真实 Key 时 200、`success=true`、`engine=volcengine`（或额度不足时明确记录） |
| Remix | 有真实 Key 时 200、`remixMode=full`、`remixAudit` 存在 |
| 500 检查 | 上述请求无 500 |

Vercel 部署需与推送 commit 对应；无法确认时记录 Vercel Dashboard 的部署时间与 commit。

---

## 11. 回归抽查

### 11.1 UAT-3.5-19

| 页面 | 检查 |
|------|------|
| `/` | 渲染、模型选择器、模板入口 |
| `/create` | 语音/文字入口、生成流程可发起 |
| `/play/:id` | 作品可打开，iframe 沙箱仍为 `allow-scripts` |
| `/gallery` | 列表、删除、Remix 入口 |
| `/settings` | 家长验证、模型配置入口 |
| `/settings/models` | 内置/自定义模型、测试按钮 |

本版本不改 UI；以「无新增控制台错误、关键入口可达」为准。

### 11.2 历史能力

- V3.1 System Prompt 规则：GEN-02 断言；
- V3.2 模型选择/校验：`model-utils` 单元测试 + GEN-05/07；
- V3.3 Remix：REMIX-01~10 + 单元测试；
- V3.4 CI/文档：`check:docs`、`check:inline`、smoke。

---

## 12. BUG 修复确认表

| BUG ID | 描述 | 根因 | 修复 | 复测 |
|--------|------|------|------|------|
| BUG-3.5-01 | 截断 JSON 解析出的 `html` 末尾多一个 `"` | 旧正则只处理 `"}` 或字符串结尾，未处理结尾引号 | 正则改为 `(?:"\s*\}|"\s*$|$)` | `PARSE-01` 通过 |
| BUG-3.5-02 | 根 typecheck 报 Hono `Context` 类型不兼容 | 根与 `server/` 各有一份 Hono（4.12.25 / 4.12.23），私有类型符号不一致 | 两端统一并锁定 `hono@4.13.13` | `npm run typecheck` 通过 |
| OBS-3.5-01 | 真实基线 doubao B2 在 60s 后连接失败并降级 | 上游网络/接口瞬时不可用，非代码路径 | 保留降级行为；如实记录 | 同模型其余 3 次成功；未复现 |

---

## 13. 执行记录

> 执行时间：2026-10-21 10:36–11:00（Asia/Shanghai）
> 执行人：开发（自动化）
> 环境：macOS，Node v24.18.0，npm 11.16.0，Chrome Headless（最新稳定版）
> 总命令：`npm ci`（根 + server）→ `npm run ci` → `npm run bench`（桩 / 真实）→ Chrome Headless

| 验收项 | 命令 | 结果 | 证据 |
|--------|------|------|------|
| UAT-3.5-01~04 | `npm run typecheck` / 静态检查 | ✅ 通过 | 分层文件存在；类型只在一处定义；类型检查退出码 0 |
| UAT-3.5-02~03 | `npm run check:inline` / `npm run build:api` | ✅ 通过 | 三个生成物 `ok`；重建后 `git diff -- api/` 为空 |
| UAT-3.5-05~07 | `npm test` | ✅ 通过 | 63/63；错误码、校验、解析、降级均覆盖 |
| UAT-3.5-08~09 | `node --import tsx --test tests/unit/*.test.mjs` | ✅ 通过 | generate-service 18 项、metrics 7 项；GEN/REMIX 19 项 |
| UAT-3.5-10~11 | `node --import tsx --test tests/contract/*.test.mjs` | ✅ 通过 | production API 6 项、parity 9 项 |
| UAT-3.5-12 | `[metrics]` 日志 | ✅ 可用 | 每次生成一行，含 totalMs/upstreamMs/usage/errorCode；不含 Prompt 全文与 Key |
| UAT-3.5-13 | `npm run bench -- --runs 3` | ✅ 通过 | 24 次，成功率 100%，p50 3.62ms / p90 5.81ms |
| UAT-3.5-14 | `npm run bench -- --real --models doubao,deepseek --runs 1` | ⚠️ 部分通过 | 8 次，7 次真实成功（87.5%）；doubao B2 上游连接失败，已降级并记录 |
| UAT-3.5-15 | `npm run ci` | ✅ 通过 | 退出码 0，日志 `temp/v3.5/ci-run-1.log` |
| UAT-3.5-16 | `npm run check:docs` | ✅ 通过 | version=3.5.0，tests=9 |
| UAT-3.5-17 | GitHub Actions | ⏳ 待推送 | 推送后记录 run 结果 |
| UAT-3.5-18 | 生产 curl / web_fetch | ⏳ 待部署 | 推送 Vercel 后执行 |
| UAT-3.5-19 | Chrome Headless | ✅ 通过 | `/`、`/create`、`/gallery`、`/settings`、`/settings/models`、`/play/demo` 均渲染 |
| UAT-3.5-20 | CHANGELOG / tag | ⏳ 待提交 | 提交后创建 `v3.5.0` |

### 13.1 通过标准

- P0 100% 通过；
- P1 100% 通过或记录环境限制；
- `npm run ci` 退出码 0；
- 失败项修复后重跑，不以「已知问题」带病发布。

### 13.2 未覆盖与限制

- 真实模型每场景 1 次，p90 仅作趋势；doubao 一次上游连接失败已记录，未用桩结果替代。
- 生产生成/Remix 待 Vercel 部署后验证；若额度不足，按 UAT 规则标记「未验证」。
- 未配置单价，成本只记录 token；配置 `BENCH_*_PRICE_PER_1K` 后可换算。
- 仅 Chrome Headless 抽查，未做 Safari/移动端真机。
