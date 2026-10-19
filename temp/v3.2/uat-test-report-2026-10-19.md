# UAT 测试报告 — V3.2 模型选择与模型配置

> 测试日期：2026-10-19
> 测试版本：v3.2
> 测试人：AI 开发助手（虾片儿）
> 对应文档：`docs/uat-v3.2.md`、`docs/design-v3.2.md`

---

## 测试结果汇总

| 类别 | 通过 / 总数 | 通过率 | 说明 |
|------|------------|--------|------|
| 静态检查 / 构建 | 10 / 10 | 100% | 文件、路由、Prompt 一致性、构建、esbuild |
| 前端工具函数 | 14 / 14 | 100% | 校验、选择、请求参数 |
| 本地存储容错 | 7 / 7 | 100% | 损坏 JSON、非法条目、去重、上限、旧作品 |
| 本地后端 API | 35 / 35 | 100% | 模型清单、测试、生成、安全、解析 |
| Vercel API 对等 | 7 / 7 | 100% | esbuild 产物直接调用 |
| SSR 冒烟 | 4 / 4 | 100% | Home / Create / Settings / Models |
| 浏览器 UI 主流程 | 17 / 17 | 100% | 首页选择、生成、家长验证、模型增删改测 |
| 浏览器 UI 补充 | 7 / 7 | 100% | 新标签页、移动端、旧作品、刷新持久化 |
| 边界 / 兼容 | 3 / 3 | 100% | 无模型兜底、旧变量回退 |

**本地可自动化验收项全部通过。**

真实外部模型（豆包 / DeepSeek）的生成质量与真实耗时未在本机验证：工作区没有配置真实 `VOLCENGINE_API_KEY` / endpoint，测试使用本地 OpenAI 兼容测试桩。部署或配置真实 Key 后建议补测一次（见文末）。

---

## 1. 测试环境

| 项目 | 值 |
|------|-----|
| Node.js | v24.18.0 |
| npm | 11.16.0 |
| 前端 | Vite 5.4.21 + React 18 |
| 本地后端 | Hono + tsx，`http://localhost:4000` |
| 测试桩 | `temp/v3.2/stub-model-server.mjs`，`http://localhost:4999` |
| 浏览器自动化 | Chrome Headless 155（CDP `127.0.0.1:9222`） |
| 环境变量 | `VOLCENGINE_API_KEY=test-key`、`VOLCENGINE_BASE_URL=http://localhost:4999/v1/chat/completions`、`DOUBAO_ENDPOINT_ID=ep-doubao-uat`、`DEEPSEEK_ENDPOINT_ID=ep-deepseek-uat`、`GAME_MODEL=deepseek`、`ALLOW_LOCAL_MODEL_HOSTS=1`、`MODEL_TEST_TIMEOUT_MS=2000` |

完整执行日志：`temp/v3.2/final-test-log.txt`
边界测试证据：`temp/v3.2/edge-test-log.txt`

---

## 2. 构建与静态检查

| # | 验收项 | 结果 | 说明 |
|---|--------|------|------|
| 4.1.1 | `npm run build` | ✅ | 66 modules，退出码 0 |
| 4.1.2 | 构建产物 | ✅ | `dist/index.html` + CSS/JS assets |
| 4.2.1 | `cd server && npm run build` | ✅ | tsc 通过 |
| 4.3.1 | Vercel API esbuild | ✅ | `api/generate.ts`、`api/models/index.ts`、`api/models/test.ts` 均成功 |
| 3.2.1/3.2.2 | Design / UAT 文档 | ✅ | `docs/design-v3.2.md`、`docs/uat-v3.2.md` |
| 3.3.1-3.3.4 | 后端模型文件 | ✅ | server + api 两套模块/路由齐全 |
| 3.4.1-3.4.5 | 前端文件/路由/高级配置 | ✅ | `ModelPicker`、`Models`、`/settings/models`、三个高级入口 |
| 3.5.1 | `.env.example` | ✅ | 新增模型相关环境变量 |
| 8.3.1 | SYSTEM_PROMPT 一致性 | ✅ | server / api 各 451 字符，diff 一致 |
| 5.4.1 | 模型模块对等 | ✅ | `server/src/services/model.ts` 与 `api/_model.ts` 除头部注释外一致 |

---

## 3. 本地后端 API（35/35）

覆盖 `docs/uat-v3.2.md` §5.1 / §5.2 / §5.3 / §7 / §8.4 / §9。

全部通过，关键项：

| 验收项 | 实测结果 |
|--------|---------|
| `GET /api/models` | 200，`doubao` / `deepseek`，默认 `deepseek` |
| endpoint 脱敏 | `ep-d…-uat`，不返回完整 endpoint |
| Key 脱敏 | 响应全文无 `test-key` / `apiKey` |
| 内置模型测试 | `success=true`，`latencyMs`，`reply=OK` |
| 自定义模型测试 | `source=custom`，成功 |
| 401 / 500 / 空响应 / 超时 | 分别返回鉴权失败 / 服务不可用 / 未返回内容 / 请求超时 |
| 未传模型生成 | 使用 `GAME_MODEL=deepseek` |
| 显式内置模型生成 | `model=doubao` |
| 旧字段 `model` 兼容 | 生效 |
| 自定义模型生成 | `model=custom-uat`，`modelSource=custom` |
| 未知模型生成 | HTTP 400 |
| 非法地址生成 | HTTP 400，白名单提示 |
| 上游 401 | 降级 Mock，带 `warning` |
| 解析兜底 | Markdown JSON / 纯 HTML / 截断 JSON 均生成游戏 |
| Remix 携带模型 | 生效 |
| 缺少 userPrompt / 非法 JSON | HTTP 400 |
| 测试不生成游戏 | 响应无 `gameHtml/title`；作品数不变 |

---

## 4. Vercel API 对等（7/7）

通过 esbuild 打包 `api/` 后直接调用：

| # | 验收项 | 结果 |
|---|--------|------|
| 5.4.1 | `GET /api/models` | ✅ |
| 5.4.2 | 默认模型来自 `GAME_MODEL` | ✅ |
| 5.4.3 | 模型测试 | ✅ |
| 5.4.4 | 默认模型生成 | ✅ |
| 5.4.5 | 自定义模型生成 | ✅ |
| 5.4.6 | 401 错误映射 | ✅ |
| 5.4.7 | 白名单拒绝 | ✅ |

> 说明：未执行真实 Vercel 部署，验证范围是函数入口打包与直接调用；路由在本地已按 Vercel 文件约定组织。

---

## 5. 前端工具函数与存储（21/21）

### 5.1 `model-utils.test.mjs`（14/14）

- 模型 ID 生成、Key 脱敏、Host 提取、本地地址识别
- 合法模型通过校验
- 空名称 / 超长名称 / 与内置模型重名 / 与自定义模型重名
- 编辑自身不触发重名
- 非法 URL / 非 HTTPS 拒绝
- localhost HTTP 允许（本地 UAT）
- 重复 `baseUrl + model` 拒绝
- 当前模型文案与请求参数组装（环境变量 / 内置 / 自定义 / 不可用回退）

### 5.2 `storage.test.mjs`（7/7）

- 自定义模型保存/读取往返
- 损坏 JSON 返回空数组
- 非数组返回空数组
- 非法条目丢弃、合法条目保留
- 重复 ID 去重
- 最多 20 条
- 旧作品 `remixCount` 兼容

---

## 6. 浏览器 UI 自动化（24/24）

### 6.1 主流程 `ui-cdp-uat.mjs`（17/17）

| 验收项 | 实测 |
|--------|------|
| 首页下部中间显示模型选择区 | ✅ 位于模板区下方、水平居中 |
| 默认「环境变量（默认：DeepSeek V4 Pro）」 | ✅ |
| 选择写入 sessionStorage | ✅ |
| 创作页只读当前模型、无选择器 | ✅ |
| 内置模型生成并记录模型 | ✅ `modelId=doubao` |
| Play iframe 仅 `allow-scripts` | ✅ |
| 设置内入口需家长验证 | ✅ |
| 同一会话不重复验证 | ✅ |
| 高级配置三个入口存在且禁用 | ✅ |
| 测试模型不生成作品 | ✅ 作品数不变 |
| 添加自定义模型并持久化 | ✅ localStorage |
| 自定义模型测试成功显示耗时 | ✅ |
| 自定义模型测试失败显示原因 | ✅ `force-401` → ❌ |
| 自定义模型生成并记录 modelSource | ✅ `custom` |
| 编辑自定义模型 | ✅ |
| 删除自定义模型并清理选择 | ✅ |
| 删除选中模型后回退环境变量 | ✅ |

### 6.2 补充 `ui-extra-uat.mjs`（7/7）

| 验收项 | 实测 |
|--------|------|
| 新标签页默认回到环境变量 | ✅ value 为空、sessionStorage 为空 |
| 移动端首页无横向溢出 | ✅ 375/375 |
| 移动端模型配置页无横向溢出 | ✅ 375/375 |
| 移动端高级配置占位完整 | ✅ 3 行 |
| 旧作品无模型字段仍正常展示 | ✅ |
| 设置刷新后仍存在 | ✅ 45/45 |
| 作品刷新后仍存在 | ✅ count=1 |

---

## 7. 边界与兼容

| # | 场景 | 结果 | 说明 |
|---|------|------|------|
| 5.1.7 | 无模型时目录 | ✅ | 200，两项 `available=false`，`defaultModelId=null` |
| 5.3.8 | 无模型时生成 | ✅ | `engine=mock`，`model=mock`，游戏可玩 |
| 5.1.9 | 旧变量 `VOLCENGINE_ENDPOINT_ID` | ✅ | `doubao` 可用，默认 `doubao` |
| 5.1.8 | `GAME_MODEL` 非法 | ✅ | 回退第一个可用模型（doubao） |
| 5.3.5 | 显式不可用模型 | ✅ | HTTP 400 + 明确原因 |
| 7.3.3 | 本地地址默认禁止 | ✅ | 未开启 `ALLOW_LOCAL_MODEL_HOSTS` 时拒绝 |
| 7.5.1 | 重定向 | ✅ | 拒绝 |

无模型时的前端选择器实测：仅显示「环境变量（未配置默认模型）」，无内置模型选项。

---

## 8. BUG 修复确认

| # | BUG 描述 | 严重程度 | 状态 | 修复说明 |
|---|---------|---------|------|---------|
| BUG-3.2-01 | React StrictMode 下 AppContext 初始化守卫失效，刷新后作品/设置被空数组覆盖 | P0 | ✅ 已修复 | 改用 `hydrated` state 守卫；刷新后作品/设置保留，已加入 `ui-extra-uat.mjs` 回归 |
| BUG-3.2-02 | 开启 `ALLOW_LOCAL_MODEL_HOSTS=1` 后，localhost 仍被白名单拒绝 | P0 | ✅ 已修复 | 本地地址在显式开启后直接放行（含任意端口），并保留 HTTPS 限制用于非本地地址 |
| BUG-3.2-03 | 测试接口 `max_tokens=8` 对推理模型过小，DeepSeek V4 Pro 的 reasoning tokens 耗尽预算，`content` 为空并报「模型未返回内容」 | P0 | ✅ 已修复 | 测试预算调整为 `max_tokens=256`；空内容且 `finish_reason=length` 时提示「模型未返回最终文本（可能被 max_tokens 截断）」 |
| ENV-3.2-01 | `.env` 中 `DOUBAO_ENDPOINT_ID` 多写了一个 `ep-` 前缀，方舟返回 404 `InvalidEndpointOrModel.NotFound` | P0 | ✅ 已修复 | 改为实际接入点 ID `ep-20260614223719-2z6p7`；代码本身无问题，属于配置笔误 |
| BUG-3.2-04 | Vercel 部署后所有 `/api/*` 返回 500 `FUNCTION_INVOCATION_FAILED`：Vercel Node File Trace 不打包 `api/` 下的跨文件相对导入，`api/_model.ts` 未进入各函数包 | P0 | ✅ 已修复 | 将模型核心内联到 `api/generate.ts`、`api/models/index.ts`、`api/models/test.ts`，每个函数自包含，只 import `hono`；`api/_model.ts` 作为内联源并通过 `.vercelignore` 排除 |

---

## 8.1 真实模型复测（2026-10-19 19:50）

使用用户 `.env` 中的真实 `VOLCENGINE_API_KEY` 与接入点，通过临时端口 4001 启动后端验证（未暴露 Key）：

| 模型 | 接入点 | 结果 |
|------|--------|------|
| Doubao Seed 2.0 Pro（内置） | `ep-20260614223719-2z6p7` | ✅ `reply=OK`，约 4.2s |
| DeepSeek V4 Pro（内置） | `ep-20260615191653-9qnwz` | ✅ `reply=OK`，约 2.7s |
| GLM-5.2（自定义，Key 留空回退环境变量） | `ep-20261019191957-zz5s7` | ✅ `reply=OK`，约 4.2s |

直接探测结论：

- `ep-ep-20260614223719-2z6p7` 返回 404 `InvalidEndpointOrModel.NotFound`；去掉重复前缀后正常。
- DeepSeek V4 Pro 为推理模型：`max_tokens=8/64` 时 `finish_reason=length`、`content` 为空、`reasoning_tokens` 已耗尽预算；`max_tokens=128/256/512/1024` 均能返回 `OK`，最终选择 256。
- GLM-5.2 使用环境变量 Key 也能成功，说明 `.env` 的 Key 加载正常；此前手动填 Key 成功只是绕开了接入点配置问题。

---

## 9. 未覆盖 / 待线上验证

以下项目不影响本地功能交付，但建议在部署或配置真实模型后补测：

1. **真实模型游戏生成质量**：已用真实 Key 验证三个模型的连通性与测试返回；真实游戏生成的质量、耗时和失败率仍建议线上多跑几次。
2. **真实 Vercel 路由**：已通过 esbuild + 直接调用验证函数；未执行 `vercel deploy`。
3. **真机语音输入**：浏览器 Web Speech API 需要麦克风与权限，未自动化。
4. **公共设备安全**：自定义模型 API Key 保存在浏览器 localStorage，已在 UI 与文档中提示；生产环境应避免在公共设备保存 Key。
5. **模型高级配置**：提示词优化 / 最长提示词 / 最长等待时间按需求仅预留入口，本版本不生效。
6. **接入点下线风险**：截图中 DeepSeek / Doubao 两个接入点标注「即将下线」，虽然当前可用，建议尽快在方舟创建新接入点并更新 `.env`。

---

## 10. 结论

V3.2 交付范围内可自动化验证的功能、接口、安全与回归项全部通过：

- 首页可选择模型，未选择时严格使用 `GAME_MODEL`；
- 设置内模型配置支持添加、编辑、删除、测试；
- 模型测试只验证调用与返回，不生成游戏；
- 高级配置入口已预留且不影响生成；
- 本地 `server/` 与 Vercel `api/` 双端行为一致；
- 构建、SSR、浏览器 UI、刷新持久化均通过；
- 真实 Doubao / DeepSeek / GLM-5.2 接入点测试均返回 `OK`。

**V3.2 本地验收通过，可进入部署阶段。**
