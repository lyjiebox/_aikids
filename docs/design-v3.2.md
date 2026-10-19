# Design: AI 儿童创意游戏平台 V3.2（模型选择与模型管理）

> 版本：v3.2
> 对应文档：`docs/proposal.md`
> 编写日期：2026-10-19
> 说明：在 V3.1 基础上新增 Web 端模型选择、内置模型展示、自定义模型增删改查与模型测试能力；不改变游戏生成的主流程与 V3.1 System Prompt。

---

## 1. 版本目标与范围

### 1.1 目标

1. **可选模型**：首页下部中间提供模型选择入口，用户（家长）可在开始创作前选择本次使用的模型。
2. **环境变量兜底**：用户未选择模型时，严格按环境变量 `GAME_MODEL` 指定的模型生成；`GAME_MODEL` 未设置或不可用时，按既有规则降级。
3. **模型配置**：设置中（家长验证后）可添加、删除、修改、测试模型。
4. **可观测**：生成结果记录实际使用的模型，作品列表可见；模型测试展示耗时和错误原因。
5. **可扩展**：模型配置页预留「提示词优化」「最长提示词」「最长等待时间」入口，为后续版本做准备。

### 1.2 范围

| 功能 | V3.2 | 说明 |
|------|------|------|
| 首页模型选择入口 | ✅ 必做 | 位于首页下部中间，默认「环境变量」 |
| 创作页复用模型选择 | ✅ 必做 | 不重复放置选择器，直接使用首页选择 |
| 未选择时使用 `GAME_MODEL` | ✅ 必做 | 请求不携带模型参数，由后端解析 |
| 内置模型清单接口 | ✅ 必做 | `GET /api/models` |
| 自定义模型添加/编辑/删除 | ✅ 必做 | 设置 → 模型配置，家长验证后操作 |
| 模型测试 | ✅ 必做 | 仅验证配置参数能否完成调用并返回文本，不生成游戏 |
| 自定义模型持久化 | ✅ 必做 | 浏览器 `localStorage`，与作品/设置一致 |
| 作品记录模型信息 | ✅ 必做 | `modelId/modelName/modelSource` |
| 高级配置入口预留 | ✅ 必做 | 提示词优化 / 最长提示词 / 最长等待时间，仅入口占位 |
| API Key 安全 | ✅ 必做 | 不回显、不落日志、自定义地址白名单 |
| 游戏 iframe 沙箱收紧 | ✅ 必做 | 移除 `allow-same-origin`，防止读取本机模型 Key |
| 服务端模型持久化 / 多设备同步 | ❌ 不做 | 依赖 V6.0 云端存储 |
| 多模型 A/B 自动优选 | ❌ 不做 | 顺延 V3.5 |
| 提示词优化 / 长度限制 / 超时生效 | ❌ 不做 | 仅预留入口，V3.3/V3.4 开放 |
| 每个模型的配额、计费、用量统计 | ❌ 不做 | 后续版本 |
| 修改 V3.1 System Prompt 规则 | ❌ 不做 | 保持 8 条规则不变 |
| 修改 Remix / Mock / 解析策略 | ❌ 不做 | 仅扩展模型入参与出参；server 解析策略与 api 对齐除外 |

### 1.3 关键设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| 模型选择入口放哪里？ | 首页下部中间；选择写入 `sessionStorage`，创作页读取后使用 | 符合儿童「先选模型再开始」的操作路径；创作页保持简洁，不重复放置入口 |
| 自定义模型存哪里？ | 浏览器 `localStorage`（`aikids-models`） | 项目当前无数据库/登录；作品与设置均为本地存储；同时保证 Vercel 生产环境无需新增存储即可使用完整增删改查 |
| 自定义模型如何调用？ | 生成/测试请求携带 `modelConfig`，服务端不持久化 | 服务端只做一次性校验与转发，避免引入服务端数据库 |
| 环境模型能否编辑/删除？ | 只读，UI 显示「环境变量」徽标 | 环境模型由部署环境决定，Web 端修改不会改变环境变量，容易造成误解 |
| 默认模型如何决定？ | `GAME_MODEL` → 第一个可用内置模型 → Mock | 严格满足「未选择时按环境变量配置」 |
| 选择是否持久化？ | 仅当前浏览器会话（`sessionStorage`） | 新会话默认回到「环境变量」，避免上次选择悄悄覆盖环境变量默认值 |
| 模型测试测什么？ | 只发一次固定短 Prompt，验证参数能完成调用并返回文本 | 与游戏生成解耦，测试快、成本低、错误原因清晰 |
| 高级配置入口？ | 仅 UI 占位并禁用，不持久化、不发送后端 | 为 V3.3/V3.4 预留位置，避免本版本产生「已生效」的误解 |
| API Key 是否发送到后端？ | 自定义模型的 Key 随请求发送，仅用于当次调用 | 非火山方舟接口无法使用服务端默认 Key；服务端不存储、不回显 |
| 自定义接口地址安全 | 域名白名单 + 仅 HTTPS + 禁止重定向 | 防止服务端被当作任意请求代理（SSRF） |

---

## 2. 现状与问题

当前代码（V3.1 + 最近一次 Chat Completions 改造）已经具备：

- 前端生成请求：`src/pages/Create.tsx` → `src/services/api.js` → `POST /api/generate`
- 本地后端：`server/src/routes/generate.ts` + `server/src/services/ai.ts`
- Vercel 后端：`api/generate.ts`
- 环境变量模型：`DOUBAO_ENDPOINT_ID`、`DEEPSEEK_ENDPOINT_ID`、`GAME_MODEL`
- 前端请求体已支持 `model: 'deepseek' | 'doubao'`，但 **Web 端没有选择入口**
- 模型清单写死在代码中，**无法添加、删除、修改、测试**

存在的问题：

1. Web 端无法选择模型，只能依赖服务端默认值。
2. 新增模型（如 GLM、其他接入点）必须改代码并重新部署。
3. 模型不可用时只能等到生成失败才发现，缺少测试手段。
4. 生成结果没有记录实际使用的模型，无法回溯。

---

## 3. 总体方案

### 3.1 架构概览

```text
┌──────────────────────────── Web 前端（Vite + React） ────────────────────────────┐
│                                                                                  │
│  首页 Home（下部中间）                                                            │
│    └─ ModelPicker ── 选择「环境变量 / 内置模型 / 自定义模型」                      │
│         └─ 选择写入 sessionStorage                                                │
│                                                                                  │
│  创作页 Create                                                                   │
│    └─ 读取 sessionStorage 选择 → 生成请求：{ modelId? | modelConfig? }            │
│                                                                                  │
│  家长设置 Settings（需家长验证）──→ 模型配置 Models                               │
│    ├─ 内置模型列表（来自 GET /api/models，只读）                                  │
│    ├─ 自定义模型列表（localStorage: aikids-models）                               │
│    ├─ 添加 / 编辑 / 删除 / 测试                                                   │
│    └─ 高级配置（预留）：提示词优化 / 最长提示词 / 最长等待时间                      │
│                                                                                  │
│  localStorage：aikids-models（自定义模型）                                        │
│  sessionStorage：aikids-selected-model（本次会话选择）                             │
└──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────── 后端（Hono） ────────────────────────────────────────┐
│  GET  /api/models        返回环境变量定义的内置模型 + 默认模型（不返回 Key）       │
│  POST /api/models/test   固定短 Prompt，只验证调用与返回，不生成游戏               │
│  POST /api/generate      解析 modelId / modelConfig，调用模型，失败降级 Mock       │
│                                                                                  │
│  本地：server/src/services/model.ts + routes/models.ts                            │
│  生产：api/_model.ts + api/models/index.ts + api/models/test.ts                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 模型解析优先级

后端收到生成/测试请求后，按以下顺序解析模型：

| 顺序 | 请求条件 | 行为 |
|------|---------|------|
| 1 | 携带合法 `modelConfig` | 使用自定义模型配置 |
| 2 | 携带 `modelId` 且命中可用内置模型 | 使用该内置模型 |
| 3 | 携带 `model`（兼容旧字段）且命中可用内置模型 | 使用该内置模型 |
| 4 | 以上都没有 | 使用 `GAME_MODEL`（可用时）→ 第一个可用内置模型 |
| 5 | 没有任何可用模型 | 使用 Mock 游戏（`engine='mock'`） |

补充规则：

- 显式指定的内置模型不可用（未配置 endpoint 或 Key）→ **返回 400**，不静默降级。
- 自定义模型配置非法（字段缺失、地址不在白名单、Key 缺失）→ **返回 400**。
- 模型调用失败（网络错误、5xx、超时）→ 沿用现有 Mock 降级，响应带 `warning` 字段。
- 不传任何模型参数时，行为与旧客户端完全一致。

### 3.3 数据流

1. 应用启动：`AppContext` 读取 `aikids-models`，并请求 `GET /api/models` 获取内置模型。
2. 用户进入首页：模型选择器默认「环境变量」；若 `sessionStorage` 有上次选择则恢复。
3. 用户点击「说出你的游戏创意」或模板卡进入创作页；创作页读取同一份选择。
4. 点击生成：根据选择构造请求参数：
   - 环境变量 → 不传模型字段
   - 内置 → `modelId`
   - 自定义 → `modelConfig` + `modelId`（后者仅用于日志/回传）
5. 后端解析模型并调用 Chat Completions。
6. 响应返回 `model/modelName/modelSource`；前端保存到作品并展示。
7. 用户在模型配置页测试模型：`POST /api/models/test` 只做一次极短调用并检查返回文本，不生成游戏。

---

## 4. 数据模型

### 4.1 内置模型（服务端环境变量）

```ts
export type ModelSource = 'env' | 'custom';

export interface EnvModelInfo {
  id: 'doubao' | 'deepseek';   // 稳定标识
  name: string;                // 显示名称
  source: 'env';
  available: boolean;          // endpoint 与 API Key 均存在
  unavailableReason?: string;  // 不可用原因（脱敏）
  baseUrl: string;             // 火山方舟 Chat Completions 地址
  modelPreview: string;        // 脱敏后的 endpoint，如 ep-2026…8f3a
  hasApiKey: boolean;
  isDefault: boolean;
}
```

来源：

| 模型 ID | 显示名称 | Endpoint 环境变量 | API Key |
|---------|---------|------------------|---------|
| `doubao` | Doubao Seed 2.0 Pro | `DOUBAO_ENDPOINT_ID`（缺失时回退 `VOLCENGINE_ENDPOINT_ID`） | `VOLCENGINE_API_KEY` |
| `deepseek` | DeepSeek V4 Pro | `DEEPSEEK_ENDPOINT_ID` | `VOLCENGINE_API_KEY` |

接口地址统一取 `VOLCENGINE_BASE_URL`（默认火山方舟 Chat Completions 地址），便于本地 UAT 将内置模型指向测试桩。

> 说明：`VOLCENGINE_ENDPOINT_ID` 为 V3.1 遗留变量，仅作为 `doubao` 的兼容回退，保证已有部署不破。

### 4.2 自定义模型（前端 localStorage）

```ts
export interface CustomModel {
  id: string;          // custom-<base36 时间戳>-<4 位随机串>
  name: string;        // 显示名称，1-30 字符，全局（内置+自定义）唯一
  baseUrl: string;     // OpenAI 兼容的 chat/completions 完整地址
  model: string;       // 接入点 ID 或模型名
  apiKey?: string;     // 可选；留空时仅火山方舟域名可使用服务端 Key
  createdAt: number;
  updatedAt: number;
}
```

存储：

- Key：`aikids-models`
- 格式：`CustomModel[]`（与 `aikids-works` 一致，直接数组）
- 读取时容错：非法条目丢弃、重复 ID 去重、最多保留 20 条；解析失败返回 `[]`。
- 不写入服务端；清除浏览器数据会丢失（UI 明示）。

### 4.3 作品模型字段

在现有 `GameWork` 上新增可选字段（旧作品无需迁移）：

```ts
interface GameWork {
  // ...原有字段
  modelId?: string;                     // 实际使用的模型 ID
  modelName?: string;                   // 实际使用的模型显示名
  modelSource?: 'env' | 'custom';       // 模型来源
}
```

### 4.4 模型选择状态

- 入口：首页下部中间的模型选择器。
- 存储：`sessionStorage`，Key `aikids-selected-model`。
- 值：模型 ID 或空字符串（环境变量）。
- 新会话没有值时，选择器显示「环境变量」，请求不带模型字段。
- 创作页不提供选择器，只读取该状态；加载页展示实际使用的模型名。

---

## 5. 后端 API 设计

### 5.1 `GET /api/models`

用途：返回内置模型清单、默认模型和可配置提示。

响应（200）：

```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "doubao",
        "name": "Doubao Seed 2.0 Pro",
        "source": "env",
        "available": true,
        "baseUrl": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "modelPreview": "ep-2026…8f3a",
        "hasApiKey": true,
        "isDefault": true
      },
      {
        "id": "deepseek",
        "name": "DeepSeek V4 Pro",
        "source": "env",
        "available": false,
        "unavailableReason": "未配置 DEEPSEEK_ENDPOINT_ID",
        "baseUrl": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        "modelPreview": "",
        "hasApiKey": true,
        "isDefault": false
      }
    ],
    "defaultModelId": "doubao",
    "defaultModelName": "Doubao Seed 2.0 Pro",
    "hasServerApiKey": true
  }
}
```

规则：

- `models` 顺序固定：`doubao`、`deepseek`。
- 不返回完整 endpoint、不返回 API Key。
- `defaultModelId` 解析：`GAME_MODEL`（可用时）→ 第一个可用模型 → `null`。
- 未配置任何模型时仍返回 200，`models` 中项 `available=false`，`defaultModelId=null`。
- 该接口无需家长验证（只读且已脱敏），供选择器使用。

### 5.2 `POST /api/models/test`

用途：测试模型配置的连通性，**只验证参数能否完成一次调用并返回文本，不生成游戏**。

请求（二选一）：

```json
{ "modelId": "doubao" }
```

```json
{
  "modelConfig": {
    "id": "custom-xxx",
    "name": "我的 GLM",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    "model": "glm-4-flash",
    "apiKey": "sk-xxx"
  }
}
```

服务端行为：

- 固定 Prompt：`messages=[{role:'user', content:'请只回复：OK'}]`，`max_tokens=256`，`temperature=0`。
  - 推理模型（如 DeepSeek V4 Pro）会先消耗 reasoning tokens，`max_tokens` 过小会导致 `content` 为空且 `finish_reason=length`。
- 超时：`MODEL_TEST_TIMEOUT_MS`，默认 20000ms，最大 60000ms。
- 成功条件：HTTP 2xx 且返回非空文本；不校验返回内容是否为 `OK`，只要求有文本。
- 不生成游戏：不拼接游戏 Prompt、不调用 `parseGameOutput`、不解析 HTML、不写作品、不计数、不使用 Mock 兜底。
- 测试失败只返回脱敏后的原因，便于用户修正参数。

响应（HTTP 200，成功）：

```json
{
  "success": true,
  "data": {
    "ok": true,
    "latencyMs": 842,
    "modelName": "Doubao Seed 2.0 Pro",
    "source": "env",
    "reply": "OK"
  }
}
```

响应（HTTP 200，失败）：

```json
{
  "success": false,
  "message": "鉴权失败，请检查 API Key",
  "data": { "latencyMs": 1203, "status": 401 }
}
```

错误映射（脱敏）：

| 上游情况 | 返回文案 |
|---------|---------|
| 401 / 403 | 鉴权失败，请检查 API Key |
| 404 | 接口地址或模型 ID 不存在 |
| 429 | 请求过于频繁或额度不足 |
| 5xx | 模型服务暂时不可用 |
| 超时 | 测试超时（20 秒） |
| 网络错误 | 无法连接模型接口 |
| 配置错误 | 具体字段提示（如「接口地址不在白名单内」） |

请求体格式错误（JSON 无法解析）→ HTTP 400 `{ success:false, message:'请求参数格式错误' }`。

业务性失败（未知模型、模型未配置、配置非法、上游错误、超时）统一返回 HTTP 200 + `success:false`，便于前端在行内展示测试结果；只有请求体本身无法解析时才使用 400。

### 5.3 `POST /api/generate`（扩展）

请求新增可选字段（其余字段不变）：

```ts
interface GenerateRequest {
  templateId?: string;
  userPrompt: string;
  ageRange?: [number, number];
  remixFrom?: string;
  remixInstruction?: string;
  // V2.0 Remix 上下文（保持不变）
  originalUserPrompt?: string;
  originalTitle?: string;
  originalGameHtmlPreview?: string;
  // V3.2 新增
  modelId?: string;                    // 内置模型 ID 或自定义模型 ID（后者仅用于日志）
  model?: string;                      // 兼容旧字段，等同 modelId
  modelConfig?: CustomModelPayload;    // 自定义模型配置
}
```

响应新增字段：

```json
{
  "success": true,
  "data": {
    "title": "打怪兽小勇士",
    "gameHtml": "<!DOCTYPE html>...",
    "engine": "volcengine",
    "model": "doubao",
    "modelName": "Doubao Seed 2.0 Pro",
    "modelSource": "env",
    "warning": "可选：降级原因"
  }
}
```

规则：

- `engine='mock'` 时：`model='mock'`、`modelName='本地模板'`、`modelSource` 省略。
- 显式模型不可用/配置非法 → HTTP 400，不进入 Mock。
- 上游调用失败 → 仍返回 200 + Mock，`warning` 说明原因（不含 Key）。
- 旧客户端只传 `templateId/userPrompt` → 与 V3.1 行为一致。

### 5.4 自定义模型配置校验

服务端对 `modelConfig` 执行以下校验，全部通过才发起请求：

| 字段 | 规则 |
|------|------|
| `name` | 非空字符串，1-30 字符 |
| `baseUrl` | 合法 URL；`https:`；主机在允许列表；不得包含账号密码；禁止重定向 |
| `model` | 非空字符串，1-200 字符 |
| `apiKey` | 可选字符串；提供时长度 1-500；留空时仅火山方舟域名回退服务端 Key |
| `id` | 可选字符串，仅用于回传，1-100 字符 |

白名单：

- 默认允许：`ark.cn-beijing.volces.com`、`api.deepseek.com`、`api.openai.com`、`open.bigmodel.cn`、`dashscope.aliyuncs.com`、`api.moonshot.cn`。
- `ALLOWED_MODEL_HOSTS`（逗号分隔）设置后**覆盖**默认列表。
- `ALLOW_LOCAL_MODEL_HOSTS=1` 时额外允许 `localhost`、`127.0.0.1`、`[::1]`（任意端口，仅用于本地 UAT；生产禁止）。
- 主机比较前统一小写、去掉末尾点。
- `fetch` 使用 `redirect: 'error'`，防止通过 30x 绕过白名单。

---

## 6. 后端实现设计

### 6.1 文件结构

```text
server/src/
├── index.ts                    # 修改：挂载 /api/models
├── types/index.ts              # 修改：新增模型类型
├── services/
│   ├── model.ts                # 新增：模型清单、校验、解析、调用、测试
│   └── ai.ts                   # 修改：使用 model.ts，返回模型信息
└── routes/
    ├── models.ts               # 新增：GET /、POST /test
    └── generate.ts             # 修改：透传模型入参、扩展响应

api/
├── _model.ts                   # 新增：与 server/src/services/model.ts 对等（Vercel 共享）
├── generate.ts                 # 修改：使用 _model.ts
└── models/
    ├── index.ts                # 新增：GET /api/models
    └── test.ts                 # 新增：POST /api/models/test
```

> `api/` 与 `server/` 是项目既有的双后端模式，模型逻辑需保持对等。V3.2 不强行合并两套实现，避免改变现有构建/部署结构；UAT 通过同一组 API 用例分别验证两端。

### 6.2 `model.ts` 主要函数

```ts
// 内置模型清单（脱敏）
export function getEnvModelCatalog(): EnvModelInfo[];

// 解析默认模型：GAME_MODEL → 第一个可用 → null
export function resolveDefaultModel(): EnvModel | null;

// 解析请求模型；返回 ResolvedModel 或抛出 ModelConfigError
export function resolveRequestModel(input: {
  modelId?: string;
  model?: string;
  modelConfig?: unknown;
}): ResolvedModel;

// 调用 Chat Completions（生成/测试共用）
export async function callChatCompletion(
  model: ResolvedModel,
  messages: { role: string; content: string }[],
  options: { maxTokens: number; temperature: number; timeoutMs: number }
): Promise<{ text: string; latencyMs: number }>;

// 测试模型
export async function testModel(input: {
  modelId?: string;
  modelConfig?: unknown;
}): Promise<TestModelResult>;
```

`ResolvedModel`：

```ts
interface ResolvedModel {
  id: string;
  name: string;
  source: 'env' | 'custom';
  baseUrl: string;
  model: string;
  apiKey: string;
}
```

### 6.3 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `VOLCENGINE_API_KEY` | 内置/方舟自定义模型必填 | — | 火山方舟 API Key |
| `VOLCENGINE_BASE_URL` | 可选 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | 内置模型接口地址（UAT 可指向本地桩） |
| `DOUBAO_ENDPOINT_ID` | 可选 | — | Doubao 接入点 |
| `DEEPSEEK_ENDPOINT_ID` | 可选 | — | DeepSeek 接入点 |
| `VOLCENGINE_ENDPOINT_ID` | 可选（兼容） | — | `doubao` 的旧变量回退 |
| `GAME_MODEL` | 可选 | `doubao`（可用时）→ 第一个可用 | 默认模型 ID |
| `ALLOWED_MODEL_HOSTS` | 可选 | 见 5.4 | 自定义模型域名白名单（覆盖默认） |
| `ALLOW_LOCAL_MODEL_HOSTS` | 可选 | `0` | 允许 localhost（UAT 用） |
| `MODEL_TEST_TIMEOUT_MS` | 可选 | `20000` | 测试超时 |
| `MODEL_TIMEOUT_MS` | 可选 | `280000` | 生成超时（低于 Vercel 300s 上限） |

### 6.4 生成调用链

```text
POST /api/generate
  → 解析模板前缀 / Remix Prompt（逻辑不变）
  → resolveRequestModel()
      ├─ 有 modelConfig → 校验 → 自定义模型
      ├─ 有 modelId/model → 环境模型（不可用则 400）
      └─ 都无 → resolveDefaultModel()（GAME_MODEL）
  → callChatCompletion(messages=[SYSTEM_PROMPT, finalPrompt], max_tokens=8192)
  → parseGameOutput()（与 api 对齐：纯 JSON / Markdown / 截断 JSON / 纯 HTML）
  → 成功：engine='volcengine' + model 信息
  → 失败：Mock 兜底 + warning
```

### 6.5 日志与脱敏

允许打印：

- 模型 ID、模型显示名、来源、baseUrl 主机名
- 是否使用自定义配置
- 耗时、HTTP 状态码

禁止打印：

- 完整请求体（可能含 `apiKey`）
- `Authorization` 头
- 完整上游错误体（先按 200 字符截断，并移除形如 `sk-...` 的密钥片段）

---

## 7. 前端设计

### 7.1 路由与页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 新增首页下部中间的模型选择入口 |
| `/create` | Create | 读取首页选择并用于生成，展示当前/实际模型；不放置选择器 |
| `/play/:workId` | Play | 仅调整 iframe sandbox |
| `/gallery` | Gallery | 作品元信息追加模型名 |
| `/settings` | Settings | 家长验证后新增「模型配置」入口 |
| `/settings/models` | Models（新增） | 模型增删改查、测试、高级配置预留 |

### 7.2 首页模型选择与创作页使用

首页下部中间新增模型选择区（位于模板卡之后、底部导航之上）：

```text
……（Logo / 大按钮 / 模板卡）

┌──────────────────────────────────────────────┐
│ 🤖 生成模型                                  │
│ 环境变量（默认：Doubao Seed 2.0 Pro）      ▼ │
│ 默认使用服务器环境变量配置的模型             │
└──────────────────────────────────────────────┘
```

选项：

1. `环境变量（默认：<defaultModelName>）` — 默认；环境未配置时显示「环境变量（未配置默认模型）」。
2. 可用内置模型：`Doubao Seed 2.0 Pro`、`DeepSeek V4 Pro`。
3. 自定义模型：按创建时间倒序。
4. 不可用内置模型不出现在选项中（模型配置页可见原因）。

行为：

- 修改选择 → 写入 `sessionStorage`，不写入 `localStorage`。
- 新会话/新标签页 → 没有值时显示「环境变量」。
- 点击大按钮或模板卡进入创作页，选择随之生效。
- 选择的自定义模型被删除 → 自动回到「环境变量」并提示一次。
- 创作页不放置选择器，仅在生成按钮上方显示只读提示：`🤖 当前模型：环境变量 / <模型名>`；点击该提示返回首页切换。
- 生成中显示实际模型名：`🔥 Doubao Seed 2.0 Pro 正在创作…`。
- 响应 `warning` 存在时，在加载页/结果提示中显示「已降级为本地模板」。
- 作品对象写入 `modelId/modelName/modelSource`。

### 7.3 模型配置页（Models）

入口：设置页「模型配置」；设置页本身需要家长验证，模型配置页也复用 `ParentGate`，直接访问 `/settings/models` 同样需要验证。同一标签页会话内已验证过则不重复验证（`sessionStorage`：`aikids-parent-verified`），新标签页需重新验证。

```text
← 模型配置

环境变量模型（只读）
┌──────────────────────────────────────────────┐
│ Doubao Seed 2.0 Pro   [默认] [环境变量]       │
│ ep-2026…8f3a                   [测试]         │
├──────────────────────────────────────────────┤
│ DeepSeek V4 Pro       [环境变量]              │
│ 未配置 DEEPSEEK_ENDPOINT_ID                   │
└──────────────────────────────────────────────┘

自定义模型                       [+ 添加模型]
┌──────────────────────────────────────────────┐
│ 我的 GLM                                       │
│ open.bigmodel.cn · glm-4-flash                │
│ [测试] [编辑] [删除]                           │
└──────────────────────────────────────────────┘

高级配置（预留）
┌──────────────────────────────────────────────┐
│ 提示词优化        即将支持        [ 关闭 ]    │
│ 最长提示词        即将支持        [ 2000 字符]│
│ 最长等待时间      即将支持        [ 300 秒 ]  │
└──────────────────────────────────────────────┘

⚠️ 自定义模型保存在本机浏览器；API Key 仅在调用时发送给本服务，不做服务端持久化。
```

交互：

- **测试**：按钮进入 `测试中…`，完成后行内显示 `✅ 842ms` 或 `❌ 鉴权失败`；可重试。
  - 仅验证配置的模型参数能否完成调用并返回文本，不生成游戏、不写入作品。
- **添加/编辑**：模态框表单：
  - 显示名称（必填）
  - 接口地址（必填，提供预设：火山方舟 / DeepSeek / OpenAI / 自定义）
  - 模型 ID / 接入点（必填）
  - API Key（可选；密码框；编辑时留空表示不修改）
  - 保存 / 取消
- **删除**：确认弹窗；若删除的是当前选中模型，清空选择回到「环境变量」。
- **刷新环境模型**：重新请求 `GET /api/models`。
- 添加按钮在达到 20 个自定义模型时禁用并提示。
- **高级配置（预留）**：三个入口均禁用并标注「即将支持」，不持久化、不发送后端、不影响生成请求；V3.3/V3.4 再开放。

### 7.4 状态管理（AppContext）

新增状态：

```js
state.models = {
  custom: [],              // CustomModel[]
  env: [],                 // EnvModelInfo[]
  defaultModelId: null,
  defaultModelName: null,
  hasServerApiKey: false,
  loading: false,
  error: null,
};
state.selectedModelId = null; // null = 环境变量
```

新增动作：

| 动作 | 行为 |
|------|------|
| `SET_MODEL_STATE` | 合并 models 子状态 |
| `ADD_CUSTOM_MODEL` | 追加并持久化 |
| `UPDATE_CUSTOM_MODEL` | 按 ID 更新并持久化 |
| `DELETE_CUSTOM_MODEL` | 按 ID 删除并持久化；若为当前选择则清空 |
| `SET_SELECTED_MODEL` | 更新选择并写入 `sessionStorage` |

使用方：

- `Home`：渲染 `ModelPicker`，调用 `SET_SELECTED_MODEL`。
- `Create`：读取 `state.selectedModelId`，构造生成请求；展示只读当前模型提示。
- `Models`：增删改查自定义模型，删除时若命中当前选择则清空。

初始化：

1. 同步读取 `aikids-models`。
2. 异步请求 `GET /api/models`（失败不阻塞应用，记录 `error`）。
3. 读取 `aikids-selected-model`；在内置模型与自定义模型均加载完成后校验存在性，失效则回退 `null`（环境变量）。

### 7.5 前端文件变更

```text
src/
├── pages/
│   ├── Home.jsx                # 修改：首页下部中间新增模型选择入口
│   ├── Home.css                # 修改：选择区样式
│   ├── Create.tsx              # 修改：读取选择、展示当前/实际模型，不放置选择器
│   ├── Create.css              # 修改：当前模型提示样式
│   ├── Settings.jsx            # 修改：移除内联 ParentGate，新增模型配置入口
│   ├── Settings.css            # 修改：入口行样式
│   ├── Models.jsx              # 新增：模型配置页（含高级配置预留）
│   ├── Models.css              # 新增
│   └── Gallery.jsx             # 修改：展示模型名
├── components/
│   ├── ParentGate.jsx          # 新增：从 Settings 抽取
│   ├── ParentGate.css          # 新增
│   ├── ModelPicker.jsx         # 新增：首页模型选择器
│   └── ModelPicker.css         # 新增
├── context/AppContext.jsx      # 修改：模型状态与动作
├── services/
│   ├── api.js                  # 修改：models/test 接口、错误信息
│   ├── storage.js              # 修改：自定义模型读写
│   └── model-utils.js          # 新增：校验、ID 生成、显示名解析
└── App.jsx                     # 修改：新增 /settings/models 路由
```

### 7.6 前端校验

- 名称：去空格后 1-30 字符；与所有模型（内置 + 自定义，排除自身）重名时报错。
- 接口地址：以 `https://` 开头（本地 UAT 允许 `http://localhost`/`http://127.0.0.1`）；能构造合法 URL。
- 模型 ID：去空格后 1-200 字符。
- API Key：可选；保存时仅在本地，展示时脱敏为 `••••` + 后 4 位。
- 同一 `baseUrl + model` 组合不允许重复添加。

---

## 8. 安全设计

| 风险 | 措施 |
|------|------|
| 自定义接口地址被用于 SSRF | 域名白名单；仅 HTTPS；禁止 URL 账号密码；`redirect: 'error'`；localhost 仅显式开启 |
| API Key 泄露到日志/响应 | 不打印请求体与 Authorization；响应不含 Key；错误信息截断并脱敏；`GET /api/models` 只返回 `hasApiKey` |
| 浏览器保存的 Key 被生成游戏读取 | Play 页 iframe `sandbox` 移除 `allow-same-origin`，只保留 `allow-scripts`；生成游戏无法访问父页面存储 |
| 公共设备遗留 Key | 模型配置页明示本地保存；删除模型即删除 Key；不随账号同步 |
| 测试接口被当作免费 AI 代理 | 固定测试 Prompt、`max_tokens=256`、`temperature=0`、不接收自定义 Prompt |
| 生产误开 localhost 白名单 | `ALLOW_LOCAL_MODEL_HOSTS` 默认关闭，文档标注仅 UAT 使用 |

> iframe sandbox 变更属于安全前置项：V3.2 允许在浏览器保存自定义模型 Key，因此必须切断生成游戏对同源存储的访问。回归测试需确认既有游戏仍可正常游玩。

---

## 9. 兼容性

| 对象 | 兼容策略 |
|------|---------|
| 旧作品 | 无 `modelId/modelName` 时不展示模型信息，其余不变 |
| 旧设置 | `DEFAULT_SETTINGS` 不变，不新增必填字段 |
| 旧生成请求 | 不传 `model/modelId/modelConfig` → 走 `GAME_MODEL`，行为与 V3.1 一致 |
| 旧环境变量 | `VOLCENGINE_ENDPOINT_ID` 仍作为 `doubao` 的回退 |
| Remix 流程 | 生成时同样携带当前模型选择；Remix Prompt 逻辑不变 |
| Mock 降级 | 逻辑不变，新增 `warning` 字段仅为提示 |
| 本地持久化 | 修复 React StrictMode 下刷新后作品/设置被空数组覆盖的问题（改用 hydrated state 守卫） |

---

## 10. 异常与降级

| 场景 | 行为 |
|------|------|
| `GET /api/models` 失败 | 选择器只显示「环境变量」和自定义模型；模型配置页显示「无法获取环境模型」+ 重试 |
| 未配置任何内置模型 | 选择器显示「环境变量（未配置默认模型）」；生成走 Mock |
| 显式选择的内置模型未配置 | 生成返回 400，前端 alert 提示，不消耗 Mock |
| 自定义模型字段非法 | 前端表单校验拦截；后端再次校验并返回 400 |
| 自定义模型上游 401/超时 | 生成降级 Mock + `warning`；测试接口返回失败原因 |
| 自定义模型已被删除但仍在生成请求中 | 后端按配置校验失败返回 400；前端选择器会先回退到「环境变量」 |
| localStorage 写入失败 | 静默失败，不阻塞生成；控制台记录 |
| 模型测试超时 | 返回「测试超时（20 秒）」 |
| 模型返回空文本 | 测试失败「模型未返回内容」；生成走 Mock |

---

## 11. 测试策略

- **自动化（本地）**：
  - 使用 `temp/v3.2/stub-model-server.mjs` 模拟 OpenAI 兼容接口（成功、401、超时、空响应、解析变体）。
  - `temp/v3.2/api-uat.mjs`：curl/Node 验证 `GET /api/models`、`POST /api/models/test`、`POST /api/generate` 的模型解析、降级与安全校验。
  - `temp/v3.2/api-vercel-uat.mjs`：esbuild 打包 `api/` 后直接调用，验证双后端对等。
  - `temp/v3.2/model-utils.test.mjs`、`storage.test.mjs`：前端校验与存储容错。
  - `temp/v3.2/ssr-smoke.mjs`：页面渲染冒烟。
  - 验证测试接口只做短调用、不返回游戏内容。
  - `npm run build` 验证前端构建。
- **浏览器自动化（Chrome CDP）**：
  - `temp/v3.2/ui-cdp-uat.mjs`：首页选择、生成、家长验证、模型配置增删改测、iframe sandbox。
  - `temp/v3.2/ui-extra-uat.mjs`：新标签页、移动端布局、旧作品兼容。
- **手工（浏览器）**：
  - 声音输入、真机触摸、实际 AI 模型生成质量等需要人工确认的项。
- **回归**：
  - V1.0 普通创作、V2.0 Remix、V3.1 Prompt 规则、Mock 降级。
- **详细用例**：见 `docs/uat-v3.2.md`。

---

## 12. 实现优先级

| 优先级 | 项 | 阻塞发布 |
|--------|-----|---------|
| P0 | 后端模型解析 + `GET /api/models` + `POST /api/generate` 扩展 | 是 |
| P0 | 首页模型选择器 + 环境变量兜底 | 是 |
| P0 | 自定义模型增删改 + 持久化 | 是 |
| P0 | 模型测试接口 + UI（仅验证调用与返回） | 是 |
| P0 | 构建通过 | 是 |
| P1 | 安全校验（白名单、Key 脱敏、iframe sandbox） | 是 |
| P1 | 作品记录模型信息 | 是 |
| P1 | 高级配置入口预留 | 是 |
| P1 | 回归测试 | 是 |
| P2 | 模型配置页视觉细节、移动端适配 | 否（>=90%） |

---

## 13. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| `api/` 与 `server/` 模型逻辑不一致 | 中 | 高 | 统一常量与响应结构；UAT 两端跑同一组用例 |
| Vercel Function 默认超时导致测试失败 | 中 | 中 | `vercel.json` 为 `api/models/test.ts` 配置 `maxDuration: 60` |
| 自定义模型 Key 保存在浏览器 | 中 | 中 | iframe sandbox 收紧 + 家长验证 + 明示风险；后续可迁移服务端 |
| 白名单导致合法新厂商无法使用 | 中 | 低 | 支持 `ALLOWED_MODEL_HOSTS` 环境变量覆盖 |
| 模型配置随浏览器清理丢失 | 中 | 低 | UI 明示；后续版本提供导入/导出 |
| 选择器默认值被上次选择覆盖 | 低 | 中 | 选择只存 `sessionStorage`，新会话回到「环境变量」 |
| 高级配置占位被误认为已生效 | 中 | 低 | 控件禁用并标注「即将支持」，不参与请求 |
| 测试接口被滥用消耗额度 | 低 | 中 | 固定短 Prompt + 小 `max_tokens`；后续加限流 |

---

## 14. 目录与文件变更汇总

```text
docs/
├── proposal.md                 # 修改：V3.2 范围
├── design-v3.2.md              # 新增（本文件）
└── uat-v3.2.md                 # 新增

server/src/                     # 本地后端
├── index.ts                    # 修改
├── types/index.ts              # 修改
├── loadEnv.ts                  # 不变
├── services/{ai.ts,model.ts}   # 修改 / 新增
└── routes/{generate.ts,models.ts} # 修改 / 新增

api/                            # Vercel 后端
├── _model.ts                   # 新增
├── generate.ts                 # 修改
└── models/{index.ts,test.ts}   # 新增

src/                            # 前端（详见 7.5）
vercel.json                     # 修改：测试函数 maxDuration
.env.example                    # 修改：新增模型环境变量
.gitignore                      # 不变（自定义模型只在浏览器）
temp/v3.2/                      # 新增：测试桩、报告、调试输出
```

---

## 15. 验收对齐

| Proposal V3.2 条目 | Design 章节 | UAT 章节 |
|-------------------|-------------|---------|
| 首页模型选择入口 + 环境变量默认 | §3.2、§7.2 | §6.1 |
| 创作页复用选择 | §3.3、§7.2 | §6.1 |
| 环境变量兜底 | §3.2、§6.4 | §5、§6 |
| 内置模型展示 | §4.1、§5.1 | §3、§5 |
| 设置内模型配置入口 + 家长验证 | §7.1、§7.3 | §6.2 |
| 添加/编辑/删除 | §4.2、§7.3 | §6.2 |
| 模型测试（仅验证调用与返回） | §5.2、§7.3 | §5、§6.2 |
| 高级配置入口预留 | §7.3 | §6.4 |
| 自定义模型调用 | §5.3、§5.4、§6 | §5 |
| 作品记录模型 | §4.3、§7.2 | §6.3 |
| 安全约束 | §8 | §7 |
| 兼容与回归 | §9 | §8 |
| 异常降级 | §10 | §9 |

---

*本文件为 V3.2 版本的设计文档，对应 `docs/proposal.md` 和 `docs/uat-v3.2.md`。*
