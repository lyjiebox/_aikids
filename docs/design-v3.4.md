# Design: AI 儿童创意游戏平台 V3.4（工程收敛）

> 版本：v3.4
> 对应文档：`docs/proposal.md`
> 编写日期：2026-10-20
> 说明：本版本只做工程收敛——CI、可重复测试、版本与文档一致性、历史遗留清理、发布流程；不改变任何用户可见需求，不拆分 `api/generate.ts`，不重构存储层与 UI。

---

## 1. 版本目标与范围

### 1.1 目标

1. **CI 可执行**：`typecheck` + `build` + 核心回归测试成为一条可重复执行的流水线，推送/PR 自动运行。
2. **测试资产化**：把 `temp/` 中依赖人工启停、依赖真实模型的脚本，收敛为 `tests/` 下自管理、可重复执行的测试。
3. **核心路径可回归**：生成、Remix、存储三条核心路径都有稳定测试，且不依赖真实 API Key。
4. **文档与代码一致**：`proposal / README / DEPLOY / design / uat / package.json / server/package.json / CHANGELOG` 的版本、命令、目录、行为一致，并有脚本检查。
5. **历史遗留清理**：移除废弃 Taro 目录、根目录临时文件、已迁移的重复测试脚本。
6. **发布流程固定**：CHANGELOG → 版本号 → 本地 CI 全绿 → commit → `v3.4.0` tag → 预览冒烟。

### 1.2 范围

| 项目 | V3.4 | 说明 |
|------|------|------|
| 根 `tsconfig.json` + `npm run typecheck` | ✅ 必做 | 覆盖 `api/` 与 `src/` 的 TS/TSX；`server/` 使用自己的 tsconfig |
| GitHub Actions CI | ✅ 必做 | `typecheck` / `build` / `test` / 内联与文档一致性检查 |
| `tests/` 目录与统一 runner | ✅ 必做 | 单元 + 集成 + 生产函数契约 |
| 生成路径测试 | ✅ 必做 | 普通生成、参数校验、模型失败降级 |
| Remix 路径测试 | ✅ 必做 | full / outline / preview / fallback / 审计 |
| 存储路径测试 | ✅ 必做 | 作品、设置、自定义模型的容错与往返 |
| 生产函数契约测试 | ✅ 必做 | 直接调用 `api/generate.ts` 的 `POST`，不依赖 Vercel |
| 内联模型一致性检查 | ✅ 必做 | `api/_model.ts` 与三个自包含函数保持同步 |
| 文档/版本一致性检查 | ✅ 必做 | 版本号、CHANGELOG、design/uat 文件存在 |
| 预览冒烟 | ✅ 必做 | `vite preview` 启动构建产物并请求首页 |
| 清理 Taro 残留 | ✅ 必做 | 删除 `client-taro-broken/`（git 历史可恢复） |
| 清理根目录临时文件 | ✅ 必做 | 删除 `test-game.html` 等 |
| 迁移 `temp/` 稳定脚本 | ✅ 必做 | 迁移后删除重复 `.mjs`，保留历史报告 |
| CHANGELOG + `v3.4.0` tag | ✅ 必做 | 发布出口 |
| 拆分 `api/generate.ts` | ❌ 不做 | 留到 V3.5 |
| 大改存储层 / 数据模型 | ❌ 不做 | 留到 V3.6 |
| UI / 交互重构 | ❌ 不做 | 用户可见需求零变化 |
| 新增业务功能 | ❌ 不做 | 本版本是内在品质线 |
| 真实模型消耗型测试进 CI | ❌ 不做 | CI 使用本地测试桩，真实模型只做人工 UAT |
| 部署到 Vercel 并改线上配置 | ⚠️ 不强制 | 有 CLI 权限时做预览冒烟；否则以本地构建产物冒烟替代并记录 |

### 1.3 关键设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 测试框架选什么？ | Node 内置 `node:test` + `tsx` | 项目已有 tsx；不引入 vitest/jest 等大依赖；`node --test` 在 Node 20+ 稳定 |
| 测试如何跑 TS？ | `node --import tsx --test` | 直接复用 `server/src/**/*.ts`，不需要先编译 |
| 集成测试如何隔离？ | 测试进程内启动测试桩 + 子进程启动本地后端，端口用 0 动态分配 | 不污染 4000/4998，不依赖开发者手工先启服务，CI 可并行 |
| 为什么仍要测 `api/generate.ts`？ | 直接 import `POST` 并用标准 `Request` 调用 | 生产函数是自包含实现，与 `server/` 存在双实现，契约测试能防止漂移 |
| 根类型检查怎么覆盖前后端？ | 根 `tsconfig.json` 管 `api/` + `src/`；`server/tsconfig.json` 管 `server/` | 两边模块系统/输出目录不同，强行合并会引入噪音 |
| 是否开启 `checkJs`？ | 否，仅 `allowJs` | 前端主体是 JSX/JS，本版本不做全量 JS 类型化（V3.5 再评估） |
| 内联代码怎么防漂移？ | `scripts/inline-api-model.mjs` 支持 `--check`，CI 失败即阻止合并 | 原脚本只能“覆盖”，无法发现忘记同步 |
| 版本一致性怎么保证？ | `scripts/check-docs.mjs` 校验版本号、CHANGELOG、design/uat 文件 | 比人工检查可靠，且成本极低 |
| 预览冒烟怎么做？ | 构建后用 `vite preview` 启动，请求 `/` 与 `/create` | 覆盖 SPA fallback 与静态资源，不依赖 Vercel 账号 |
| Taro 目录直接删吗？ | 删除并提交，历史可在 git 中找回 | 已废弃且不参与构建；保留只会增加搜索与维护噪音 |

---

## 2. 现状与问题

V3.3 完成后，功能与 UAT 都已通过，但工程层面仍不可持续：

1. **没有 CI**：仓库没有 `.github/workflows/`，构建/类型/测试全靠人工记忆。
2. **没有类型检查入口**：根目录没有 `tsconfig.json`，`package.json` 只有 `dev/build/preview`；`api/` 的 TypeScript 错误只能在 Vercel 构建时暴露。
3. **测试不可重复**：
   - `temp/v3.3/api-uat.mjs` 要求人工先启动 stub 与 `server/`，端口写死 4000/4998。
   - `temp/v3.2/storage.test.mjs` 等脚本依赖 `temp/` 路径，迁移后容易失效。
   - 真实模型脚本会消耗额度，不能进 CI。
4. **脚本重复/失效**：`temp/v3.2/inline-api-model.mjs` 是唯一能同步内联模型的工具，但藏在 temp 且没有校验模式；`temp/` 中同时存在多版测试脚本。
5. **版本与文档漂移**：`package.json` 仍为 3.3.0；README 未提 V3.4；没有 CHANGELOG；V3.3 design 末尾还写着“V3.4 后处理增强引擎”（该内容已移到 V4.0）。
6. **历史遗留**：`client-taro-broken/`、根目录 `test-game.html` 等仍占用仓库体积与注意力。

V3.4 的命题不是“再加功能”，而是让上述问题变成**机器可检查、可重复执行**的流程。

---

## 3. 总体方案

### 3.1 目标目录结构

```text
_aikids/
├── .github/workflows/ci.yml      # 新增：CI 流水线
├── api/                          # Vercel Functions（保持自包含，不拆分）
│   ├── _model.ts                 # 内联源
│   ├── generate.ts               # 由脚本内联，禁止手改内联块
│   └── models/{index,test}.ts
├── scripts/
│   ├── inline-api-model.mjs      # 迁移 + --check 模式
│   ├── check-docs.mjs            # 版本/文档一致性
│   ├── run-tests.mjs             # 测试发现与执行
│   └── smoke-preview.mjs         # 构建产物冒烟
├── tests/
│   ├── support/
│   │   ├── stub-model-server.mjs # 进程内 OpenAI 兼容测试桩
│   │   ├── backend.mjs           # 启动/停止本地 server 子进程
│   │   └── fixtures.mjs          # 样本游戏与断言辅助
│   ├── unit/
│   │   ├── storage.test.mjs
│   │   ├── model-utils.test.mjs
│   │   └── remix-core.test.mjs
│   ├── integration/
│   │   ├── generate.test.mjs
│   │   └── remix.test.mjs
│   └── contract/
│       └── production-api.test.mjs
├── docs/design-v3.4.md
├── docs/uat-v3.4.md
├── CHANGELOG.md                  # 新增
├── tsconfig.json                 # 新增
└── package.json                  # 版本 3.4.0 + typecheck/test/ci 脚本
```

### 3.2 流水线

```text
push / pull_request
        │
        ▼
┌──────────────────────────────────────────────┐
│ GitHub Actions: verify                        │
│                                              │
│ 1. npm ci                                    │
│ 2. npm run typecheck                         │
│      ├─ tsc -p tsconfig.json                 │
│      └─ tsc -p server/tsconfig.json          │
│ 3. npm run build          （Vite 产物）       │
│ 4. npm test               （单元+集成+契约）  │
│ 5. npm run check:inline   （内联块一致）      │
│ 6. npm run check:docs     （版本/文档一致）   │
│ 7. npm run smoke:preview  （构建产物冒烟）    │
│ 8. server: npm ci && npm run build           │
└──────────────────────────────────────────────┘
        │
        ▼
   全绿才允许合并 / 打 tag
```

### 3.3 与现有代码的关系

- **不改业务代码**：`api/generate.ts`、`server/src/**`、`src/**` 的行为不变；只允许为类型检查做**不改变运行时语义**的最小修正（如显式类型、未使用变量）。
- **测试从现有逻辑出发**：单元测试直接复用 V3.2/V3.3 已验证的断言；集成测试复用 V3.3 `api-uat.mjs` 的用例，但改为自管理生命周期。
- **生产函数不改结构**：契约测试证明 `api/` 与 `server/` 在相同输入下返回一致的关键字段，为 V3.5 拆分提供安全网。

---

## 4. 详细设计

### 4.1 TypeScript 检查

新增根 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["api/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "server", "client-taro-broken"]
}
```

`package.json`：

```json
{
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p server/tsconfig.json --noEmit",
    "build:server": "tsc -p server/tsconfig.json",
    "test": "node scripts/run-tests.mjs",
    "check:inline": "node scripts/inline-api-model.mjs --check",
    "check:docs": "node scripts/check-docs.mjs",
    "smoke:preview": "node scripts/smoke-preview.mjs",
    "ci": "npm run typecheck && npm run build && npm run build:server && npm test && npm run check:inline && npm run check:docs && npm run smoke:preview"
  }
}
```

说明：

- `allowJs` 让 TSX 能解析对 `.jsx/.js` 的导入；`checkJs: false` 避免把历史 JS 全部变成错误源。
- `server/` 不并入根项目，避免 CommonJS/ESM 与 `rootDir` 冲突；由第二条 `tsc` 单独检查。
- 类型检查发现的问题必须“修类型不修行为”；若确属历史行为，使用最小显式类型而不是 `any` 扩散。

### 4.2 测试桩

`tests/support/stub-model-server.mjs`：

- 使用 Node 原生 `http` 实现 OpenAI 兼容 `POST /v1/chat/completions`。
- 通过 `createStubServer()` 返回 `{ baseUrl, close, reset, getLastRequest }`，端口传 `0` 由系统分配。
- 模型行为：

| model | 行为 | 用途 |
|-------|------|------|
| `stub-model` | 普通生成返回 `{title, html}` JSON | 生成成功路径 |
| `stub-remix` | 从 Prompt 的 `<game_source>` 提取源码，追加 Boss 后返回 | Remix 成功路径 |
| `stub-remix-no-score` | 删除得分/score 后返回 | 审计失败识别 |
| `stub-remix-plain` | 返回纯 HTML | 解析兜底 |
| `stub-force-500` | 返回 HTTP 500 | 失败回退 |
| `stub-empty` | 返回空 content | 空输出兜底 |
| 其他 | 普通生成 | 模型测试接口 |

- 捕获最近一次请求体，供断言 System/User Prompt、`max_tokens`。
- 所有响应带 CORS 头，兼容浏览器/服务端调用。

### 4.3 后端生命周期

`tests/support/backend.mjs`：

1. `getFreePort()`：用 `net.createServer().listen(0)` 拿一个空闲端口后关闭。
2. `startBackend({ stubUrl, env })`：
   - 子进程：`node node_modules/tsx/dist/cli.mjs server/src/index.ts`
   - `cwd: server/`（与 `npm run dev` 一致，保证 `loadEnv` 行为一致）
   - 环境变量：`PORT`、`VOLCENGINE_API_KEY=test-key`、`VOLCENGINE_BASE_URL=<stub>`、`DOUBAO_ENDPOINT_ID=ep-test`、`DEEPSEEK_ENDPOINT_ID=ep-test`、`GAME_MODEL=deepseek`、`ALLOW_LOCAL_MODEL_HOSTS=1`、`MODEL_TEST_TIMEOUT_MS=2000`、`VERCEL=`（清空，确保加载本地逻辑）
   - 轮询 `GET /` 直到 200 或超时（15s），失败时输出子进程日志尾部。
3. `stop()`：`SIGTERM`，等待退出；超时 `SIGKILL`。
4. 每个集成测试文件用 `before/after` 管理唯一实例。

### 4.4 核心路径测试

#### 4.4.1 生成（`tests/integration/generate.test.mjs`）

| 用例 | 断言 |
|------|------|
| GEN-01 正常生成 | 200、`success=true`、`gameHtml` 含 `<html`、`modelSource=custom`、不带 Remix 字段 |
| GEN-02 Prompt 契约 | System Prompt 含 V3.1 规则；`max_tokens=8192`；User Prompt 含模板提示 |
| GEN-03 空 prompt | 400、`success=false`、中文校验信息 |
| GEN-04 非法 JSON | 400、`success=false` |
| GEN-05 自定义模型非法地址 | 400、`ModelConfigError` 信息 |
| GEN-06 上游 500 且非 Remix | 200、`engine=mock`、`warning` 含“降级为本地模板” |
| GEN-07 内置模型不可用 | `GET /api/models` 返回目录且不泄露 Key |

#### 4.4.2 Remix（`tests/integration/remix.test.mjs`）

| 用例 | 断言 |
|------|------|
| REMIX-01 full | `remixMode=full`、游戏含 BOSS、审计 `preserved=true`、档案字段正确 |
| REMIX-02 Prompt | 含 `<game_source>` 完整源码、档案、改编指令、`max_tokens=16384` |
| REMIX-03 outline | 超长源码 `remixMode=outline`、含片段标记、中间 marker 不注入 |
| REMIX-04 preview | 仅 preview 时 `remixMode=preview`、提示“不完整” |
| REMIX-05 fallback | 上游 500 时原样返回原 HTML、`remixFallback=true`、`remixMode=fallback` |
| REMIX-06 审计失败 | 删除得分后 `scorePreserved=false`、仍返回游戏 |
| REMIX-07 纯 HTML | 可解析且审计通过 |
| REMIX-08 非字符串源码 | 不 500 |
| REMIX-09 无模型 | 无模型环境子进程启动，原样返回原游戏 |
| REMIX-10 Key 不回显 | 响应文本不含 `test-key` / `apiKey` |

#### 4.4.3 存储（`tests/unit/storage.test.mjs`）

| 用例 | 断言 |
|------|------|
| STORAGE-01 作品往返 | `saveWorks` → `loadWorks` 字段一致，旧作品补 `remixCount=0` |
| STORAGE-02 损坏 JSON | 作品/设置/模型均返回空结构，不抛异常 |
| STORAGE-03 设置往返 | 合并后的设置原样读回 |
| STORAGE-04 模型容错 | 非数组/非法条目/重复 ID/超过 20 条均被正确处理 |
| STORAGE-05 写入上限 | `saveCustomModels` 最多写入 20 条 |
| STORAGE-06 写入异常 | `localStorage.setItem` 抛错时静默失败 |

#### 4.4.4 生产函数契约（`tests/contract/production-api.test.mjs`）

- 在测试进程内设置模型环境变量与本地白名单，`await import('../../api/generate.ts')`。
- 用标准 `Request` 直接调用 `POST`，覆盖：
  - 普通生成成功（与本地后端关键字段一致）；
  - Remix full 成功（`remixMode/remixProfile/remixAudit`）；
  - 空 prompt 返回 400；
  - 响应不含 API Key。
- 与本地后端测试共用同一测试桩与样本，防止双实现漂移。

### 4.5 内联模型同步

`scripts/inline-api-model.mjs`：

- 默认：把 `api/_model.ts` 内联到 `api/generate.ts`、`api/models/index.ts`、`api/models/test.ts`。
- `--check`：只在内存中构建期望内容并与现有文件逐字节比较；不一致时打印差异文件并退出 1。
- 更新 `api/_model.ts` 顶部注释：脚本路径从 `temp/v3.2/` 改为 `scripts/`。

### 4.6 版本与文档一致性

`scripts/check-docs.mjs` 检查：

1. `package.json.version === server/package.json.version`。
2. `CHANGELOG.md` 含 `## [<version>]` 段落。
3. `docs/design-<major.minor>.md` 与 `docs/uat-<major.minor>.md` 存在。
4. `README.md` 提到当前版本号。
5. 必需的 npm scripts 存在：`typecheck`、`test`、`ci`、`check:inline`、`check:docs`。
6. `tests/` 下三类测试文件存在：unit / integration / contract。

失败时输出明确缺项，CI 直接红。

### 4.7 发布流程

```text
1. 更新版本号（package.json / server/package.json）
2. 更新 CHANGELOG.md（Added / Changed / Removed / Verified）
3. 更新 proposal 勾选、README、DEPLOY、design/uat
4. npm run ci（等价 CI）
5. git commit
6. git tag -a v3.4.0 -m "V3.4 工程收敛"
7. （可选）git push && git push origin v3.4.0
8. （可选）Vercel 预览部署 + 冒烟；无权限时记录本地冒烟结果
```

### 4.8 清理清单

| 对象 | 处理 | 说明 |
|------|------|------|
| `client-taro-broken/` | 删除 | 早期 Taro 残留，37 个文件，不参与构建 |
| `test-game.html` | 删除 | 根目录临时测试页 |
| `temp/v3.2/*.mjs` | 删除 | 已迁移到 `tests/`；历史报告保留 |
| `temp/v3.3/*.mjs` | 删除 | 已迁移到 `tests/`；报告/截图保留 |
| `temp/v3.1` 报告 | 保留 | 历史 UAT 证据 |
| `.npm-cache/` | 加入 `.gitignore` | 本机 npm 缓存，禁止入库 |
| `server/test-generate.ts` | 保留 | 真实模型手工冒烟入口，不参与 CI |

> 删除均通过 `git rm` 提交，历史可追溯；不删除任何 UAT 报告、截图或构建脚本。

---

## 5. 兼容性与安全

### 5.1 兼容性

| 对象 | 影响 |
|------|------|
| 前端用户 | 无变化；本版本不改 UI、不改交互、不改本地数据结构 |
| API 请求/响应 | 无变化；契约测试锁定关键字段 |
| 本地开发 | `npm run dev` / `cd server && npm run dev` 不变 |
| Vercel 部署 | `api/` 文件仍自包含；`vercel.json` 不改 |
| 旧作品/旧设置 | 存储层不改，读取逻辑不变 |
| Node 版本 | CI 使用 Node 20；本地已验证 Node 24 |

### 5.2 安全

- 测试桩只监听 `127.0.0.1`/随机端口，不对外暴露。
- 测试中的 API Key 使用固定假值 `test-key`，断言不会出现在响应中。
- CI 不注入真实 `VOLCENGINE_API_KEY`；集成测试显式覆盖环境变量。
- 删除 Taro 目录不涉及运行时密钥；`.env` 仍被 `.gitignore` 忽略。

---

## 6. 测试策略

| 层级 | 内容 | 位置 | 是否进 CI |
|------|------|------|-----------|
| 类型 | 根 TS/TSX + server TS | `tsconfig.json`、`server/tsconfig.json` | ✅ |
| 构建 | Vite 生产构建 | `npm run build` | ✅ |
| 单元 | 存储、模型工具、Remix 规则 | `tests/unit/*` | ✅ |
| 集成 | 生成、Remix（真实 Hono 路由 + 测试桩） | `tests/integration/*` | ✅ |
| 契约 | 生产 `api/generate.ts` 直调 | `tests/contract/*` | ✅ |
| 一致性 | 内联模型、版本/文档 | `scripts/*` | ✅ |
| 冒烟 | 构建产物首页/路由 | `scripts/smoke-preview.mjs` | ✅ |
| 真实模型 | 手工冒烟（消耗额度） | `server/test-generate.ts` | ❌ |
| 浏览器 UI | 手工回归（不改 UI，仅抽查） | UAT 文档 | ❌ |

通过标准：

- `npm run ci` 退出码 0；
- 三条核心路径用例全部通过；
- 无 P0/P1 缺陷；
- 版本号、CHANGELOG、tag 一致。

---

## 7. 风险与后续

| 风险 | 影响 | 缓解 |
|------|------|------|
| 根 `tsconfig` 首次开启暴露大量历史类型问题 | 阻塞 CI | 只修类型不修行为；必要时对确无运行影响的文件用最小 `// @ts-expect-error` 并记录（优先修根因） |
| 集成测试端口/进程在 CI 不稳定 | 偶发红 | 动态端口 + 就绪轮询 + 超时杀进程 + 失败输出日志 |
| `api/` 与 `server/` 双实现继续漂移 | 本地/线上行为不一致 | 契约测试覆盖关键字段；V3.5 再做拆分与完整契约 |
| 删除 Taro 目录被误认为功能回退 | 误解 | CHANGELOG/README 明确“废弃残留清理”，git 历史可恢复 |
| 无 Vercel 权限，无法做线上预览 | 发布证据不足 | 本地 `vite preview` 冒烟 + 记录未执行原因；不伪造线上结果 |
| 测试桩与真实模型行为差异 | 测试通过但线上失败 | 保留真实模型手工冒烟；CI 只验证协议与业务分支 |

后续版本衔接：

- **V3.5**：拆分 `api/generate.ts`，把本版本的契约测试扩展为完整双端契约；建立性能/成本基线。
- **V3.6**：存储抽象、数据模型版本化、配置外置；本版本的存储测试作为回归基线。
- **V4.0**：生成质量闭环；本版本的 CI 作为黄金 Prompt 集的执行载体。

---

## 8. 文件清单

| 文件 | 变更 |
|------|------|
| `docs/design-v3.4.md` | 新增（本文件） |
| `docs/uat-v3.4.md` | 新增 |
| `CHANGELOG.md` | 新增 |
| `tsconfig.json` | 新增根类型检查配置 |
| `package.json` | 版本 3.4.0；新增 typecheck/test/ci/check/smoke 脚本；新增 tsx/typescript |
| `server/package.json` | 版本 3.4.0 |
| `.github/workflows/ci.yml` | 新增 CI |
| `scripts/inline-api-model.mjs` | 由 `temp/v3.2/` 迁移并增加 `--check` |
| `scripts/check-docs.mjs` | 新增 |
| `scripts/run-tests.mjs` | 新增 |
| `scripts/smoke-preview.mjs` | 新增 |
| `tests/support/*` | 新增测试桩、后端生命周期、样本 |
| `tests/unit/*` | 迁移并补强存储/模型/Remix 单元测试 |
| `tests/integration/*` | 新增生成/Remix 集成测试 |
| `tests/contract/*` | 新增生产函数契约测试 |
| `api/_model.ts`、`api/generate.ts`、`api/models/*.ts` | 仅更新内联来源注释（行为不变） |
| `README.md`、`DEPLOY.md`、`docs/proposal.md` | 版本、命令、目录、验收状态同步 |
| `docs/design-v3.2/3.3.md`、`docs/uat-v3.2/3.3.md` | 增加测试脚本迁移说明，避免引用已删除的 `temp/*.mjs` |
| `client-taro-broken/`、`test-game.html` | 删除 |
| `temp/v3.2/*.mjs`、`temp/v3.3/*.mjs` | 删除（已迁移），报告保留 |
