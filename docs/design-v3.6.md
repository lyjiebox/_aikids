# Design: AI 儿童创意游戏平台 V3.6（扩展性缝）

> 版本：v3.6
> 对应文档：`docs/proposal.md`
> 编写日期：2026-10-23
> 说明：本版本只做内在品质——把存储、数据模型、配置、事件四条边界做成可替换的「缝」，为 V4.x 体验与 V5.1 云端留口；除 Settings 内新增「数据备份 / 诊断日志」入口外，不改变现有页面流程与交互。

---

## 1. 版本目标与范围

### 1.1 目标

1. **存储抽象**：localStorage 读写继续集中在 `src/services/storage.js`，新增 schema、规范化、导出/导入与合并策略；页面不再直接操作存储键。
2. **数据模型**：作品记录增加 `schemaVersion`、`ownerId`、`visibility`；新作品使用 UUID v4，旧作品保留原 ID。
3. **配置外置**：模板、Prompt、内置模型清单从业务代码抽离到 `shared/config/*.ts`，开发者改配置后重新构建即可生效，不提供界面编辑。
4. **事件结构**：新增本地 telemetry 事件 schema（生成 / 试玩 / Remix / 失败），只写入本地环形缓冲并支持手动导出，不上报服务端。
5. **云端迁移准备**：提供纯函数与 CLI，把本地导出转换为 V5.1 可消费的云端记录，并明确兼容策略。
6. **不改变 UX**：首页、创作、播放、画廊、模型配置的主流程与布局不变；唯一新增是 Settings 内由家长验证保护的「数据备份 / 诊断日志」区块。

### 1.2 范围

| 项目 | V3.6 | 说明 |
|------|------|------|
| 存储层集中 + schemaVersion | ✅ 必做 | `storage.js` + `storage-schema.js` |
| 作品 UUID、`ownerId`、`visibility` | ✅ 必做 | 新作品 UUID；旧作品 ID 不变 |
| 导出 / 导入 | ✅ 必做 | Settings（家长验证后）；包含自定义模型 API Key |
| 配置外置 | ✅ 必做 | `shared/config/*.ts`，改后重新构建 |
| 本地 telemetry + 导出 | ✅ 必做 | 仅 localStorage，不上报 |
| V5.1 迁移脚本与兼容策略 | ✅ 必做 | 纯函数 + `scripts/migrate-storage.mjs` |
| 界面内配置编辑 | ❌ 不做 | 明确由开发者改 TS/JSON + 重建 |
| 服务端 telemetry / 上报 | ❌ 不做 | 当前舞台约束 |
| 云端存储 / 账号 / 同步 | ❌ 不做 | 留给 V5.1 |
| 生成链路行为变化 | ❌ 不做 | Prompt 文本、模型解析、降级规则保持 V3.5 |
| 页面主流程改版 | ❌ 不做 | 仅在 Settings 内新增受控入口 |

### 1.3 已拍板的 5 个决策

| # | 问题 | 决策 | 落地方式 |
|---|------|------|----------|
| 1 | 导出/导入放在 Settings（家长验证后）？是否算「不改 UX」？ | **可以** | 只新增 Settings 区块，不加路由、不改主流程；入口在 ParentGate 之后 |
| 2 | 导出是否默认排除自定义模型 API Key？ | **不排除，包含 API Key** | 备份是完整快照；UI 明确提示文件含密钥、勿外传；不自动上传 |
| 3 | 配置外置是开发者改 JSON/TS + 重新构建，还是界面改？ | **开发者改 JSON/TS + 重建** | `shared/config/*.ts`；前端 Vite、`api/` esbuild、`server/` tsc 重新构建 |
| 4 | Telemetry 只做本地缓冲 + 导出，不上报服务端？ | **可以** | `aikids-telemetry` 环形缓冲，手动导出 JSON |
| 5 | 旧作品保留原 ID，只给新作品 UUID？ | **可以** | `normalizeWork` 保留已有 ID；`createWorkId()` 只用于新建 |

---

## 2. 现状与问题

V3.5 完成后，工程链路已收敛，但数据与配置仍与代码耦合：

1. **存储分散且无版本**：`src/services/storage.js` 直接读写三个 key，作品没有 `schemaVersion`，也没有导出/导入；一旦 V5.1 改结构，只能靠字段兼容猜测。
2. **无数据模型边界**：作品对象由 `Create.tsx` 手工拼装，新字段只能散落在页面里；`ownerId` / `visibility` 完全缺失，云端迁移需要回头补。
3. **ID 是时间戳**：`Date.now().toString()` 在同一毫秒内可能重复，也无法表达跨设备身份。
4. **配置写死在代码**：模板在 `src/config/site.js`，Prompt 在 `server/src/services/prompt.ts` 与 `remix.ts`，内置模型清单在 `server/src/services/model.ts`，模型预设在前端 `model-utils.js`；改一处要翻多个文件。
5. **没有本地事件**：生成/试玩/Remix/失败都没有结构化记录，V4.4 的本地 telemetry 面板与 V5.1 的迁移评估缺少数据来源。
6. **云端迁移无脚本**：V5.1 需要知道「哪些作品属于谁、是否公开、结构版本是什么」，目前无从导出。

---

## 3. 总体方案

### 3.1 目标结构

```text
_aikids/
├── shared/config/                 # 配置单一来源（开发者修改后重建）
│   ├── templates.ts               # 模板清单 + 模板提示 + 模板名称
│   ├── prompts.ts                 # 普通 / Remix System Prompt、输出上限、温度
│   └── models.ts                  # 内置模型、默认 Ark 地址、白名单、前端预设
├── src/
│   ├── config/site.js             # 站点配置 + 从 shared 引出的 TEMPLATES
│   ├── services/
│   │   ├── storage-schema.js      # 纯函数：schema、规范化、导出/导入/合并、云端迁移
│   │   ├── storage.js             # localStorage 读写（唯一入口）
│   │   ├── backup.js              # 文件下载 / 读取 / 大小限制
│   │   └── telemetry.js           # 本地事件环形缓冲与导出
│   ├── context/AppContext.jsx     # 水合、保存、导入快照
│   └── pages/Settings.jsx         # 数据备份 / 诊断日志入口（家长验证后）
├── server/src/services/
│   ├── prompt.ts                  # 改为读取 shared/config
│   ├── remix.ts                   # 改为读取 shared/config
│   └── model.ts                   # 改为读取 shared/config
└── scripts/migrate-storage.mjs    # V5.1 云端迁移 CLI
```

### 3.2 四条边界

| 边界 | 现在可替换什么 | V4.x / V5.1 如何接入 |
|------|----------------|----------------------|
| 存储 | localStorage ↔ 任意实现（换 IndexedDB / 远端缓存） | 只需实现同签名的 load/save；页面不碰存储键 |
| 数据模型 | 本地 ID / owner / visibility / schemaVersion | V5.1 入库时按 `schemaVersion` 迁移，`ownerId` 直接使用 |
| 配置 | 模板 / Prompt / 模型清单 | 改配置 + 重建，无需改业务代码 |
| 事件 | 本地缓冲 → 导出 → 未来消费 | V4.4 面板读同一 schema；V5.1 可加可选上报适配器（本版不实现） |

---

## 4. 详细设计

### 4.1 配置外置（`shared/config/*.ts`）

#### 4.1.1 文件与内容

`shared/config/templates.ts`

```ts
export interface GameTemplate {
  id: string;
  name: string;
  icon: string;
  promptHint: string; // 前端展示/旧字段
  aiHint: string;     // 服务端 Prompt 前缀
  category: 'animal' | 'vehicle' | 'fantasy' | 'other';
}

export const GAME_TEMPLATES: GameTemplate[] = [...];
export const TEMPLATE_LABELS: Record<string, string>; // 由 GAME_TEMPLATES 派生
export const TEMPLATE_PROMPT_HINTS: Record<string, string>; // 由 aiHint 派生
```

`shared/config/prompts.ts`

```ts
export const SYSTEM_PROMPT = `...`;        // 与 V3.1/V3.5 完全一致的文本
export const REMIX_SYSTEM_PROMPT = `...`;  // 与 V3.3/V3.5 完全一致的文本
export const GENERATION_MAX_TOKENS = 8192;
export const GENERATION_TEMPERATURE = 0.7;
export const DEFAULT_REMIX_MAX_TOKENS = 16384;
```

`shared/config/models.ts`

```ts
export interface BuiltinModelDef {
  id: string;
  name: string;
  endpointEnvVars: string[];
  primaryEndpointEnv: string;
}

export const BUILTIN_MODEL_DEFS: BuiltinModelDef[] = [...doubao, deepseek];
export const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
export const DEFAULT_ALLOWED_MODEL_HOSTS: string[] = [...];
export const MODEL_PRESETS = [...];
export const DEFAULT_MODEL_BASE_URL = MODEL_PRESETS[0].baseUrl;
```

#### 4.1.2 引用关系

| 文件 | 引用 |
|------|------|
| `src/config/site.js` | `TEMPLATES = GAME_TEMPLATES`，继续导出给 Home / Create / TemplatePicker |
| `src/services/model-utils.js` | re-export `MODEL_PRESETS` / `DEFAULT_MODEL_BASE_URL`，Models 页导入路径不变 |
| `server/src/services/prompt.ts` | `SYSTEM_PROMPT`、`GENERATION_*`、`TEMPLATE_PROMPT_HINTS` |
| `server/src/services/remix.ts` | `REMIX_SYSTEM_PROMPT`、`DEFAULT_REMIX_MAX_TOKENS`、`TEMPLATE_LABELS` |
| `server/src/services/model.ts` | `BUILTIN_MODEL_DEFS`、`DEFAULT_ARK_BASE_URL`、`DEFAULT_ALLOWED_MODEL_HOSTS` |

`prompt.ts` 与 `remix.ts` 对旧路径继续 re-export（`SYSTEM_PROMPT`、`REMIX_SYSTEM_PROMPT`），避免测试与兼容导入断裂。

#### 4.1.3 构建方式

```text
shared/config/*.ts
   ├─ Vite        → 打进入前端 bundle（改后 npm run build）
   ├─ esbuild     → 内联进 api/*.ts（改后 npm run build:api）
   └─ tsc         → 编译到 server/dist/shared（改后 npm run build:server）
```

- 不做运行时读文件：Vercel Serverless 只部署自包含 `api/*.ts`，运行时读 `shared/` 会 500。
- `server/tsconfig.json` 的 `rootDir` 从 `src` 放宽到 `..`，`outDir` 仍为 `./dist`，产物路径变为 `dist/server/src/index.js` + `dist/shared/config/*.js`；`server/package.json` 的 `start` 同步更新。
- 配置只放纯数据，不 import 任何 service / 环境变量读取逻辑，保证三端都可安全打包。

#### 4.1.4 为什么不在界面改

- 配置同时影响服务端 Prompt 与模型白名单，浏览器改不了已部署的 `api/` 函数；
- 界面改配置会重新引入「服务端持久化 + 权限」需求，与当前无账号阶段冲突；
- 本版明确：**配置变更 = 代码变更 = 重新构建**。

### 4.2 存储层与数据模型

#### 4.2.1 键与版本

| Key | 内容 | 版本 |
|-----|------|------|
| `aikids-works` | `Work[]` | 每条记录 `schemaVersion: 1` |
| `aikids-settings` | `ParentSettings` | 保持原对象，不新增字段 |
| `aikids-models` | `CustomModel[]` | 每条记录沿用原结构（不加 schemaVersion，避免改动模型契约） |
| `aikids-telemetry` | `TelemetryEvent[]` | 每条事件 `schemaVersion: 1` |

> Key 名称不变，V3.5 数据可直接读取；V3.6 写入的额外字段对 V3.5 是未知字段，可安全忽略（可回滚）。

#### 4.2.2 Work 记录

```ts
interface Work {
  id: string;                    // 旧作品：原时间戳 ID；新作品：UUID v4
  schemaVersion: 1;
  ownerId: string | null;        // 当前阶段为 null，V5.1 迁移时填充
  visibility: 'private' | 'shared' | 'public'; // 默认 private
  title: string;
  templateId: string;
  userPrompt: string;
  gameHtml: string;
  engine?: 'volcengine' | 'mock';
  modelId?: string | null;
  modelName?: string | null;
  modelSource?: 'env' | 'custom' | null;
  createdAt: number;
  playCount: number;
  generationTime?: number;
  remixFrom?: string;
  remixInstruction?: string;
  remixFromTitle?: string | null;
  remixMode?: string | null;
  remixProfile?: object | null;
  remixAudit?: object | null;
  remixCount: number;
  // 其他已有字段原样保留（前向兼容）
}
```

规范化规则（`normalizeWork`）：

1. 非对象 → `null`（丢弃）。
2. `id` 为非空字符串 → 原样保留（**旧作品不改 ID**）；缺失 → 生成 UUID。
3. `schemaVersion` 缺失或小于 1 → 视为 `1`；大于当前版本 → 保留原值（只读兼容，不降级）。
4. `ownerId` 非字符串 → `null`；`visibility` 非法 → `private`。
5. `title` / `templateId` / `userPrompt` 转字符串并限长（title 120、templateId 60、userPrompt 4000）；`gameHtml` 仅在非字符串时置空，**不做长度截断**（避免破坏旧作品；导入文件整体受 50 MB 上限保护）。
6. `createdAt` 非有限数 → 当前时间；`playCount` / `remixCount` 非负整数，默认 0。
7. 其余未知字段通过展开保留。

#### 4.2.3 新作品 ID

```ts
export function createWorkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 退化为 RFC4122 v4（getRandomValues / Math.random）
}
```

- `Create.tsx` 普通生成与 Remix 生成都改用 `createWorkId()`。
- 作品与 Remix 来源仍用字符串比较，旧 ID 与 UUID 可共存。

#### 4.2.4 设置与自定义模型

- `loadSettings` 仍返回普通对象（不注入默认值），默认值由 `AppContext` 合并，避免改变现有行为与测试期望。
- `normalizeCustomModel` 从 `storage.js` 移入 `storage-schema.js`，规则不变（字段必填、名称限长、去重、最多 20 条、`apiKey` 保留）。

### 4.3 导出格式

```json
{
  "kind": "aikids-export",
  "app": "aikids",
  "schemaVersion": 1,
  "exportedAt": "2026-10-23T02:54:38.000Z",
  "data": {
    "works": [ /* Work[] */ ],
    "settings": { "dailyTimeLimit": 30, "sessionTimeLimit": 20, "allowVoiceInput": true, "contentFilterLevel": "strict" },
    "models": [ /* CustomModel[]，含 apiKey */ ]
  }
}
```

- 导出源是 **当前内存 state**（不是 localStorage），保证刚生成的作品、刚添加的模型都在文件里。
- 文件名：`aikids-backup-YYYYMMDD-HHmm.json`（本地时间，不含密钥/标题）。
- 下载通过 `Blob` + `<a download>`，不经过任何服务端。
- **安全提示（UI 必显）**：文件包含自定义模型 API Key，仅保存在自己设备；导入后模型 Key 仍只存浏览器。

### 4.4 导入解析与合并

#### 4.4.1 接受三种输入

| 输入 | 处理 |
|------|------|
| V3.6 备份（`kind: "aikids-export"`） | 校验 `kind` / `schemaVersion`，读取 `data` |
| 旧格式对象 `{ works, settings, models }` | 视为 `schemaVersion: 0`，迁移到 1 |
| 裸作品数组 `Work[]` | 只导入作品，设置与模型为空 |

拒绝情况：

| 情况 | 结果 |
|------|------|
| 文件 > 50 MB | 拒绝，提示文件过大 |
| 非法 JSON | 拒绝，提示格式错误 |
| `kind` 不是 `aikids-export` 且不是上述兼容形态 | 拒绝 |
| `schemaVersion` > 1 | 拒绝，提示「备份来自更新版本，请升级后再导入」 |
| 所有作品/模型都非法 | 仍可导入空快照（设置可能有效），返回 0 条摘要 |

#### 4.4.2 合并模式（默认）

| 数据 | 规则 |
|------|------|
| 作品 | 按 `id` 去重；已存在 / 文件内重复 → 跳过；导入作品追加到列表前部 |
| 自定义模型 | 先按 `id`，再按 `baseUrl + model` 去重；跳过重复，最多 20 条 |
| 设置 | `{ ...当前, ...导入 }`（导入字段覆盖同名字段） |
| 当前模型选择 | 导入后若 ID 不存在，AppContext 自动回退「环境变量」 |

#### 4.4.3 覆盖模式

- 需在导入弹窗二次确认；
- 作品、设置、自定义模型全部替换为文件内容；
- 当前模型选择若不存在则清空。

#### 4.4.4 返回摘要

```ts
{
  mode: 'merge' | 'replace',
  worksAdded: number,
  worksSkipped: number,
  modelsAdded: number,
  modelsSkipped: number,
  settingsReplaced: boolean,
  totalWorks: number,
  totalModels: number
}
```

UI 在导入完成后显示摘要；失败显示可读错误，不抛出未捕获异常。

### 4.5 本地 Telemetry

#### 4.5.1 事件 schema

```ts
type TelemetryEventType = 'generate' | 'play' | 'remix' | 'failure';

interface TelemetryEvent {
  schemaVersion: 1;
  id: string;          // UUID
  type: TelemetryEventType;
  at: string;          // ISO 时间
  // generate
  mode?: 'create' | 'remix';
  ok?: boolean;        // engine === 'volcengine' 且无降级
  fallback?: boolean;
  engine?: 'volcengine' | 'mock';
  modelId?: string | null;
  modelName?: string | null;
  modelSource?: 'env' | 'custom' | null;
  templateId?: string;
  durationMs?: number;
  remixMode?: string | null;
  preserved?: boolean;
  // play
  workId?: string;
  isRemix?: boolean;
  // remix
  instructionChars?: number;
  // failure
  scope?: 'generate' | 'remix' | 'import' | 'storage';
  code?: string;
  message?: string;    // 截断 160 字符
}
```

#### 4.5.2 采集点

| 事件 | 位置 | 字段 |
|------|------|------|
| `generate` | `Create.tsx` 普通/Remix 生成成功 | mode、engine、model*、templateId、durationMs、ok（是否真实模型）、fallback（warning 或 mock）、remixMode、preserved |
| `failure` | `Create.tsx` 请求失败 / 返回 `success:false` | scope=generate/remix、code、message（截断）、durationMs |
| `failure` | Settings 导入失败 / 存储异常 | scope=import/storage、code、message |
| `play` | `Play.jsx` 进入播放页 | workId、templateId、isRemix |
| `remix` | `Play.jsx` 确认 Remix | workId、instructionChars（只记长度，不记文本） |

#### 4.5.3 缓冲与导出

- Key：`aikids-telemetry`；上限 `200` 条，超出丢最旧（环形）。
- 写入失败（quota / 隐私模式）静默忽略，不影响主流程。
- 导出：

```json
{
  "kind": "aikids-telemetry",
  "app": "aikids",
  "schemaVersion": 1,
  "exportedAt": "...",
  "events": [ /* TelemetryEvent[] */ ]
}
```

- **隐私约束**：不记录 Prompt 全文、游戏 HTML、API Key、模型接口完整地址；`modelName` / `message` 截断；`workId` 仅本地标识。
- 不做任何网络请求；服务端无 telemetry 路由。

### 4.6 V5.1 云端迁移准备

#### 4.6.1 纯函数

```ts
buildCloudMigration(snapshot, { ownerId, now }): {
  kind: 'aikids-cloud-migration',
  schemaVersion: 1,
  ownerId: string,
  migratedAt: string,
  works: Array<{
    id: string;            // 保留本地 ID，作为幂等键
    ownerId: string;
    visibility: string;    // private/shared/public
    schemaVersion: 1;
    title: string;
    templateId: string;
    gameHtml: string;
    createdAt: number;
    remixFrom?: string;
    payload: Work;         // 完整本地记录
  }>,
  models: Array<{ id, name, baseUrl, model }>  // 不含 apiKey
}
```

- 迁移只生成数据，不上传；
- 模型 API Key 不进入迁移产物（云端模型配置由 V5.1 服务端负责）；
- 作品 ID 不复用为云端主键，作为 `localId` 幂等键；云端可另发 ID。

#### 4.6.2 CLI

```bash
node scripts/migrate-storage.mjs temp/v3.6/backup.json \
  --out temp/v3.6/cloud-migration.json \
  --owner family-001
```

- 输入：V3.6 备份 / 旧格式 / 裸作品数组；
- 输出：云端迁移 JSON；
- 参数非法或解析失败 → 非 0 退出并打印原因；
- 不读取也不写入 localStorage。

#### 4.6.3 兼容策略（写入 Design，V5.1 执行）

1. **读取兼容**：V5.1 服务端必须接受缺少 `ownerId` / `visibility` / `schemaVersion` 的记录，按 `null` / `private` / `1` 处理。
2. **ID 稳定**：本地 ID 作为 `localId` 幂等键，迁移可重复执行；云端主键另发。
3. **双向兼容**：V3.6 导出的 `data` 是 localStorage 的超集；V5.1 写回本地时忽略未知字段。
4. **密钥不迁移**：API Key 仅留在本地；云端使用服务端配置或用户重新授权。
5. **降级**：云端不可用时，localStorage 继续作为本地缓存与离线数据源。

### 4.7 AppContext 变更

| 变更 | 说明 |
|------|------|
| 水合 | 继续 `loadWorks / loadSettings / loadCustomModels / loadSelectedModelId`，读取时自动规范化 |
| 持久化 | 继续三个 `useEffect` 自动保存，写入前由 storage 层规范化 |
| 新增 `importSnapshot(snapshot)` | 用 reducer `IMPORT_SNAPSHOT` 一次性替换 works/settings/custom models |
| 模型选择校正 | 导入后若选中模型不存在，沿用现有校验 effect 回退到环境变量 |

`IMPORT_SNAPSHOT` 不直接写 localStorage，仍由既有保存 effect 落盘，保持单一写入路径。

### 4.8 Settings UI

在「AI 模型配置」之后、「清空所有作品」之前新增：

```text
数据备份
  导出全部数据（含模型 Key）        →
  导入备份文件                      →
  本地诊断日志（N 条）
  [导出诊断日志]  [清空诊断日志]

⚠️ 备份文件包含自定义模型 API Key，请只保存在自己的设备上。
```

交互：

1. 导出：点击 → 生成 JSON → 浏览器下载 → 行内提示「已导出 N 个作品、M 个模型」。
2. 导入：点击 → 隐藏 `<input type="file" accept=".json,application/json">`；选中后读取、解析、展示弹窗：
   - 文件摘要（作品数 / 模型数 / 导出时间）；
   - 「合并导入」为主按钮，「覆盖导入」为危险按钮，「取消」；
   - 覆盖需再次 `confirm` 警告会替换现有数据。
3. 导入完成：行内摘要（新增/跳过/总数）；失败：行内错误，不写入任何数据。
4. 诊断日志：显示条数；导出 JSON；清空需 `confirm`。
5. 无障碍/儿童安全：按钮在 ParentGate 之后；错误信息用 `role="alert"`；不展示 Key。

不改动的页面：Home、Create（仅 ID/telemetry）、Play（仅 telemetry）、Gallery、Models。

### 4.9 错误处理

| 场景 | 行为 |
|------|------|
| localStorage 读失败 / JSON 损坏 | 返回空数据，`console.error`；应用可用 |
| localStorage 写失败 | 静默失败，主流程继续 |
| 导出时 Blob/下载失败 | 行内错误提示 |
| 导入文件超限 / JSON 错 / 版本过高 | 行内错误，数据不变 |
| telemetry 写入失败 | 静默忽略 |
| 迁移 CLI 输入非法 | 非 0 退出 + 原因 |

---

## 5. 兼容性与安全

### 5.1 兼容性

| 对象 | 影响 |
|------|------|
| 旧作品 | ID / 标题 / HTML / Remix 字段全部保留；只补 `schemaVersion/ownerId/visibility` 默认值 |
| 旧设置 | 结构不变，不补字段 |
| 旧自定义模型 | 结构不变，`apiKey` 保留；导入导出包含 Key |
| 旧客户端 / 旧备份 | 旧格式备份可导入；V3.5 读到新作品会忽略额外字段 |
| 路由 | 不变；新作品 UUID 仅作为路径参数 |
| API | 不变；本版不改生成接口 |
| `api/` 生成物 | 配置从 `shared/` 内联，产物仍自包含 |
| 本地服务 | `npm run dev` 不变；`server/dist` 路径变化，`npm start` 同步更新 |

### 5.2 安全

- **导出文件含密钥**：这是明确拍板的产品决策；UI 必须显著提示，文件名不含敏感信息，下载不经过服务端；不把导出内容写日志。
- **导入不执行内容**：只 JSON.parse + 字段校验，不 `eval`、不插入 DOM；作品 HTML 仍需用户点击播放后进入 `sandbox="allow-scripts"` iframe。
- **Telemetry 不采集内容**：不记录 Prompt、HTML、Key、完整接口地址；只记录 ID/枚举/数值/截断消息。
- **配置外置不降低校验**：自定义模型仍走服务端白名单、HTTPS 与本地地址开关校验。
- **迁移产物不含 Key**：`buildCloudMigration` 显式剔除 `apiKey`。

---

## 6. 测试策略

| 层级 | 内容 | 位置 | CI |
|------|------|------|----|
| 类型 | 前端 + api-src + server（含 shared config） | `npm run typecheck` | ✅ |
| 构建 | Vite + server tsc + api 生成物一致性 | `npm run build` / `build:server` / `check:inline` | ✅ |
| 单元 | schema/规范化/UUID/导出/导入/合并/云端迁移 | `tests/unit/storage-schema.test.mjs` | ✅ |
| 单元 | telemetry 事件、环形上限、脱敏、导出 | `tests/unit/telemetry.test.mjs` | ✅ |
| 单元 | 配置结构与 Prompt 稳定性 | `tests/unit/config.test.mjs` | ✅ |
| 回归 | 现有 storage/model-utils/remix/generate/metrics 用例 | `tests/unit/*` | ✅ |
| 集成/契约 | 不变，验证生成链路零回归 | `tests/integration` / `tests/contract` | ✅ |
| 冒烟 | 构建产物首页/路由 | `npm run smoke:preview` | ✅ |
| 手工 UAT | Settings 导出/导入/诊断日志、旧数据兼容 | `docs/uat-v3.6.md` | ❌ |
| 生产 | 首页、`/api/models`、Settings 可打开 | Vercel 冒烟 | ❌ |

通过标准：`npm run ci` 退出码 0；旧数据无需迁移即可读取；导入合并/覆盖规则与设计一致；telemetry 不含敏感内容。

---

## 7. 风险与回滚

| 风险 | 影响 | 缓解 |
|------|------|------|
| 导出文件泄露 API Key | 密钥风险 | 明确提示；文件仅本地生成；文档强调不外传；不自动上传 |
| 覆盖导入误操作 | 数据丢失 | 默认合并；覆盖需二次确认；先导出备份 |
| 旧作品被改 ID | 旧链接失效 | `normalizeWork` 明确保留已有 ID；单测锁定 |
| `shared/` 配置导致 server 构建路径变化 | 本地 `npm start` 失败 | 同步 `start` 路径；CI 跑 `build --prefix server`；UAT 验证 dist 产物 |
| `api/` 生成物漏掉配置变更 | 线上 Prompt 仍旧 | 改配置后 `npm run build:api` + `check:inline` |
| Telemetry 占满 localStorage | 主存储写入失败 | 上限 200 条、单条小、写入失败静默 |
| 导入超大文件卡顿 | 页面卡死 | 50 MB 上限；解析前检查大小 |
| 迁移 CLI 误当上传工具 | 数据外泄 | 只写本地文件；输出不含 Key；文档说明 |

回滚：`git revert <v3.6.0 commit>`。本版不删存储键、不改 API；V3.5 代码读取新记录会忽略额外字段，作品与设置不丢；已导入的数据仍在 localStorage。

---

## 8. 文件清单

| 文件 | 变更 |
|------|------|
| `shared/config/{templates,prompts,models}.ts` | 新增：配置单一来源 |
| `src/config/site.js` | 改为从 shared 导出 TEMPLATES |
| `src/services/model-utils.js` | 改为 re-export 模型预设 |
| `src/services/storage-schema.js` | 新增：规范化、schema、导出/导入/合并、云端迁移 |
| `src/services/storage.js` | 改为使用 schema；保持对外函数签名 |
| `src/services/backup.js` | 新增：下载、文件读取、大小限制 |
| `src/services/telemetry.js` | 新增：本地事件缓冲与导出 |
| `src/services/api.js` | 错误对象附带 `code` / `status`（供 telemetry） |
| `src/context/AppContext.jsx` | 新增 `IMPORT_SNAPSHOT` / `importSnapshot` |
| `src/pages/Create.tsx` | UUID 新作品 + 生成/失败 telemetry |
| `src/pages/Play.jsx` | 试玩 / Remix telemetry |
| `src/pages/Settings.jsx` + `Settings.css` | 数据备份、导入弹窗、诊断日志 |
| `server/src/services/{prompt,remix,model}.ts` | 改为读取 shared 配置 |
| `server/tsconfig.json` / `server/package.json` | rootDir/start 路径适配 shared |
| `scripts/migrate-storage.mjs` | 新增：V5.1 迁移 CLI |
| `tests/unit/{storage-schema,telemetry,config}.test.mjs` | 新增 |
| `tests/unit/storage.test.mjs` | 适配 schema（保留原断言） |
| `scripts/check-docs.mjs` | 登记新测试文件 |
| `package.json` / `server/package.json` / lock | 版本 3.6.0 |
| `docs/proposal.md`、`README.md`、`CHANGELOG.md` | 状态、说明、版本 |
| `docs/design-v3.6.md` / `docs/uat-v3.6.md` | 新增 |
| `temp/v3.6/*` | UAT 报告、备份样例 |
