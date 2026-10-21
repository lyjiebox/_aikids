# Design: AI 儿童创意游戏平台 V3.5（API 拆分、类型与性能基线）

> 版本：v3.5
> 对应文档：`docs/proposal.md`
> 编写日期：2026-10-21
> 说明：本版本只做内在品质——拆分 `api/generate.ts`、收敛 `api/` 与 `server/` 双实现、统一类型与错误码、建立性能/成本基线；不改变任何用户可见需求。

---

## 1. 版本目标与范围

### 1.1 目标

1. **分层**：把生成链路拆成「路由 / 模型 / 提示词 / 解析 / 审计 / 编排」六层，每层单一职责、可单独测试。
2. **单实现**：`server/` 成为唯一业务实现，`api/` 只保留 Vercel 入口，并由构建脚本从同一份源码生成，消除手工同步的双实现。
3. **契约一致**：`api/` 与 `server/` 的请求校验、响应结构、错误码、降级行为由共享代码与契约测试共同锁定。
4. **类型收敛**：请求/响应/模型/Remix/错误码只有一个类型来源，消除 `server/src/types` 与 `api/generate.ts` 的类型漂移。
5. **可观测**：每次生成输出结构化指标（耗时、模式、模型、引擎、token、错误码），可计算 p50/p90、成功率和 token 成本基线。
6. **可回归**：新增双端一致性契约测试、生成服务单元测试、指标单元测试，全部进 CI。

### 1.2 范围

| 项目 | V3.5 | 说明 |
|------|------|------|
| 拆分 `api/generate.ts` | ✅ 必做 | 源码拆到 `server/src/**`，`api/generate.ts` 变为生成产物 |
| 收敛 `api/` 与 `server/` 重复实现 | ✅ 必做 | 共享路由处理器、服务、提示词、解析、审计 |
| 统一类型与错误码 | ✅ 必做 | `server/src/types/index.ts` 单一来源；响应新增 `code` |
| 契约测试 | ✅ 必做 | 同一请求分别打 `server/` 与 `api/`，比较状态码、`code`、关键字段 |
| 生成耗时 / 成功率 / token 基线 | ✅ 必做 | `scripts/bench-generate.mjs` + `[metrics]` 结构化日志 |
| 多模型对比基线 | ✅ 必做 | 同一 Prompt 集分别跑 doubao / deepseek，产出对比表 |
| 运行时 A/B / 自动路由 | ❌ 不做 | 只测量，不改变线上模型选择逻辑 |
| 修改 UI / 交互 | ❌ 不做 | 用户可见需求零变化 |
| 改存储 / 数据模型 | ❌ 不做 | 留给 V3.6 |
| 新增业务功能 / 账号 / 云端 | ❌ 不做 | 当前阶段约束不变 |
| 真实模型进 CI | ❌ 不做 | CI 使用本地测试桩；真实基线为人工执行并留档 |

### 1.3 关键设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| `api/` 能否直接 import `server/`？ | 不能，构建时生成自包含文件 | V3.2 已因 Vercel 未打包 `api/` 跨文件相对导入导致 500；保持自包含是已验证的部署约束 |
| 用什么生成自包含文件？ | `esbuild`（Vite 已依赖，显式加入 devDependencies） | 相比手工字符串拼接，能正确处理 import/export、命名冲突与摇树；产物确定、可 `--check` |
| 生成的 `api/*.ts` 是否进 git？ | 进 git | Vercel 从仓库构建，不运行自定义 build；生成物必须与源码一起提交 |
| 生成物是否参与类型检查？ | 不参与（`@ts-nocheck`） | 生成物是 JS 语法；类型正确性由 `api-src` 与 `server/src` 的源码检查保证 |
| 业务实现放哪？ | `server/src/**` | 本地服务已在这里；移动成本最低，且测试可直接 import |
| 路由是否共享？ | 共享 Hono handler，入口各自挂载 | 路径前缀不同（`/api/generate` vs 函数根路径），但校验/编排逻辑只写一次 |
| 错误响应新增 `code` 是否破坏兼容？ | 不破坏 | 只新增字段；前端继续读 `message`，旧客户端忽略未知字段 |
| 解析失败怎么处理？ | 统一抛 `GameParseError`，由编排层降级 | 消除 `api/` 500 与 `server/` 返回默认游戏的行为漂移 |
| 指标放响应里还是日志？ | 结构化日志 `[metrics] {...}` | 不改变 API 契约；本地基线脚本直接解析进程日志；Vercel 日志也可检索 |
| 成本怎么算？ | token 为实测/估算，成本按可配置单价计算 | 不硬编码供应商价格；基线记录 token，成本用 `*_PRICE_PER_1K` 环境变量可选换算 |
| 真实模型基线怎么跑？ | 人工执行 `npm run bench -- --real`，结果留档 `temp/v3.5/` | 消耗额度，不进 CI；CI 只验证桩模式 100% 成功 |

---

## 2. 现状与问题

V3.4 完成后，测试与 CI 已可用，但生成链路仍是双实现：

1. **单文件过大**：`api/generate.ts` 1,595 行，模型、Remix、Prompt、Mock、解析、路由全在一个文件里；`api/_model.ts` 701 行靠脚本复制到三个函数。
2. **双实现漂移**：
   - `server/` 在解析失败时返回内置默认游戏，`api/` 抛错后返回 500 或降级 Mock；
   - `server/` 只要请求带 `remixFrom` 就走 Remix 兜底，`api/` 要求 `remixFrom + remixInstruction` 同时存在；
   - 两侧 500 文案与错误结构不同。
3. **类型漂移**：`server/src/types/index.ts`、`server/src/services/model.ts`、`server/src/services/remix.ts`、`api/generate.ts` 各自声明同类类型，字段增删靠人肉同步。
4. **错误码缺失**：错误响应只有 `message`，前端/测试无法稳定区分「参数错误 / 模型未配置 / 上游失败」。
5. **没有性能基线**：只有零散 `console.log` 耗时，无法回答 p50/p90、成功率、token 成本、不同模型差异。

---

## 3. 总体方案

### 3.1 目标结构

```text
_aikids/
├── api/                            # 生成产物（自包含，禁止手改）
│   ├── generate.ts                 # ← api-src/generate.ts
│   └── models/{index,test}.ts      # ← api-src/models-*.ts
├── api-src/                        # Vercel 入口源码（薄适配）
│   ├── generate.ts
│   ├── models-index.ts
│   └── models-test.ts
├── server/src/
│   ├── types/index.ts              # 契约类型 + 错误码（唯一来源）
│   ├── errors.ts                   # ModelConfigError / ModelCallError / GameParseError
│   ├── routes/
│   │   ├── generate.ts             # HTTP handler（薄）
│   │   └── models.ts               # 目录 / 测试 handler（薄）
│   └── services/
│       ├── model.ts                # 模型注册、校验、调用
│       ├── remix.ts                # Remix 档案 / Prompt / 审计（V3.3）
│       ├── prompt.ts               # System Prompt、模板提示、Prompt 组装
│       ├── parse.ts                # 模型输出解析
│       ├── mock.ts                 # 本地兜底游戏
│       ├── metrics.ts              # 指标事件、token 估算、分位数
│       └── generate.ts             # 编排：校验 → 模型 → 调用 → 解析 → 审计 → 降级
├── scripts/
│   ├── build-api.mjs               # esbuild 生成 api/ + --check
│   └── bench-generate.mjs          # 性能/成本基线
└── tests/
    ├── unit/{metrics,generate-service}.test.mjs
    └── contract/parity.test.mjs    # 双端一致性
```

### 3.2 请求链路

```text
HTTP Request
   │
   ├─ api/generate.ts (生成)          server/src/index.ts
   │        └──────────────┬────────────────┘
   │                       ▼
   │              routes/generate.ts  generateHandler
   │                       │ 解析 JSON（失败 → 400 INVALID_JSON）
   │                       ▼
   │              services/generate.ts  handleGenerateRequest
   │         ┌─────────────┼──────────────┬──────────────┐
   │         ▼             ▼              ▼              ▼
   │   parseGenerate   services/      services/      services/
   │   Request         prompt.ts      model.ts       mock.ts
   │   (400 + code)        │              │              │
   │                       ▼              ▼              │
   │                 services/remix.ts  callChatCompletion│
   │                       │              │              │
   │                       ▼              ▼              │
   │                 services/parse.ts  usage/latency    │
   │                       │              │              │
   │                       └──────┬───────┘              │
   │                              ▼                      │
   │                    services/metrics.ts              │
   │                    [metrics] {json}                 │
   │                              │                      │
   │                              ▼                      ▼
   └──────────────────────  { status, body }  ← 降级 Mock / 保留原游戏
```

### 3.3 分层职责

| 层 | 文件 | 职责 | 不负责 |
|----|------|------|--------|
| 入口 | `api-src/*` | 创建 Hono 实例、挂 handler、导出 `POST/GET` | 校验、业务分支 |
| 路由 | `server/src/routes/*` | 读 JSON、调用服务、按结果返回状态码 | 模型、Prompt、降级 |
| 编排 | `services/generate.ts` | 参数校验、Remix 判定、模型解析、调用、异常降级、指标 | HTTP 细节 |
| 模型 | `services/model.ts` | 环境变量模型、自定义模型校验、Chat Completions、usage | 游戏 Prompt |
| 提示词 | `services/prompt.ts` | System Prompt、模板提示、普通/Remix Prompt 组装 | 调用模型 |
| 解析 | `services/parse.ts` | 五种输出格式解析、结构校验 | 决定降级策略 |
| 审计 | `services/remix.ts` | 原游戏档案、源码预算、Remix 审计 | 解析模型输出 |
| 兜底 | `services/mock.ts` | 本地模板游戏 | 判断何时兜底 |
| 度量 | `services/metrics.ts` | 指标事件、token 估算、p50/p90 | 采集/展示 |

---

## 4. 详细设计

### 4.1 契约类型（`server/src/types/index.ts`）

单一来源，`api-src` 与 `server` 均从这里导入：

```ts
export const ERROR_CODES = {
  INVALID_JSON: 'INVALID_JSON',
  INVALID_BODY: 'INVALID_BODY',
  EMPTY_PROMPT: 'EMPTY_PROMPT',
  GENERATION_FAILED: 'GENERATION_FAILED',
  MODEL_CONFIG_INVALID: 'MODEL_CONFIG_INVALID',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  MISSING_MODEL: 'MISSING_MODEL',
  NO_MODEL: 'NO_MODEL',
  MODEL_CALL_FAILED: 'MODEL_CALL_FAILED',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',
  UPSTREAM_5XX: 'UPSTREAM_5XX',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  BAD_RESPONSE: 'BAD_RESPONSE',
  EMPTY_RESPONSE: 'EMPTY_RESPONSE',
  OUTPUT_PARSE_FAILED: 'OUTPUT_PARSE_FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
```

类型清单：

- 模型：`ModelSource`、`EnvModelInfo`、`ResolvedModel`、`ModelCatalog`、`ChatMessage`、`CallOptions`、`TokenUsage`、`ModelTestResult`。
- Remix：`RemixSourceMode`、`RemixMode`、`GameProfile`、`RemixPromptInput`、`RemixPromptResult`、`RemixAudit`、`RemixFallbackResult`。
- 生成：`GenerateRequest`、`GenerateData`、`GenerateSuccessResponse`、`GenerateErrorResponse`、`GenerateResponse`。
- 指标：`GenerationMetricEvent`。

错误响应结构（新增 `code`，其余不变）：

```json
{ "success": false, "code": "EMPTY_PROMPT", "message": "请先说出你的游戏创意！" }
```

`ModelConfigError` 的 `code` 直接沿用 `MODEL_*`，因此「未知模型」响应为：

```json
{ "success": false, "code": "MODEL_NOT_FOUND", "message": "未知模型：xxx" }
```

### 4.2 请求校验（`services/generate.ts`）

| 输入 | 结果 |
|------|------|
| JSON 解析失败 | 400 `INVALID_JSON`，`请求参数格式错误` |
| body 不是对象 / 为数组 | 400 `INVALID_BODY`，`请求参数格式错误` |
| `userPrompt` 缺失 / 非字符串 / 全空白 | 400 `EMPTY_PROMPT`，`请先说出你的游戏创意！` |
| 可选字段类型不符 | 丢弃该字段，不报错（保持旧客户端兼容） |
| `modelConfig` | 原样透传，由模型层校验 |

可选字段只接受字符串：`templateId`、`remixFrom`、`remixInstruction`、`originalGameHtml`、`originalGameHtmlPreview`、`originalTitle`、`originalUserPrompt`、`modelId`、`model`。数字/对象/数组按未提供处理（与 V3.3 的宽松行为一致）。

### 4.3 生成编排

保持 V3.1–V3.3 行为，唯一有意收敛的漂移如下：

| 场景 | V3.4 行为 | V3.5 统一行为 |
|------|-----------|---------------|
| Remix 判定 | `api` 要求 `remixFrom + 非空 instruction`；`server` 只看 `remixFrom` | 统一为 `remixFrom + 非空 instruction` |
| 解析失败（普通生成） | `api` 降级 Mock；`server` 返回内置默认游戏 | 统一抛 `OUTPUT_PARSE_FAILED`，降级 Mock 并带 `warning` |
| 解析失败（Remix） | 两侧最终都保留原游戏 | 保留原游戏，`remixFallback=true` |
| 未捕获异常 | 两侧文案不同 | 500 `GENERATION_FAILED`，`魔法好像失灵了，再试一次吧！` |

普通生成成功响应（无 Remix 字段）：

```json
{
  "success": true,
  "data": {
    "title": "星星收集",
    "gameHtml": "<!DOCTYPE html>...",
    "engine": "volcengine",
    "model": "deepseek",
    "modelName": "DeepSeek V4 Pro",
    "modelSource": "env"
  }
}
```

Remix 成功响应额外包含 `remixMode`、`remixProfile`、`remixAudit`；模型不可用/调用失败时包含 `remixMode: "fallback"`、`remixFallback: true`。

降级规则：

| 条件 | 结果 |
|------|------|
| 无可用模型 + Remix 有原 HTML | 200，原游戏，`engine=mock`，`modelName=原游戏`，`warning` 含「保留原游戏」 |
| 无可用模型 + 普通生成 | 200，本地 Mock，`engine=mock`，`modelName=本地模板`，无 `warning` |
| 模型调用失败 + Remix 有原 HTML | 200，原游戏，`warning` 含错误原因 +「保留原游戏」 |
| 模型调用失败 + 普通生成 | 200，本地 Mock，`warning` 含错误原因 +「降级为本地模板」 |
| 模型返回无法解析 | 同「模型调用失败」，`warning` 为 `无法解析 AI 输出` |

### 4.4 模型调用与 token

`callChatCompletion` 返回值增加 `usage?: TokenUsage`：

```ts
const usage = record?.usage;
// { prompt_tokens, completion_tokens, total_tokens }
```

- 上游返回合法 `usage` 时原样记录；
- 缺失时 `usage` 为 `undefined`，指标中不伪造 token。

`ModelTestResult` 不新增字段，避免改变模型测试接口。

### 4.5 指标事件（`services/metrics.ts`）

每次生成请求输出一行：

```text
[metrics] {"event":"generate","ok":true,"mode":"create","status":200,"engine":"volcengine","modelId":"deepseek","modelSource":"env","totalMs":18234,"upstreamMs":18100,"promptChars":42,"usage":{"promptTokens":1200,"completionTokens":9000,"totalTokens":10200},"timestamp":"2026-10-21T02:30:00.000Z"}
```

字段：

| 字段 | 说明 |
|------|------|
| `ok` | 是否由真实模型成功生成（`engine=volcengine` 且未降级） |
| `mode` | `create` / `remix` |
| `status` | HTTP 状态码 |
| `engine` | `volcengine` / `mock` |
| `modelId` / `modelSource` | 实际使用的模型；无模型为 `mock` / `none` |
| `totalMs` | 请求入口到响应组装完成 |
| `upstreamMs` | 模型调用耗时（仅真实调用） |
| `promptChars` / `includedChars` | 用户 Prompt / 实际注入源码字符数 |
| `sourceMode` | Remix 源码模式 |
| `usage` | 上游 token 用量 |
| `estimatedPromptTokens` / `estimatedCompletionTokens` | 上游未返回 usage 时的估算 |
| `errorCode` | 降级/失败原因 |
| `timestamp` | ISO 时间 |

token 估算规则（仅用于无 usage 时）：

```text
tokens ≈ ceil(chars / 1.5)   // 中英混排的保守近似
```

成本换算（基线脚本，不写入业务代码）：

```text
cost = promptTokens / 1000 * INPUT_PRICE_PER_1K
     + completionTokens / 1000 * OUTPUT_PRICE_PER_1K
```

单价通过 `BENCH_INPUT_PRICE_PER_1K`、`BENCH_OUTPUT_PRICE_PER_1K` 传入；未配置时基线只记录 token，成本标记为 `unknown`，不伪造成本数字。

`percentile(values, p)` 使用 nearest-rank：排序后索引 `ceil(p/100 * n) - 1`，空数组返回 0。

### 4.6 API 生成机制（`scripts/build-api.mjs`）

```text
api-src/generate.ts ──┐
server/src/**        ──┼─ esbuild bundle ─→ api/generate.ts
hono (external)      ──┘
```

- `bundle: true`、`format: 'esm'`、`platform: 'node'`、`target: 'node20'`；
- `external: ['hono']`：Hono 保留为 import，由 Vercel 从依赖安装；
- 产物顶部 banner：`AUTO-GENERATED FILE — DO NOT EDIT` + `// @ts-nocheck`；
- `--check`：在内存中构建并与已提交文件逐字节比较；不一致退出 1；
- 构建脚本同时校验产物不含 `../server`、`_model` 等相对导入，确保自包含。

命令：

```bash
npm run build:api    # 重新生成 api/
npm run check:inline # 等价于 node scripts/build-api.mjs --check
```

`check:inline` 名称保留，避免破坏 V3.4 的 CI/文档契约；`build:api` 为新增别名。

### 4.7 双端一致性契约

`tests/contract/parity.test.mjs` 在测试进程内：

1. 启动测试桩与本地 `server/`；
2. 设置 `process.env` 指向测试桩；
3. `await import('../../api/generate.ts')` 与 `../../api/models/index.ts`；
4. 对同一组请求分别调用生产 `POST/GET` 与本地后端；
5. 比较：

| 比较项 | 说明 |
|--------|------|
| HTTP 状态码 | 必须相同 |
| `success` / `code` / `message` | 必须相同 |
| `data` 字段集合 | 必须相同（不含时间类字段） |
| `engine` / `model` / `modelSource` / `remixMode` | 必须相同 |
| `gameHtml` / `title` / `remixAudit` | 桩输出确定，必须相同 |

覆盖请求：普通生成、Remix full、空 Prompt、非法 JSON、非法自定义模型、上游 500 降级。

---

## 5. 兼容性与安全

### 5.1 兼容性

| 对象 | 影响 |
|------|------|
| 前端 | 无变化；成功响应字段不变，错误响应只新增 `code` |
| 旧客户端 | 继续忽略 `code`；旧 `originalGameHtmlPreview` 仍支持 |
| API 请求 | 字段不变；类型不符的可选字段按未提供处理 |
| Vercel 部署 | `api/*.ts` 仍自包含；`vercel.json`、`maxDuration` 不变 |
| 本地开发 | `npm run dev` / `cd server && npm run dev` 不变 |
| 测试 | V3.4 全部用例保留；新增用例不依赖真实 Key |

### 5.2 安全

- 生成物不含 API Key；模型层继续脱敏 endpoint、Key 不落日志。
- `[metrics]` 只记录模型 ID、用量与耗时，不记录 Prompt 全文、源码、Key。
- 自定义模型白名单、HTTPS、本地地址开关逻辑不变。
- 基线脚本只在本机运行，测试桩只监听 `127.0.0.1`。

---

## 6. 测试策略

| 层级 | 内容 | 位置 | CI |
|------|------|------|----|
| 类型 | api-src + server + 前端 TS | `npm run typecheck` | ✅ |
| 构建 | Vite + server + api 生成一致性 | `npm run build` / `build:server` / `check:inline` | ✅ |
| 单元 | 解析、校验、指标、token 估算、分位数 | `tests/unit/*` | ✅ |
| 集成 | 生成、Remix（真实 Hono + 桩） | `tests/integration/*` | ✅ |
| 契约 | 生产函数关键字段 + 双端一致性 | `tests/contract/*` | ✅ |
| 冒烟 | 构建产物首页/路由 | `npm run smoke:preview` | ✅ |
| 基线 | 桩模式性能/成本；真实模型可选 | `scripts/bench-generate.mjs` | 桩模式手动，真实模型人工 |
| 浏览器 | 首页/创作/播放/画廊/设置抽查 | UAT | ❌ |

通过标准：`npm run ci` 退出码 0；双端一致性全部通过；桩模式基线成功率 100%；真实模型基线如实记录，不伪造。

---

## 7. 性能基线方案

### 7.1 固定 Prompt 集

| ID | 场景 | Prompt |
|----|------|--------|
| B1 | 收集 | `做一个接星星的小游戏，接到星星得 1 分，接到 10 分就胜利` |
| B2 | 打地鼠 | `做一个打地鼠游戏，地鼠是小兔子，30 秒内打到 10 只得胜` |
| B3 | 跑酷 | `做一个太空跑酷小游戏，用方向键躲避陨石，坚持 30 秒获胜` |
| B4 | Remix | 以 B1 产物为原游戏，指令：`把星星换成宝石，再加一个会扣分的炸弹` |

### 7.2 执行方式

```bash
# 桩模式：验证链路与统计逻辑，CI 友好（不消耗额度）
npm run bench -- --runs 3

# 真实模型：读取 .env，消耗额度，结果写入 temp/v3.5/
npm run bench -- --real --models doubao,deepseek --runs 1
```

### 7.3 输出

- `temp/v3.5/baseline-stub-YYYY-MM-DD.json` / `.md`
- `temp/v3.5/baseline-real-YYYY-MM-DD.json` / `.md`

字段：`p50Ms`、`p90Ms`、`successRate`、`fallbackRate`、`avgPromptTokens`、`avgCompletionTokens`、每模型分组的同名字段、每个请求的原始记录。

### 7.4 基线口径

- 延迟：客户端从发请求到收到完整响应（含网络与序列化），单位为 ms；
- 上游延迟：`[metrics].upstreamMs`；
- 成功率：`engine=volcengine` 且 HTTP 200 的请求占比；
- 降级率：HTTP 200 但 `engine=mock` 的请求占比；
- token：优先使用上游 `usage`；缺失时使用估算并在报告中标注 `estimated`；
- 样本量：桩模式每 Prompt 3 次；真实模型默认每 Prompt 1 次，报告中注明样本量不足，p90 仅供参考。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 |
|------|------|------|
| esbuild 产物与手写文件行为不一致 | 线上回归 | 双端一致性契约 + 生产函数契约 + 生产冒烟 |
| Vercel 不识别生成物 | 函数 500 | 生成物保持 ESM + `hono` 外部依赖；部署后立即冒烟 `/api/models` 与生成 |
| 类型拆分引入循环依赖 | 类型检查失败 | 类型文件不 import 任何 service；service 单向依赖 types |
| 统一 Remix 判定改变旧行为 | 旧请求降级 | 旧客户端本来就要求 `remixFrom`，且 `remixInstruction` 是 V2 起的必填；契约测试覆盖 |
| 解析失败改为降级 | 返回内容变化 | 仅影响「模型输出完全无法解析」的异常场景；统一为可玩 Mock 更符合预期 |
| 真实基线样本少 | p90 不可靠 | 报告注明样本量；桩模式跑更多轮验证统计逻辑 |
| 生成物提交遗漏 | CI 红 | `check:inline` 逐字节检查，提交前 `npm run ci` |

回滚：`git revert <v3.5.0 commit>` 即可恢复 V3.4 的手写 `api/` 与双实现；本版本无数据迁移，不需要清理 localStorage。

---

## 9. 文件清单

| 文件 | 变更 |
|------|------|
| `docs/design-v3.5.md` / `docs/uat-v3.5.md` | 新增 |
| `server/src/types/index.ts` | 重写为唯一契约类型 + 错误码 |
| `server/src/errors.ts` | 新增：三类错误 |
| `server/src/services/{model,remix}.ts` | 改为从 types 导入；model 增加 usage |
| `server/src/services/{prompt,parse,mock,metrics,generate}.ts` | 新增分层模块 |
| `server/src/services/ai.ts` | 保留为兼容导出（委托 generate.ts） |
| `server/src/routes/{generate,models}.ts` | 改为薄 handler |
| `api-src/{generate,models-index,models-test}.ts` | 新增 Vercel 入口源码 |
| `api/{generate.ts,models/*.ts}` | 改为生成物 |
| `api/_model.ts` | 删除（源码迁入 `server/src/services/model.ts`） |
| `scripts/build-api.mjs` | 新增（替代 `scripts/inline-api-model.mjs`） |
| `scripts/bench-generate.mjs` | 新增 |
| `tests/unit/{generate-service,metrics}.test.mjs` | 新增 |
| `tests/contract/parity.test.mjs` | 新增 |
| `tests/contract/production-api.test.mjs` | 适配新入口与 `code` |
| `tests/support/backend.mjs` | 增加真实模式/日志读取能力（最小改动） |
| `package.json` / `server/package.json` | 版本 3.5.0；新增 `build:api`、`bench`、esbuild |
| `scripts/check-docs.mjs` | 增加新测试文件、生成物 banner、`build:api` 检查 |
| `.github/workflows/ci.yml` | 保持等价命令（`check:inline` 已覆盖生成物） |
| `docs/proposal.md`、`README.md`、`CHANGELOG.md`、`.env.example` | 版本、状态、基线说明 |
| `temp/v3.5/*` | UAT 报告、基线结果 |
