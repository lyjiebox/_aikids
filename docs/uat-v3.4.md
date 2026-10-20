# UAT: AI 儿童创意游戏平台 V3.4（工程收敛）

> 版本：v3.4
> 对应文档：`docs/proposal.md`、`docs/design-v3.4.md`
> 编写日期：2026-10-20
> 验收方式：静态检查 + 类型检查 + 构建 + 单元测试 + 集成测试 + 生产函数契约测试 + 构建产物冒烟 + 文档一致性检查 + 发布检查
> 说明：本版本不改变用户可见需求，因此 UAT 以“工程流水线是否可重复、可阻断”和“三条核心路径是否有稳定回归”为主；UI 只做不回归抽查。

---

## 目录

1. [测试环境](#1-测试环境)
2. [验收准则总表](#2-验收准则总表)
3. [类型检查与构建](#3-类型检查与构建)
4. [单元测试](#4-单元测试)
5. [生成路径](#5-生成路径)
6. [Remix 路径](#6-remix-路径)
7. [存储路径](#7-存储路径)
8. [生产函数契约](#8-生产函数契约)
9. [CI 流水线](#9-ci-流水线)
10. [构建产物冒烟](#10-构建产物冒烟)
11. [文档与版本一致性](#11-文档与版本一致性)
12. [发布检查](#12-发布检查)
13. [回归抽查](#13-回归抽查)
14. [BUG 修复确认表](#14-bug-修复确认表)
15. [执行记录](#15-执行记录)

---

## 1. 测试环境

### 1.1 软件环境

| 项目 | 版本 |
|------|------|
| Node.js | >= 20（CI 使用 20，本地 v24.18.0） |
| 包管理器 | npm 10+（本地 11.16.0） |
| 前端 | Vite 5 + React 18 |
| 后端 | Hono（本地 `server/` 与 Vercel `api/` 双实现） |
| 测试运行器 | Node 内置 `node:test` + `tsx` |
| CI | GitHub Actions `ubuntu-latest` |
| 浏览器（仅手工抽查） | Chrome 最新稳定版 |

### 1.2 测试资产

| 资产 | 路径 | 说明 |
|------|------|------|
| 测试桩 | `tests/support/stub-model-server.mjs` | 进程内启动，随机端口，OpenAI 兼容 |
| 后端生命周期 | `tests/support/backend.mjs` | 子进程启动 `server/`，动态端口，自动清理 |
| 样本 | `tests/support/fixtures.mjs` | 标准 DOM 游戏、Canvas 游戏、超长游戏 |
| 测试运行器 | `scripts/run-tests.mjs` | 发现 `tests/**/*.test.mjs` 并执行 |
| 真实模型手工冒烟 | `server/test-generate.ts` | 需要真实 `.env`，不进 CI |

### 1.3 前置条件

```bash
npm install
(cd server && npm install)
```

不需要真实 API Key；CI/本地自动测试全部使用固定假值 `test-key` 与本地测试桩。真实模型验收（可选）才需要配置根目录 `.env`。

---

## 2. 验收准则总表

| ID | 验收项 | 优先级 | 通过标准 |
|----|--------|--------|----------|
| UAT-3.4-01 | 根类型检查 | P0 | `npm run typecheck` 退出码 0 |
| UAT-3.4-02 | 前端生产构建 | P0 | `npm run build` 成功，`dist/index.html` 存在 |
| UAT-3.4-03 | 本地后端构建 | P0 | `npm --prefix server run build` 成功 |
| UAT-3.4-04 | 存储路径测试 | P0 | `tests/unit/storage.test.mjs` 全部通过 |
| UAT-3.4-05 | 模型工具测试 | P1 | `tests/unit/model-utils.test.mjs` 全部通过 |
| UAT-3.4-06 | Remix 规则测试 | P0 | `tests/unit/remix-core.test.mjs` 全部通过 |
| UAT-3.4-07 | 生成路径测试 | P0 | `tests/integration/generate.test.mjs` 全部通过 |
| UAT-3.4-08 | Remix 路径测试 | P0 | `tests/integration/remix.test.mjs` 全部通过 |
| UAT-3.4-09 | 生产函数契约 | P0 | `tests/contract/production-api.test.mjs` 全部通过 |
| UAT-3.4-10 | 内联模型一致 | P0 | `npm run check:inline` 退出码 0 |
| UAT-3.4-11 | 文档/版本一致 | P0 | `npm run check:docs` 退出码 0 |
| UAT-3.4-12 | 构建产物冒烟 | P1 | `npm run smoke:preview` 退出码 0，首页与 `/create` 返回 200 |
| UAT-3.4-13 | CI 工作流 | P0 | `.github/workflows/ci.yml` 语法有效，步骤覆盖 01–12 |
| UAT-3.4-14 | 历史遗留清理 | P1 | `client-taro-broken/`、`test-game.html` 不再被跟踪 |
| UAT-3.4-15 | CHANGELOG + tag | P0 | `CHANGELOG.md` 含 3.4.0；`git tag` 含 `v3.4.0` |
| UAT-3.4-16 | 真实模型手工冒烟（可选） | P2 | `cd server && npx tsx test-generate.ts` 成功（不阻断发布） |
| UAT-3.4-17 | UI 不回归抽查 | P1 | 首页、生成、Play、Gallery、Models 可打开，控制台无新增报错 |

---

## 3. 类型检查与构建

### 3.1 UAT-3.4-01 根类型检查

```bash
npm run typecheck
```

预期：

- 先执行 `tsc -p tsconfig.json --noEmit`，再执行 `tsc -p server/tsconfig.json --noEmit`；
- 覆盖 `api/**/*.ts`、`src/**/*.ts`、`src/**/*.tsx`、`server/src/**/*.ts`；
- 退出码 0，无 error。

失败处理：只做不改变运行时行为的类型修正；不允许用大范围 `any` 或关闭 `strict` 绕过。

### 3.2 UAT-3.4-02 前端生产构建

```bash
npm run build
test -f dist/index.html
```

预期：Vite 构建成功，`dist/index.html` 与 `dist/assets/*` 生成；构建日志无 error。

### 3.3 UAT-3.4-03 本地后端构建

```bash
npm --prefix server run build
```

预期：`server/dist/index.js` 生成，退出码 0。

---

## 4. 单元测试

### 4.1 UAT-3.4-04 存储路径（`STORAGE-*`）

```bash
node --import tsx --test tests/unit/storage.test.mjs
```

| 用例 | 断言 |
|------|------|
| STORAGE-01 | 作品保存/读取往返；旧作品补 `remixCount=0` |
| STORAGE-02 | 损坏 JSON / 非数组 / 空值返回安全默认值，不抛异常 |
| STORAGE-03 | 设置保存/读取往返 |
| STORAGE-04 | 自定义模型非法条目丢弃、重复 ID 去重、最多 20 条 |
| STORAGE-05 | `saveCustomModels` 写入上限 20 条 |
| STORAGE-06 | `localStorage.setItem` 抛异常时不崩溃 |

通过标准：全部通过，失败时退出码非 0。

### 4.2 UAT-3.4-05 模型工具（`MODEL-*`）

```bash
node --import tsx --test tests/unit/model-utils.test.mjs
```

覆盖：常量、ID 生成、Key 脱敏、URL/本地地址判断、表单校验（空/超长/重名/非法地址/非 HTTPS/重复 endpoint）、展示文案、请求参数、不可用模型回退。

### 4.3 UAT-3.4-06 Remix 规则（`UNIT-*`）

```bash
node --import tsx --test tests/unit/remix-core.test.mjs
```

覆盖：档案提取（DOM/Canvas）、标题回退、Prompt 组装、源码预算与 outline、preview/none、审计、兜底、注入转义、超长指令截断、前后端档案一致性。

---

## 5. 生成路径

### 5.1 UAT-3.4-07（`GEN-*`）

```bash
node --import tsx --test tests/integration/generate.test.mjs
```

测试自动完成：

1. 启动测试桩（随机端口）；
2. 子进程启动 `server/`（随机端口，指向测试桩）；
3. 执行用例；
4. 关闭后端与测试桩。

| 用例 | 请求 | 预期 |
|------|------|------|
| GEN-01 | 正常生成（custom model） | 200、`success=true`、`gameHtml` 含 `<html`、`modelSource=custom`、无 `remixMode/remixAudit/remixFallback` |
| GEN-02 | 捕获上游请求 | System Prompt 含 V3.1 规则；`max_tokens=8192`；User Prompt 含模板提示 |
| GEN-03 | `userPrompt=""` | 400、`success=false`、中文提示 |
| GEN-04 | 非法 JSON body | 400、`success=false` |
| GEN-05 | 自定义模型 `http://evil.example.com` | 400、提示域名不在白名单 |
| GEN-06 | 上游 500（非 Remix） | 200、`engine=mock`、`warning` 含“降级为本地模板” |
| GEN-07 | `GET /api/models` | 200、返回内置模型目录、响应不含 `test-key`/`apiKey` |

### 5.2 重复执行

同一命令连续执行 3 次，预期结果一致，无端口占用、无残留进程。

---

## 6. Remix 路径

### 6.1 UAT-3.4-08（`REMIX-*`）

```bash
node --import tsx --test tests/integration/remix.test.mjs
```

| 用例 | 场景 | 预期 |
|------|------|------|
| REMIX-01 | 完整源码 Remix | `remixMode=full`、含 BOSS、`remixProfile` 正确、`remixAudit.preserved=true` |
| REMIX-02 | 捕获 Prompt | 含 `<game_source>` 完整源码、标题/模板/交互/得分/胜负、改编指令、`max_tokens=16384` |
| REMIX-03 | 超长源码 | `remixMode=outline`、含片段 1/3…3/3 与“未展示”、中间 marker 不注入 |
| REMIX-04 | 仅 preview | `remixMode=preview`、Prompt 含“少量源码预览”“不完整” |
| REMIX-05 | 上游 500 | 200、`remixFallback=true`、`remixMode=fallback`、`gameHtml` 与原 HTML 完全一致 |
| REMIX-06 | 删除得分 | `remixAudit.scorePreserved=false`、`preserved=false`，仍返回游戏 |
| REMIX-07 | 纯 HTML 输出 | 可解析、含 BOSS、审计通过 |
| REMIX-08 | 非字符串源码 | 不 500，正常返回 |
| REMIX-09 | 无模型环境 | 启动独立后端（清空模型变量），`remixFallback=true`、原样返回 |
| REMIX-10 | 响应安全 | 不含 `test-key`、`apiKey` |

### 6.2 重复执行

同 5.2，连续执行 3 次结果一致。

---

## 7. 存储路径

见 UAT-3.4-04。补充手工核对（浏览器 DevTools，可选）：

1. 生成一个作品后刷新页面，作品仍在（`aikids-works`）。
2. 添加自定义模型后刷新，模型仍在（`aikids-models`）。
3. 修改家长设置后刷新，设置仍在（`aikids-settings`）。
4. 手动写入损坏 JSON 后刷新，页面不白屏，读取为空默认值。

---

## 8. 生产函数契约

### 8.1 UAT-3.4-09

```bash
node --import tsx --test tests/contract/production-api.test.mjs
```

测试直接 `import { POST } from '../../api/generate.ts'`，构造标准 `Request` 调用，不经过 Vercel：

| 用例 | 断言 |
|------|------|
| CONTRACT-01 | 普通生成成功，关键字段与本地后端一致（`success/gameHtml/modelSource`） |
| CONTRACT-02 | Remix full 成功，`remixMode/remixProfile/remixAudit` 正确 |
| CONTRACT-03 | 空 prompt 返回 400 |
| CONTRACT-04 | 响应不回显 Key |

通过标准：全部通过；若失败，说明 `api/` 与 `server/` 出现行为漂移，必须在 V3.4 修复或记录为 V3.5 阻塞项。

---

## 9. CI 流水线

### 9.1 UAT-3.4-13 工作流静态检查

```bash
node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!/typecheck/.test(y)||!/npm test/.test(y)||!/smoke:preview/.test(y))process.exit(1);console.log('ci.yml OK')"
```

预期：输出 `ci.yml OK`。

### 9.2 本地等价执行

```bash
npm run ci
```

预期：依次通过 typecheck → build → build:server → test → check:inline → check:docs → smoke:preview，退出码 0。

### 9.3 GitHub Actions

| 场景 | 预期 |
|------|------|
| push 到 `main` | workflow 触发，verify job 全绿 |
| 新建 PR | workflow 触发，verify job 全绿，可作为合并前置 |
| 任一检查失败 | job 红，PR 不可合并（需在仓库设置开启 branch protection） |

> 若本轮无 GitHub 推送权限，记录“工作流已落地、本地等价命令全绿；远端运行待推送后确认”，不伪造远端结果。

---

## 10. 构建产物冒烟

### 10.1 UAT-3.4-12

```bash
npm run smoke:preview
```

脚本行为：

1. 确认 `dist/index.html` 存在；
2. 启动 `vite preview`（随机/指定端口），等待就绪；
3. 请求 `/` 与 `/create`，断言 200 且返回 HTML；
4. 请求一个不存在的静态资源，断言返回 SPA fallback（200 HTML）或 404，不 500；
5. 关闭 preview 进程。

通过标准：退出码 0，输出 `smoke OK`。

---

## 11. 文档与版本一致性

### 11.1 UAT-3.4-11

```bash
npm run check:docs
```

检查项：

| 检查 | 预期 |
|------|------|
| 根/`server` 版本号 | 均为 `3.4.0` |
| CHANGELOG | 含 `## [3.4.0]` |
| design/uat | `docs/design-v3.4.md`、`docs/uat-v3.4.md` 存在 |
| README | 提到 `3.4.0` |
| npm scripts | `typecheck/test/ci/check:inline/check:docs` 均存在 |
| 测试资产 | unit/integration/contract 测试文件均存在 |

### 11.2 人工一致性抽查

| 文档 | 检查 |
|------|------|
| `docs/proposal.md` | V3.4 条目的 ✅/🚧 状态与实际一致；路线图未回退 |
| `README.md` | 目录结构、测试命令、版本号与仓库一致 |
| `DEPLOY.md` | 部署步骤未引用已删除脚本 |
| `docs/design-v3.4.md` | 文件清单与实际改动一致 |
| `docs/uat-v3.4.md` | 用例 ID 与测试文件/断言一致 |

---

## 12. 发布检查

### 12.1 UAT-3.4-15

```bash
grep -n "3.4.0" CHANGELOG.md
git tag --list "v3.4.0"
git status --short
```

预期：

- CHANGELOG 含 `## [3.4.0] - 2026-10-20`；
- `git tag --list` 输出 `v3.4.0`；
- `git status` 干净（除已说明的本机忽略文件）。

### 12.2 回滚

```bash
git checkout v3.3.0 -- .   # 若存在 v3.3.0 tag
# 或
git revert <v3.4.0 commit>
```

本版本不包含数据迁移，回滚不需要清理 localStorage。

---

## 13. 回归抽查

### 13.1 UAT-3.4-17 UI 抽查（P1）

| 页面 | 检查 |
|------|------|
| 首页 `/` | 正常渲染，模型选择器可用，模板可选 |
| 创作 `/create` | 输入文字/语音入口可见，生成流程可发起（可用真实模型或本地桩） |
| 播放 `/play/:id` | 已有作品可打开，iframe 沙箱属性仍为 `allow-scripts` |
| 画廊 `/gallery` | 作品列表、删除、Remix 入口正常 |
| 设置 `/settings` | 家长验证、模型配置、高级配置入口正常 |
| 模型 `/models` | 内置/自定义模型列表、测试按钮正常 |

本版本未改 UI 代码，抽查以“无新增控制台错误、关键入口可达”为准。

### 13.2 历史用例

- V3.1 System Prompt 规则：由 `tests/unit/remix-core.test.mjs` 的 System Prompt 断言与生成 Prompt 断言覆盖。
- V3.2 模型选择/校验：由 `tests/unit/model-utils.test.mjs` 与 `tests/integration/generate.test.mjs` 覆盖。
- V3.3 Remix：由 `tests/unit/remix-core.test.mjs`、`tests/integration/remix.test.mjs`、`tests/contract/production-api.test.mjs` 覆盖。

---

## 14. BUG 修复确认表

| BUG ID | 描述 | 根因 | 修复 | 复测结果 |
|--------|------|------|------|----------|
| BUG-3.4-01 | `check:docs` 报缺少 `docs/design-3.4.md` | 版本短号少了 `v` 前缀 | 改为 `docs/design-v${shortVersion}.md` | UAT-3.4-11 通过 |
| BUG-3.4-02 | 内联脚本 `--check` 始终失败，且每次写入多一个空行 | 移除旧内联块时未消费块后的换行，导致非幂等 | 正则改为消费 `END` 后的全部换行 | UAT-3.4-10 通过 |
| BUG-3.4-03 | 根 typecheck 在 `Create.tsx` 报 13 个错误 | `useState(null)` 推断为 `null`、Remix 上下文/引擎状态缺类型、`api.js` JSDoc 缺 Remix 字段 | 补 JSDoc typedef 与本地类型，仅类型修正、不改运行时行为 | UAT-3.4-01 通过 |
| BUG-3.4-04 | `design-v3.3.md` 仍把「后处理增强引擎」写成 V3.4 | 路线重组后未回改旧文档 | 修正为 V4.0，并注明原规划 | UAT-3.4-11 人工抽查通过 |
| BUG-3.4-05 | `DEPLOY.md` 引用不存在的 `npm run install:all` / 单命令启动前后端 | 历史脚手架残留 | 改为 `npm install` + `npm install --prefix server` + 双终端启动 | 人工核对通过 |
| BUG-3.4-06 | 两个 `package-lock.json` 版本仍为 3.3.0 / 3.2.0 | 改版本号时未刷新 lockfile | `npm install --package-lock-only` 刷新为 3.4.0 | `npm ci --dry-run` 双端通过 |

---

## 15. 执行记录

> 执行时间：2026-10-20 19:57（Asia/Shanghai）
> 执行人：开发（自动化）
> 环境：macOS，Node v24.18.0，npm 11.16.0，Chrome Headless（最新稳定版）
> 总命令：`npm run ci` → 退出码 0

| 验收项 | 命令 | 结果 | 证据 |
|--------|------|------|------|
| UAT-3.4-01 | `npm run typecheck` | ✅ 通过 | 根 TS/TSX 与 server TS 均无 error，退出码 0 |
| UAT-3.4-02 | `npm run build` | ✅ 通过 | Vite 5.4.21，67 modules，`dist/index.html` + JS/CSS 生成 |
| UAT-3.4-03 | `npm --prefix server run build` | ✅ 通过 | `server/dist/index.js` 生成 |
| UAT-3.4-04~06 | `npm test`（unit） | ✅ 通过 | 模型 14/14、Remix 37/37、存储 12/12；Node test 3/3 |
| UAT-3.4-07~08 | `npm test`（integration） | ✅ 通过 | GEN 7/7、REMIX 10/10，动态端口、无残留进程 |
| UAT-3.4-09 | `npm test`（contract） | ✅ 通过 | CONTRACT 4/4，直接调用生产 `POST` |
| UAT-3.4-10 | `npm run check:inline` | ✅ 通过 | 三个 `api/` 文件均 `ok` |
| UAT-3.4-11 | `npm run check:docs` | ✅ 通过 | `version=3.4.0, design=docs/design-v3.4.md, uat=docs/uat-v3.4.md, tests=6` |
| UAT-3.4-12 | `npm run smoke:preview` | ✅ 通过 | 首页 200、`/create` 200、JS 资源 200、缺失资源 < 500 |
| UAT-3.4-13 | workflow 静态检查 + `npm run ci` | ✅ 通过（本地） | `ci.yml OK`；`npm run ci` 退出码 0；远端 Actions 待推送后确认 |
| UAT-3.4-14 | `git ls-files` 抽查 | ✅ 通过 | Taro 0 文件、`test-game.html` 0 文件、`temp/**/*.mjs` 0 文件 |
| UAT-3.4-15 | `git tag --list "v3.4.0"` | ⏳ 待发布步骤 | 提交后创建 annotated tag 并回填哈希 |
| UAT-3.4-16 | `cd server && npx tsx test-generate.ts` | ⏭️ 未执行（P2） | 会消耗真实模型额度；本版本未改生成逻辑，CI 以测试桩覆盖协议与分支 |
| UAT-3.4-17 | Chrome Headless 路由抽查 | ✅ 通过 | `/`、`/create`、`/gallery`、`/settings`、`/settings/models`、`/play/demo` 均渲染预期内容 |

### 15.3 补充证据

- `npm ci --dry-run`（根 + `server/`）均退出码 0，lockfile 与依赖声明一致。
- 构建产物冒烟时 `vite preview` 自动停止，无端口占用。
- Chrome Headless 抽查时后端未启动，首页模型选择器显示预期的「API 请求失败」提示；这是预览环境无 API 的预期表现，不是回归缺陷（`/create` 等页面渲染正常）。
- Vercel 线上预览：本机未安装/登录 Vercel CLI（无 `~/.vercel`），本轮以本地 `vite preview` 冒烟替代；未伪造线上结果。推送后由 Vercel 自动构建，GitHub Actions 确认 CI。

### 15.1 通过标准

- P0 用例 100% 通过；
- P1 用例 100% 通过（或记录合理的环境限制，如无 Vercel 权限）；
- P2 用例不阻断发布；
- `npm run ci` 退出码 0；
- 所有失败项修复后复测，不以“已知问题”带病发布。

### 15.2 验收失败处理

1. 记录失败用例、实际输出、日志。
2. 定位是代码缺陷、测试缺陷还是环境问题。
3. 修复后重跑该用例 + 全量 `npm run ci`。
4. 若需求/设计需调整，同步更新 `docs/design-v3.4.md` 与本文件的用例。
