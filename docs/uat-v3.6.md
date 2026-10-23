# UAT: AI 儿童创意游戏平台 V3.6（扩展性缝）

> 版本：v3.6
> 对应文档：`docs/proposal.md`、`docs/design-v3.6.md`
> 编写日期：2026-10-23
> 验收方式：类型检查 + 构建 + 单元/集成/契约测试 + 配置外置静态检查 + 存储/导入导出/telemetry 单元验证 + Settings 手工 UAT + 构建冒烟 + 生产冒烟
> 说明：本版本不改变主流程；UAT 重点是「旧数据不丢、导出可完整恢复、配置可外置、事件只在本机」。

---

## 目录

1. [测试环境](#1-测试环境)
2. [验收准则总表](#2-验收准则总表)
3. [配置外置](#3-配置外置)
4. [存储与数据模型](#4-存储与数据模型)
5. [导出与导入](#5-导出与导入)
6. [本地 Telemetry](#6-本地-telemetry)
7. [V5.1 迁移准备](#7-v51-迁移准备)
8. [Settings 手工 UAT](#8-settings-手工-uat)
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
| 打包 | esbuild 0.21.x（`api/`）；tsc（`server/`） |
| 测试 | Node 内置 `node:test` + `tsx` |
| 浏览器 | Chrome 最新稳定版（手工 UAT） |
| CI | GitHub Actions `ubuntu-latest` |

测试资产：

| 资产 | 路径 | 说明 |
|------|------|------|
| 存储/备份单元 | `tests/unit/storage-schema.test.mjs` | schema、UUID、导入/导出/合并、云端迁移 |
| Telemetry 单元 | `tests/unit/telemetry.test.mjs` | 事件、环形上限、脱敏、导出 |
| 配置单元 | `tests/unit/config.test.mjs` | 模板/ Prompt /模型清单结构 |
| 迁移 CLI | `scripts/migrate-storage.mjs` | 本地备份 → 云端迁移 JSON |
| 样例备份 | `temp/v3.6/backup-sample.json` | 含 2 个旧作品、1 个自定义模型 |

前置条件：

```bash
npm ci
npm ci --prefix server
```

自动测试不需要真实 Key；生产冒烟中的生成/Remix 需要 Vercel 已配置 Key（或明确记录未验证）。

---

## 2. 验收准则总表

| ID | 验收项 | 优先级 | 通过标准 |
|----|--------|--------|----------|
| UAT-3.6-01 | 配置外置 | P0 | 模板/Prompt/模型清单来自 `shared/config/*.ts`；业务代码不再内联这些常量 |
| UAT-3.6-02 | 配置三端构建 | P0 | Vite / esbuild / tsc 均可使用 shared 配置；`npm run typecheck`、`build`、`build:server`、`check:inline` 通过 |
| UAT-3.6-03 | Prompt 零漂移 | P0 | 普通 / Remix System Prompt 与 V3.5 文本一致（测试锁定关键字与输出上限） |
| UAT-3.6-04 | 旧作品保留 ID | P0 | 加载含时间戳 ID 的旧作品后 ID 不变；旧作品可打开、可 Remix |
| UAT-3.6-05 | 新作品 UUID | P0 | 新生成作品 ID 为 UUID v4；Remix 作品同样 |
| UAT-3.6-06 | 数据模型字段 | P0 | 作品含 `schemaVersion=1`、`ownerId=null`、`visibility=private`（旧作品补默认值，ID 不变） |
| UAT-3.6-07 | 存储层集中 | P0 | localStorage 读写只在 `storage.js`；schema/合并逻辑为纯函数可单测 |
| UAT-3.6-08 | 导出完整 | P0 | Settings 导出的 JSON 含作品、设置、自定义模型与 API Key；`kind/schemaVersion/exportedAt` 正确 |
| UAT-3.6-09 | 导入合并 | P0 | 重复作品/模型跳过；设置合并；摘要计数正确；现有数据不丢 |
| UAT-3.6-10 | 导入覆盖 | P1 | 二次确认后完全替换；摘要与结果一致 |
| UAT-3.6-11 | 导入容错 | P0 | 非法 JSON / 超大文件 / 未来版本 / 错误 kind 被拒绝且数据不变 |
| UAT-3.6-12 | 旧格式兼容导入 | P1 | 裸作品数组、旧 `{works,settings,models}` 可导入 |
| UAT-3.6-13 | 导出含 Key 提示 | P0 | Settings 显著提示「备份含 API Key」；导出文件不回显到控制台 |
| UAT-3.6-14 | Telemetry 结构 | P0 | `generate/play/remix/failure` 四类事件字段符合 schema；事件含 `schemaVersion/id/at` |
| UAT-3.6-15 | Telemetry 上限 | P0 | 超过 200 条丢最旧；写入异常静默 |
| UAT-3.6-16 | Telemetry 脱敏 | P0 | 不含 Prompt 全文、游戏 HTML、API Key、完整接口地址 |
| UAT-3.6-17 | Telemetry 不上报 | P0 | 无网络请求；服务端无 telemetry 路由；仅 localStorage + 手动导出 |
| UAT-3.6-18 | 采集点覆盖 | P1 | 生成、试玩、Remix、失败各至少产生 1 条事件（手工/单测） |
| UAT-3.6-19 | 云端迁移脚本 | P0 | CLI 可把备份转为迁移 JSON；作品 ID 保留、`ownerId` 生效、无 `apiKey` |
| UAT-3.6-20 | 迁移兼容策略 | P1 | Design 明确 V5.1 读取兼容/ID 幂等/密钥不迁移/降级策略 |
| UAT-3.6-21 | Settings 入口 | P0 | 未过 ParentGate 不可见；验证后出现备份与诊断日志区块 |
| UAT-3.6-22 | 无主流程回归 | P0 | 首页/创作/播放/画廊/模型配置主流程与布局不变；控制台无新增错误 |
| UAT-3.6-23 | 本地 CI | P0 | `npm run ci` 退出码 0 |
| UAT-3.6-24 | 文档一致 | P0 | `npm run check:docs` 通过，版本 3.6.0 |
| UAT-3.6-25 | 远端 CI | P0 | push 后 GitHub Actions verify 绿（无权限时如实记录） |
| UAT-3.6-26 | 生产冒烟 | P0 | `boxaikids.top` 首页 200、`/api/models` 正常、无 500 |
| UAT-3.6-27 | 发布记录 | P0 | CHANGELOG 3.6.0、proposal 状态更新、tag（可选） |

---

## 3. 配置外置

### 3.1 UAT-3.6-01 静态检查

```bash
ls shared/config
grep -rn "SYSTEM_PROMPT\|REMIX_SYSTEM_PROMPT\|BUILTIN_MODEL_DEFS\|GAME_TEMPLATES" shared/config server/src src/config
grep -rn "const SYSTEM_PROMPT\|const REMIX_SYSTEM_PROMPT\|const ENV_MODEL_DEFS" server/src
```

通过标准：

- `shared/config/{templates,prompts,models}.ts` 存在；
- Prompt/模型/模板常量定义只在 shared；
- `server/src` 只 import 或 re-export，不再内联长 Prompt。

### 3.2 UAT-3.6-02 三端构建

```bash
npm run typecheck
npm run build
npm run build:server
npm run check:inline
ls server/dist/server/src/index.js server/dist/shared/config 2>/dev/null
```

通过标准：

- 四条命令退出码 0；
- `api/*.ts` 与源码一致（`check:inline` 三个 ok）；
- `server/dist` 包含 `server/src/index.js` 与 `shared/config/*.js`，`npm start --prefix server` 可启动（本地验证）。

### 3.3 UAT-3.6-03 Prompt 零漂移

```bash
node --import tsx --input-type=module -e "
const {SYSTEM_PROMPT,GENERATION_MAX_TOKENS,GENERATION_TEMPERATURE}=await import('./server/src/services/prompt.ts');
const {REMIX_SYSTEM_PROMPT}=await import('./server/src/services/remix.ts');
console.log(SYSTEM_PROMPT.includes('至少包含 3 种交互'), SYSTEM_PROMPT.includes('严格输出 JSON'));
console.log(REMIX_SYSTEM_PROMPT.includes('Remix 模式'), REMIX_SYSTEM_PROMPT.includes('不是从零创作'));
console.log(GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE);
"
```

通过标准：全部 `true`；`8192 0.7`；Remix 输出上限默认仍为 `16384`。

---

## 4. 存储与数据模型

### 4.1 UAT-3.6-04 旧作品 ID 保留

```bash
node --import tsx --test tests/unit/storage-schema.test.mjs
```

用例断言：

- `normalizeWork({ id: '1700000000000', title: '旧作品' })` → `id === '1700000000000'`；
- 补齐 `schemaVersion=1`、`ownerId=null`、`visibility='private'`；
- 缺失 ID 的作品获得 UUID v4。

手工补充：

1. 在 DevTools 写入一条 `aikids-works` 旧记录（ID 为时间戳）；
2. 刷新 `/gallery`，卡片可见，点击 `/play/<旧ID>` 正常；
3. 旧作品 Remix 后，来源 ID 仍为旧 ID。

### 4.2 UAT-3.6-05 新作品 UUID

1. 首页 → 创作 → 生成一个作品；
2. 地址栏 `/play/<id>` 中 `<id>` 为 `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`；
3. Gallery 卡片可打开；Remix 后同样为 UUID。

### 4.3 UAT-3.6-06 数据模型字段

DevTools：

```js
JSON.parse(localStorage.getItem('aikids-works'))[0]
```

通过标准：新作品含 `schemaVersion: 1`、`ownerId: null`、`visibility: "private"`；旧作品 ID 不变。

### 4.4 UAT-3.6-07 存储层集中

```bash
grep -rn "localStorage" src --include=*.js --include=*.jsx --include=*.ts --include=*.tsx
```

通过标准：`localStorage` 只出现在 `src/services/storage.js`、`src/services/telemetry.js`、`src/pages/Settings.jsx`（`aikids-parent-verified` 会话标记）与 `Create/Play` 的 `sessionStorage`（非 localStorage）。页面不直接读写作品/模型/设置 key。

---

## 5. 导出与导入

### 5.1 UAT-3.6-08 导出完整

1. Settings → 验证 → 添加 1 个自定义模型（含 Key）→ 生成 1 个作品；
2. 点击「导出全部数据」；
3. 打开下载文件：

```json
{
  "kind": "aikids-export",
  "app": "aikids",
  "schemaVersion": 1,
  "exportedAt": "...",
  "data": { "works": [...], "settings": {...}, "models": [...] }
}
```

通过标准：

- JSON 可解析；作品数、模型数、设置与页面一致；
- `models[0].apiKey` 存在（明确决策）；
- 控制台无导出内容日志。

### 5.2 UAT-3.6-09 合并导入

1. 导出备份 A；
2. 删除 1 个作品、添加 1 个新作品（制造差异）；
3. 导入备份 A → 选择「合并导入」；
4. 检查作品数与摘要。

通过标准：

- 已存在的作品不重复；
- 备份中缺失的作品被补回；
- 摘要 `worksAdded / worksSkipped / modelsAdded / modelsSkipped` 与实际一致；
- 设置按导入值合并；
- 页面不刷新即可看到变化。

### 5.3 UAT-3.6-10 覆盖导入

1. 再次导入备份 A → 选择「覆盖导入」；
2. 确认危险提示。

通过标准：作品/设置/模型完全等于备份 A；摘要 `mode=replace`；刷新后一致。

### 5.4 UAT-3.6-11 容错

| 输入 | 预期 |
|------|------|
| `{}` / 任意非备份 JSON | 行内错误「不是有效的备份文件」，数据不变 |
| 损坏 JSON | 行内错误「备份文件解析失败」，数据不变 |
| `{ "kind": "aikids-export", "schemaVersion": 99, ... }` | 提示来自更新版本，数据不变 |
| 60 MB 文件 | 提示文件过大，数据不变 |

### 5.5 UAT-3.6-12 旧格式兼容

```bash
node --import tsx --input-type=module -e "
const {parseImportPayload}=await import('./src/services/storage-schema.js');
console.log(parseImportPayload([{id:'w1',title:'旧'}]).ok);
console.log(parseImportPayload({works:[{id:'w2',title:'旧2'}]}).ok);
console.log(parseImportPayload({kind:'aikids-export',schemaVersion:1,data:{works:[]}}).snapshot.works.length);
"
```

通过标准：均 `true` / `0`，ID 保留。

---

## 6. 本地 Telemetry

### 6.1 UAT-3.6-14 / 15 / 16 单元

```bash
node --import tsx --test tests/unit/telemetry.test.mjs
```

覆盖：

| 用例 | 断言 |
|------|------|
| TEL-01 | 四类事件均可记录，含 `schemaVersion/id/at` |
| TEL-02 | 超过 200 条丢最旧，长度恒为 200 |
| TEL-03 | 恶意 payload 中的 `gameHtml/apiKey/userPrompt` 被丢弃 |
| TEL-04 | `message` 截断；`instructionChars` 只记录长度 |
| TEL-05 | 导出 envelope `kind=aikids-telemetry`、事件数组完整 |
| TEL-06 | localStorage 写入异常时静默返回，不抛出 |

### 6.2 UAT-3.6-17 不上报

```bash
grep -rn "fetch\|XMLHttpRequest\|sendBeacon" src/services/telemetry.js
grep -rn "telemetry" server/src api-src
```

通过标准：无网络调用；服务端无 telemetry 代码。

### 6.3 UAT-3.6-18 采集点手工

1. 生成 1 个作品 → `aikids-telemetry` 出现 `generate`（`ok=true`）；
2. 打开作品 → 出现 `play`；
3. 点击 Remix 并确认 → 出现 `remix`（只有 `instructionChars`）；
4. 断开本地后端后生成 → 出现 `failure`（`scope=generate`，带 `code`）；
5. Settings → 诊断日志条数与上述一致；导出 JSON 可解析。

---

## 7. V5.1 迁移准备

### 7.1 UAT-3.6-19 CLI

```bash
node scripts/migrate-storage.mjs temp/v3.6/backup-sample.json \
  --out temp/v3.6/cloud-migration-sample.json \
  --owner family-001
node -e "
const m=require('./temp/v3.6/cloud-migration-sample.json');
console.log(m.kind, m.schemaVersion, m.ownerId, m.works.length);
console.log(m.works[0].ownerId, m.works[0].visibility, m.works[0].id);
console.log(JSON.stringify(m.models).includes('apiKey'));
"
```

通过标准：

- `kind=aikids-cloud-migration`、`schemaVersion=1`、`ownerId=family-001`；
- 每个作品有 `ownerId/visibility/id`，ID 与本地一致；
- 输出不含 `apiKey`（最后一行 `false`）。

### 7.2 UAT-3.6-20 兼容策略

检查 Design 4.6.3 五条策略齐全，并在 UAT 报告中引用。

---

## 8. Settings 手工 UAT

### 8.1 UAT-3.6-21 入口

1. 清空 `sessionStorage.aikids-parent-verified` 后访问 `/settings`；
2. 未通过 ParentGate 时，备份/诊断区块不可见；
3. 通过验证后区块出现，顺序在「AI 模型配置」之后、「清空所有作品」之前。

### 8.2 UAT-3.6-22 主流程回归

| 页面 | 检查 |
|------|------|
| `/` | 标题、模板卡、模型选择器、大按钮正常 |
| `/create` | 选模板、语音/文字输入、生成按钮可用 |
| `/play/:id` | 旧作品与新 UUID 作品均可打开；iframe `sandbox="allow-scripts"` |
| `/gallery` | 列表、Remix 标签、删除弹窗正常 |
| `/settings` | 原时长滑杆、模型入口、清空按钮不变；新增区块可用 |
| `/settings/models` | 添加/编辑/删除/测试自定义模型不变 |

控制台：无新增 error；导出/导入不打印文件内容。

---

## 9. CI 与构建冒烟

### 9.1 UAT-3.6-23 本地 CI

```bash
npm run ci
```

依次：typecheck → build → build:server → test → check:inline → check:docs → smoke:preview。

### 9.2 UAT-3.6-24 文档检查

```bash
npm run check:docs
```

预期：`version=3.6.0`，design/uat 存在，新测试文件齐全，生成物 banner 正确。

### 9.3 UAT-3.6-25 远端 CI

```bash
git push origin main
gh run list --limit 1
gh run view <run-id> --log-failed   # 失败时
```

通过标准：verify 绿；红则修复后重推，不进入生产验收。

---

## 10. 生产冒烟

### 10.1 UAT-3.6-26

```bash
PROD_URL=https://boxaikids.top
curl -sS -o /dev/null -w '%{http_code}\n' "$PROD_URL/"
curl -sS "$PROD_URL/api/models" | head -c 500
curl -sS -o /dev/null -w '%{http_code}\n' "$PROD_URL/settings"
```

| 检查 | 通过标准 |
|------|----------|
| 首页 | 200，返回 HTML |
| `/settings` | 200（SPA 回退） |
| `/api/models` | 200，`success=true`，不含 Key |
| 生成 | 有真实 Key 时 200；额度不足时如实记录 |
| 500 检查 | 无 500 |

Vercel 部署需与推送 commit 对应；无法确认时记录部署时间与 commit。

---

## 11. 回归抽查

### 11.1 历史能力

- V3.1 System Prompt：`config.test.mjs` + GEN-02；
- V3.2 模型选择/校验：`model-utils` 单元测试；
- V3.3 Remix：`remix-core` / 集成 REMIX 用例；
- V3.4 CI/文档：`check:docs`、`check:inline`、smoke；
- V3.5 分层/双端一致性：`parity.test.mjs`。

### 11.2 数据兼容抽查

| 场景 | 检查 |
|------|------|
| V3.5 旧 `aikids-works` | 读取正常，ID 不变 |
| V3.5 旧 `aikids-settings` | 读取正常，默认值补齐逻辑不变 |
| V3.5 旧 `aikids-models` | 读取正常，Key 保留 |
| V3.6 新数据被 V3.5 读取（回滚演练） | 额外字段被忽略，作品可打开 |

---

## 12. BUG 修复确认表

| BUG ID | 描述 | 根因 | 修复 | 复测 |
|--------|------|------|------|------|
| BUG-3.6-01 | — | — | — | — |

---

## 13. 执行记录

> 执行时间：2026-10-23 10:55–11:12（Asia/Shanghai）
> 执行人：开发（自动化 + Headless Chrome）
> 环境：macOS，Node v24.18.0，npm 11.16.0，Chrome 156.0.8078.47（Headless）

| 验收项 | 命令 | 结果 | 证据 |
|--------|------|------|------|
| UAT-3.6-01~03 | 静态检查 / `typecheck` / `build` / `build:server` / `build:api` | ✅ 通过 | `shared/config` 为唯一来源；`server/dist/shared` 生成；api 生成物 `check:inline` ok |
| UAT-3.6-04~07 | `storage-schema.test.mjs` + 真实 UI | ✅ 通过 | 旧 ID 保留、UUID v4、schema 字段、HTML 不截断 |
| UAT-3.6-08~13 | Settings Headless UI UAT | ✅ 通过 | 26 项：导出含 Key、合并/覆盖、非法导入、旧 ID 保留、摘要计数 |
| UAT-3.6-14~18 | `telemetry.test.mjs` + Headless UI | ✅ 通过 | 四类事件、200 上限、脱敏；生成/试玩/Remix 实际产生事件 |
| UAT-3.6-19~20 | `migrate-storage.mjs` | ✅ 通过 | 2 个旧作品保留 ID、owner 生效、输出无 `apiKey`；非法输入退出码 1 |
| UAT-3.6-21~22 | Settings / 创作 / 播放 / 画廊 / 模型页 | ✅ 通过 | 备份入口在 ParentGate 后；主流程无回归；无未捕获异常 |
| UAT-3.6-23~24 | `npm run ci`（2 次）/ `check:docs` | ✅ 通过 | 91/91；version=3.6.0；日志 `temp/v3.6/ci-run-2.log` |
| UAT-3.6-25 | GitHub Actions | ✅ 通过 | run `39893330258`（commit `a71db4d`）success |
| UAT-3.6-26 | 生产 curl + Headless UI | ✅ 通过 | `www.boxaikids.top` 首页 200、`/settings` 200、`/api/models` 200；部署 `7269173611`（`a71db4d`）success；生产 UI UAT 26/26 |
| UAT-3.6-27 | CHANGELOG / proposal / tag | ✅ 完成 | CHANGELOG 3.6.0、proposal 状态已更新；本地 annotated tag `v3.6.0`（指向 `a71db4d`，未推送远端 tag） |

### 13.1 通过标准

- P0 100% 通过；
- P1 100% 通过或记录环境限制；
- `npm run ci` 退出码 0；
- 失败项修复后重跑，不以「已知问题」带病发布。

### 13.2 未覆盖与限制

- 真实模型生成/Remix 依赖额度，若无 Key 则记录「未验证真实模型」，不以桩结果冒充；
- 仅 Chrome 抽查，未做 Safari/移动端真机；
- 导出文件包含 Key 属明确决策，安全责任在文件保管，UAT 只验证提示与不自动上传。
