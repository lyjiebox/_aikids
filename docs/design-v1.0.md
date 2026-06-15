# Design: AI 儿童创意游戏平台 V1.0

## 1. 目标

基于 `docs/proposal.md`，实现一个面向中国 3-10 岁儿童的 AI 创意游戏平台 MVP。

V1.0 聚焦：
- 基于 Taro 的跨端项目骨架，H5 端（PC + 手机 Web）可运行
- 独立后端 API 服务
- 语音输入 → AI 生成可交互小游戏的核心闭环
- 预设游戏模板库
- 作品列表与回放
- 基础家长控制

## 2. 文档与临时文件规范（V1.0）

- V1.0 Proposal 存放在：`docs/proposal.md`
- V1.0 Design 存放在：`docs/design-v1.0.md`
- V1.0 UAT 存放在：`docs/uat-v1.0.md`
- V1.0 临时文件统一存放在：`temp/v1.0/`
- V1.0 测试报告、临时代码、调试输出等，不得放在项目根目录，必须放入 `temp/v1.0/`

## 3. 技术栈

### 3.1 前端

- 框架：Vite + React 18（JavaScript，部分组件使用 TypeScript）
- 路由：React Router v6（BrowserRouter）
- 样式：普通 CSS 文件（明亮多彩儿童风格）
- 状态管理：React Context + useReducer
- 语音输入（H5）：浏览器 Web Speech API（V1.0）；V1.1 起迁移到后端语音识别服务
- 游戏运行（H5）：iframe sandbox
- 构建工具：Vite
- Package Manager：npm

### 3.2 后端

- 运行时：Node.js
- 框架：Hono（轻量，支持 Vercel Functions / 本地 Node.js 服务）
- 语言：TypeScript（严格模式）
- AI 生成：火山引擎 Responses API（支持 Seed 2.0 Pro、DeepSeek、GLM 等模型）
- 语音识别（V1.1+）：后端代理调用第三方语音识别服务
- 存储：V1.0 前端 localStorage；V1.1 起迁移到云存储
- 部署：Vercel Functions（生产环境 `api/` 目录）+ 本地 `server/` 开发服务

### 3.3 架构图

```
┌─────────────────────────────────────┐
│         Vercel 生产环境              │
│  api/generate.ts  Serverless Func   │
│  src/             静态站点 (Vite)    │
└──────────────┬──────────────────────┘
               │ HTTP
   ┌───────────┴───────────┐
   │                       │
   ▼                       ▼
┌──────────┐        ┌──────────────┐
│ V1: Vite │        │ V2: Taro     │
│ React    │        │ 微信小程序    │
│ H5 Web   │        │              │
└──────────┘        └──────────────┘

本地开发：
  Vite (localhost:3000) → proxy /api → server/ (localhost:4000)
```

## 4. 目录结构设计

```text
_aikids/
├── docs/
│   ├── proposal.md
│   ├── design-v1.0.md
│   └── uat-v1.0.md
├── temp/
│   └── v1.0/
├── src/                              # Vite + React 前端
│   ├── main.jsx                      # 应用入口
│   ├── App.jsx                       # 根组件（路由配置）
│   ├── index.css                     # 全局样式
│   ├── config/
│   │   └── site.js                   # 统一配置（模板列表、站点信息）
│   ├── context/
│   │   └── AppContext.jsx            # 全局状态（作品列表、家长设置）
│   ├── hooks/
│   │   └── useSpeechRecognition.ts   # 语音识别 Hook（Web Speech API）
│   ├── services/
│   │   ├── api.js                    # 后端 API 调用封装
│   │   └── storage.js                # 本地存储（作品、设置）
│   ├── components/
│   │   ├── Navbar.jsx                # 底部导航栏
│   │   ├── VoiceInput.tsx            # 语音输入组件（按住说话按钮）
│   │   ├── TemplatePicker.jsx        # 模板选择器
│   │   ├── LoadingAnimation.jsx      # AI 生成等待动画
│   │   └── *.css                     # 各组件样式
│   └── pages/
│       ├── Home.jsx                  # 首页（创作入口）
│       ├── Create.tsx                # 创作页（模板选择 + 语音输入 + 生成）
│       ├── Play.jsx                  # 游戏播放页（iframe 沙箱）
│       ├── Gallery.jsx               # 作品列表页
│       ├── Settings.jsx              # 家长设置页（含 ParentGate）
│       └── *.css                     # 各页面样式
├── api/                              # Vercel Serverless Functions
│   └── generate.ts                   # POST /api/generate（AI 游戏生成）
├── server/                           # 本地开发后端
│   ├── src/
│   │   ├── index.ts                  # Hono 服务入口
│   │   ├── loadEnv.ts                # 环境变量加载
│   │   ├── routes/
│   │   │   └── generate.ts           # 本地 AI 生成路由
│   │   └── test-generate.ts          # 本地测试脚本
│   ├── package.json
│   └── tsconfig.json
├── client-taro-broken/               # ⚠️ 已废弃：Taro 方案残留
├── index.html                        # Vite 入口 HTML
├── vite.config.js                    # Vite 构建配置
├── vercel.json                       # Vercel 部署配置
├── package.json                      # 前端依赖
├── README.md
└── DEPLOY.md
```

## 5. 数据模型

### 5.1 GameTemplate

```ts
export type GameTemplate = {
  id: string;
  name: string;           // 模板名称（中文）
  icon: string;           // 模板图标路径
  promptHint: string;     // 给 AI 的 Prompt 提示前缀
  category: 'animal' | 'vehicle' | 'fantasy' | 'nature' | 'other';
};
```

### 5.2 GameWork

```ts
export type GameWork = {
  id: string;
  title: string;          // 游戏标题
  templateId: string;     // 使用的模板 ID
  userPrompt: string;     // 用户的原始语音输入文本
  gameHtml: string;       // AI 生成的完整 HTML 游戏代码
  engine: 'volcengine' | 'mock';  // AI 引擎类型（volcengine=火山引擎, mock=本地降级）
  createdAt: number;      // 创建时间戳
  playCount: number;      // 游玩次数
  generationTime?: number; // 生成耗时（秒），V1.0.1 新增
};
```

### 5.3 ParentSettings

```ts
export type ParentSettings = {
  dailyTimeLimit: number;     // 每日使用时长限制（分钟），默认 30
  sessionTimeLimit: number;   // 单次使用时长限制（分钟），默认 20
  allowVoiceInput: boolean;   // 是否允许语音输入，默认 true
  contentFilterLevel: 'strict' | 'moderate';  // 内容过滤级别
};
```

### 5.4 AppState

```ts
export type AppState = {
  works: GameWork[];              // 本地作品列表
  settings: ParentSettings;       // 家长设置
  isGenerating: boolean;          // 是否正在生成游戏
  generationProgress: string;     // 生成进度提示文本
};
```

## 6. 页面设计

### 6.1 首页 — `pages/index/index`

**职责**：作为儿童进入 App 的第一屏，提供清晰的创作入口。

**页面元素**：
- 顶部：App Logo + 名称「AI 魔法游戏」
- 中央大按钮：「🎤 说出你的游戏创意」（主要 CTA）
- 下方：「或者选一个主题开始 →」+ 横向滑动的模板卡片（3-4 个精选模板）
- 底部 Tab 导航：「首页」「作品」「设置」

**交互**：
- 点击中央大按钮 → 跳转创作页 `/pages/create/index`
- 点击模板卡片 → 跳转创作页并预选该模板
- 底部 Tab 切换页面

**视觉风格**：
- 明亮渐变背景（天空蓝到浅紫）
- 大圆角卡片（border-radius: 24px）
- 可爱的 emoji 图标
- 字体大小 18px+，适合儿童阅读

### 6.2 创作页 — `pages/create/index`

**职责**：引导儿童完成「选择模板 → 语音输入 → AI 生成」的创作流程。

**页面元素**：
- 顶部：返回按钮 + 步骤指示器（①选主题 → ②说想法 → ③生成游戏）
- 步骤 1 — 模板选择区：网格布局展示所有模板，点击选中高亮
- 步骤 2 — 语音输入区：大圆形麦克风按钮（按住说话，松开结束）
  - 语音识别实时文本展示
  - 也支持手动输入文字（大输入框，给识字的孩子用）
- 步骤 3 — 生成按钮：「✨ 开始生成」
- 生成中：LoadingAnimation 组件（彩色旋转 + 进度文字）

**交互流程**：
```
选择模板（可选，默认"自由创作"）
    → 点击麦克风按钮开始录音
    → 松开后语音转文字展示
    → 可修改文字或重新录音
    → 点击「开始生成」
    → 显示加载动画
    → 生成完成后自动跳转播放页
```

### 6.3 游戏播放页 — `pages/play/index`

**职责**：在安全沙箱中运行 AI 生成的游戏。

**页面元素**：
- 全屏 iframe 运行游戏（H5 端）
- 顶部浮动栏：游戏标题 + 退出按钮（×）
- 底部浮动栏：重新开始 + 保存到作品集

**安全措施**：
- iframe 使用 `sandbox="allow-scripts allow-same-origin"` 属性
- 不允许顶层导航、弹窗、表单提交
- 游戏代码在注入前做基础 XSS 过滤

**V2 小程序适配说明**：
- 小程序端使用 `<web-view>` 组件替代 iframe
- 游戏 HTML 通过后端生成一个临时 URL，web-view 加载该 URL

### 6.4 作品列表页 — `pages/gallery/index`

**职责**：展示该设备上所有生成过的游戏作品。

**页面元素**：
- 顶部：标题「我的作品」
- 网格布局展示 GameCard 组件（缩略图 + 标题 + 创建时间）
- 空状态：可爱的插画 + 「还没有作品哦，去创作一个吧！」
- 长按 GameCard → 弹出删除确认

**交互**：
- 点击 GameCard → 跳转播放页
- 长按 → 删除确认弹窗

### 6.5 家长设置页 — `pages/settings/index`

**职责**：家长管理使用时长和内容设置。

**页面元素**：
- 进入前：ParentGate 组件（简单算术验证，如「3 + 5 = ?」）
- 验证通过后：
  - 每日使用时长滑块（10-60 分钟）
  - 单次使用时长滑块（10-30 分钟）
  - 语音输入开关
  - 内容过滤级别选择
  - 「清除所有作品」按钮（二次确认）

## 7. API 契约

### 7.1 后端 API 总览

| 方法 | 路径 | 说明 | V1.0 | V1.1 |
|---|---|---|---|---|
| POST | `/api/generate` | AI 游戏生成 | ✅ | ✅ |
| GET | `/api/works` | 获取作品列表 | ❌ | ✅ |
| POST | `/api/works` | 保存作品 | ❌ | ✅ |
| DELETE | `/api/works/:id` | 删除作品 | ❌ | ✅ |
| POST | `/api/speech` | 语音识别 | ❌ | ✅ |

**部署说明**：
- 生产环境（Vercel）：`api/generate.ts` 作为 Serverless Function 处理 `/api/generate`
- 本地开发：`server/` 目录下的独立 Hono 服务（端口 4000），Vite 通过 proxy 转发 `/api/*` 请求

### 7.2 AI 游戏生成 API

**请求**：
```ts
POST /api/generate
Content-Type: application/json

{
  templateId: string;     // 模板 ID（可选，默认 "free"）
  userPrompt: string;     // 用户语音转文字内容
}
```

**响应**：
```ts
{
  success: true;
  data: {
    gameHtml: string;       // 完整的 HTML 游戏代码
    title: string;          // AI 生成的游戏标题
    engine: 'volcengine' | 'mock';  // AI 引擎类型
  }
}
```

**AI 引擎**：
- `volcengine`：火山引擎 Responses API 生成（需配置 `VOLCENGINE_API_KEY` + `VOLCENGINE_ENDPOINT_ID`）
- `mock`：AI 不可用时的本地降级游戏（预设 2 个简单游戏）

**AI Prompt 设计原则**：
- System Prompt 中明确：生成面向 3-10 岁儿童的简单 HTML5 游戏
- 要求：单文件 HTML（含内联 CSS + JS），可直接在 iframe 中运行
- 要求：色彩明亮、操作简单（点击/拖拽为主）、无暴力内容
- 要求：游戏时长控制在 30 秒 - 3 分钟
- 要求：包含音效反馈（可选，Web Audio API 简单实现）
- 限制：不使用外部资源，所有素材用 CSS/Canvas 绘制
- 输出格式：JSON `{ "title": "...", "html": "..." }`
- `max_output_tokens`：8192（V1.0.1 从 4096 上调，避免完整 HTML 被截断）

**解析容错**（V1.0.1 增强）：
- 策略 1：直接 JSON.parse
- 策略 2：提取 ````json` 代码块
- 策略 3：提取 ```` ` 代码块
- 策略 4：JSON 被截断时正则提取 title 和 html
- 策略 5：AI 返回纯 HTML 时直接使用

### 7.3 语音识别（V1.0）

V1.0 使用浏览器 Web Speech API（前端直接调用，不走后端）：
```ts
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
```

- 语言：zh-CN（中文普通话）
- 连续识别：false（单次识别）
- 中间结果：显示 interimResults 做实时反馈

**降级方案**：若浏览器不支持 Web Speech API，显示大文本输入框作为替代。

**V1.1 升级**：迁移到后端 `/api/speech`，使用第三方语音识别服务，提升兼容性和准确率。

## 8. 路由设计（React Router）

```jsx
// src/App.jsx — 路由配置
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/create" element={<Create />} />
  <Route path="/play/:workId" element={<Play />} />
  <Route path="/gallery" element={<Gallery />} />
  <Route path="/settings" element={<Settings />} />
</Routes>
```

**底部导航**：自定义 Navbar 组件（React Router Link），固定在页面底部：
- 🏠 首页 → `/`
- 🎮 作品 → `/gallery`
- ⚙️ 设置 → `/settings`

**页面参数传递**：
- 播放页通过路由参数传递 `workId`：`navigate(\`/play/${work.id}\`)`
- 创作页通过 URL 查询参数传递预选模板：`navigate(\`/create?templateId=${templateId}\`)`

## 9. 错误处理

- AI 生成失败：显示友好提示「魔法好像失灵了，再试一次吧！」，提供重试按钮
- 语音识别失败：自动降级到文字输入模式
- iframe 加载失败：显示「游戏加载失败」提示
- 本地存储满：提示清理旧作品
- 网络断开：提示需要网络连接（AI 生成需要）
- 后端 API 不可达：显示「服务器连接失败」，V1.0 降级为纯前端模式

## 10. 代码规范

- JavaScript/TypeScript 混合使用（前端 JS + 少量 TS，后端 TS strict）
- 公开导出的函数或组件必须包含 JSDoc 注释
- 组件使用函数式组件 + Hooks
- 样式使用普通 CSS 文件，全局变量定义在 `index.css`
- 不引入第三方 UI 库（保持轻量）
- 移动端优先，使用响应式设计

## 11. 开发边界

V1.0 不做：
- 用户注册/登录
- 云端存储与同步（V1.1）
- 社交功能（Remix 等）
- 教师端后台（V3.0）
- 付费系统（V4.0）
- 微信小程序编译（V2.0）
- 原生 App 封装
- 复杂内容审核（仅做基础 Prompt 关键词过滤）
- 后端语音识别服务（V1.1）
- 缩略图生成
- 实际时长限制逻辑（仅有 UI 设置项）
