# V3.3 UAT 测试报告（Remix 上下文增强）

> 版本：v3.3
> 日期：2026-10-19
> 对应文档：`docs/uat-v3.3.md`、`docs/design-v3.3.md`
> 结论：**本地验收通过，待 Vercel 线上验收**

---

## 1. 测试环境

| 项目 | 值 |
|------|-----|
| Node.js | v24.18.0 |
| 前端 | Vite + React 18（`npm run dev`，http://localhost:3000） |
| 本地后端 | Hono + tsx（http://localhost:4000，指向测试桩） |
| 真实模型后端 | http://localhost:4002（读取根目录 `.env`） |
| 测试桩 | http://localhost:4998（`temp/v3.3/stub-remix-server.mjs`） |
| 浏览器 | Chrome 155.0.8059.80（headless + CDP :9333） |
| 真实模型 | Doubao Seed 2.0 Pro（火山方舟 Ark） |

---

## 2. 结果汇总

| 层级 | 用例数 | 通过 | 失败 | 结果 |
|------|--------|------|------|------|
| 构建（前端 + 后端） | 2 | 2 | 0 | ✅ |
| 单元测试 | 37 | 37 | 0 | ✅ |
| 本地 API（server/） | 31 | 31 | 0 | ✅ |
| Vercel API 产物 | 14 | 14 | 0 | ✅ |
| 前端 UI（CDP） | 21 | 21 | 0 | ✅ |
| 真实模型 Remix | 5 | 5 | 0 | ✅ |
| 真实模型输出可玩性 | 1 | 1 | 0 | ✅ |
| Vercel 线上 | 4 | 0 | 0 | ⏳ 待部署后执行 |

---

## 3. 执行命令与结果

### 3.1 构建

```bash
cd server && npx tsc -p . --noEmit   # 通过
npm run build                         # 通过，dist/assets/index-BaoWoGQk.js
```

### 3.2 单元测试

```bash
server/node_modules/.bin/tsx temp/v3.3/remix-core.test.mjs
# ===== 单元测试：37/37 通过，0 失败 =====
```

覆盖：

- DOM / Canvas 游戏档案提取
- 标题、交互、机制、得分、胜负、计时、viewport、音效
- `full` / `outline` / `preview` / `none` 四种源码模式
- Remix Prompt 内容与 16,384 输出上限
- 结构审计（保留 / 删除得分 / 改名）
- `</game_source>` 转义、空源码、超长指令
- 前后端档案规则一致性（server TS vs client JS）
- Remix 上下文完整源码透传

### 3.3 本地 API

```bash
node temp/v3.3/api-uat.mjs
# ===== 本地 API：31/31 通过，0 失败 =====
```

关键证据：

| 用例 | 结果 |
|------|------|
| 完整源码 Remix | `remixMode=full`，原源码 954 字符全部注入 |
| Prompt 档案 | 标题/模板/渲染/交互/机制/得分/胜负全部存在 |
| 输出上限 | `max_tokens=16384` |
| 超长源码 | 76,088 字符 → `outline`，中间标记未注入 |
| 旧客户端 | 仅 preview → `preview` 模式 |
| 模型 500 | `remixFallback=true`，`gameHtml === 原 HTML` |
| 无模型 | 独立 4001 端口验证，同样保留原游戏 |
| 普通生成 | 无 Remix 字段，System Prompt 无 Remix 规则，`max_tokens=8192` |
| 纯 HTML 输出 | 解析成功，审计通过 |
| 删除得分系统 | `scorePreserved=false`、`preserved=false` |
| 异常源码类型 | 非字符串不导致 500 |

### 3.4 Vercel 产物

```bash
npx esbuild api/generate.ts --bundle --platform=node --format=esm \
  --outfile=temp/v3.3/esbuild-check/generate.js
node temp/v3.3/api-vercel-uat.mjs
# ===== Vercel API 产物：14/14 通过，0 失败 =====
```

`api/generate.ts` 保持自包含（只依赖 `hono`），与本地 `server/` 行为对等。

### 3.5 前端 UI

```bash
node temp/v3.3/ui-remix-uat.mjs
# ===== UI 自动化：21/21 通过，0 失败 =====
```

关键证据：

- 弹窗展示「基于《星星收集大冒险》改编」与「点击 / 得分 / 胜负 / 倒计时 / 手机适配」
- 请求中完整源码长度 > 300，Prompt 含标题、交互、得分、改编要求
- 新作品包含 `remixFromTitle` / `remixMode=full` / `remixProfile` / `remixAudit.preserved=true`
- 播放页显示「改编自《星星收集大冒险》· 已保留原玩法」
- 作品列表显示「改编自」「🧬 保留原玩法」
- 模型 500 时提示「已保留原游戏」，作品数量不变并回到原作品
- 删除源作品后仍显示改编来源（`remixFromTitle` 生效）
- 375×812 移动端弹窗不溢出
- 仅 preview 的旧客户端上下文仍可生成，作品记录 `remixMode=preview`

### 3.6 真实模型

```bash
cd server && PORT=4002 ./node_modules/.bin/tsx src/index.ts
node temp/v3.3/real-remix-check.mjs
# ===== 真实模型：5/5 通过，0 失败 =====
```

| 项目 | 结果 |
|------|------|
| 模型 | Doubao Seed 2.0 Pro |
| 耗时 | 38.2s |
| 原游戏 | 97 行 / 2,978 字符（DOM、点击、得分、胜负、倒计时） |
| 改编指令 | 把星星换成宝石，并加一个会扣分的炸弹 |
| 输出 | 3,380 字节，标题仍为「星星收集大冒险」 |
| 审计 | render/interactions/score/winLose 全部保留，`preserved=true`，`changed=true` |
| 指令落实 | 输出包含 💎、💣、`score = Math.max(0, score - 1)`，点击宝石 +1、炸弹 -1 |
| 可玩性 | Chrome 打开无 JS 异常；点击目标后得分从 0 变 1 |

输出证据：`temp/v3.3/real-remix-output.html`。

---

## 4. 测试中发现并修复的问题

| ID | 问题 | 根因 | 修复 | 复测 |
|----|------|------|------|------|
| BUG-3.3-01 | `REMIX_SOURCE_MAX_CHARS` / `REMIX_MAX_TOKENS` 未设置时取到最小值 8000/4096 | `Number('') === 0` 被当作合法数字并 clamp 到下限 | 先判断空字符串再 `Number()` | 单元 37/37 |
| BUG-3.3-02 | 普通生成响应多出 `remixAudit: null` | 响应无条件写入 `remixAudit ?? null` | 仅在 Remix 且审计存在时展开字段 | API-07b 通过 |
| BUG-3.3-03 | 旧客户端仅 preview 时 `remixMode=none` | Create 总是用完整 HTML 派生 preview，忽略 context 里的 `originalGameHtmlPreview` | 优先使用 context 的 preview | UI-09b 通过 |
| BUG-3.3-04 | 真实模型纯 HTML 测试被判定为上游非法 JSON | 测试桩把纯 HTML 当 HTTP body 返回，而非 Chat Completions 的 `content` | 测试桩改为正常 Chat Completions 包装 | API-08a / VERCEL-06a |

> 前 3 个是产品代码问题，均已修复并回归；第 4 个是测试桩问题。

---

## 5. 待执行

- [ ] 提交 GitHub
- [ ] 等待 Vercel 自动部署
- [ ] 线上 `/api/generate` Remix 验收
- [ ] 线上 UI Remix 验收
- [ ] 线上普通生成回归
- [ ] 将线上结果补充到本报告

---

## 6. 产物清单

| 文件 | 用途 |
|------|------|
| `temp/v3.3/stub-remix-server.mjs` | Remix 测试桩 |
| `temp/v3.3/fixtures.mjs` | 测试样本 |
| `temp/v3.3/remix-core.test.mjs` | 单元测试 |
| `temp/v3.3/api-uat.mjs` | 本地 API 验收 |
| `temp/v3.3/api-vercel-uat.mjs` | Vercel 产物验收 |
| `temp/v3.3/ui-remix-uat.mjs` | UI 自动化验收 |
| `temp/v3.3/real-remix-check.mjs` | 真实模型验收 |
| `temp/v3.3/real-remix-browser-check.mjs` | 真实输出可玩性检查 |
| `temp/v3.3/real-remix-output.html` | 真实模型输出证据 |
| `temp/v3.3/esbuild-check/` | Vercel 产物（gitignore） |
| `temp/v3.3/chrome-profile/` | Chrome 临时配置（gitignore） |
