# AI Kids - 儿童创意游戏平台 🎮

让孩子通过语音或文字描述，AI 生成可玩的小游戏！

当前版本：**3.4.0（工程收敛）**。本版本不改变用户可见功能，重点是 CI、可重复测试、文档一致性与发布流程。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
npm install --prefix server
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

填写 `VOLCENGINE_API_KEY`、`DOUBAO_ENDPOINT_ID`、`DEEPSEEK_ENDPOINT_ID`、`GAME_MODEL` 等。完整说明见 `.env.example`。

### 3. 启动本地服务

```bash
# 终端 1：后端 http://localhost:4000
cd server && npm run dev

# 终端 2：前端 http://localhost:3000
npm run dev
```

> 前端 `/api/*` 会代理到 `localhost:4000`。生产环境由 Vercel Functions 提供同一套 API。

## 🧪 测试与 CI

```bash
npm run typecheck      # api + src + server 类型检查
npm test               # 单元 + 集成 + 生产函数契约
npm run check:inline   # api/_model.ts 与三个自包含函数是否同步
npm run check:docs     # 版本号 / CHANGELOG / design / uat / README 一致性
npm run smoke:preview  # 构建产物首页与 SPA 路由冒烟
npm run ci             # 本地等价 CI 全链路
```

测试不依赖真实 API Key：

- `tests/support/stub-model-server.mjs` 提供进程内 OpenAI 兼容测试桩；
- 集成测试用动态端口启动 `server/`，结束后自动回收；
- 生产函数契约测试直接调用 `api/generate.ts`，防止双实现漂移。

GitHub Actions 在 push / pull request 时自动执行同一套检查，配置见 `.github/workflows/ci.yml`。

## 📁 项目结构

```text
_aikids/
├── .github/workflows/ci.yml  # CI：typecheck / build / 回归 / 一致性 / 冒烟
├── docs/                     # Proposal / Design / UAT
├── src/                      # Vite + React 前端
│   ├── pages/                # 首页、创作、播放、画廊、设置、模型
│   ├── components/           # 模板、语音、Remix、家长验证等
│   ├── context/              # 全局状态与 localStorage 水合
│   └── services/             # API、存储、模型工具、Remix 分析
├── api/                      # Vercel Serverless Functions（生产）
│   ├── _model.ts             # 模型核心内联源
│   ├── generate.ts           # 自包含生成函数（由脚本内联）
│   └── models/{index,test}.ts
├── server/                   # Hono 本地开发服务
│   ├── src/routes/           # generate / models
│   └── src/services/         # ai / model / remix
├── tests/                    # 单元 / 集成 / 契约测试
├── scripts/                  # 测试运行、内联同步、文档检查、冒烟
├── temp/                     # 历史 UAT 报告与截图（测试脚本已迁入 tests/）
├── CHANGELOG.md
├── tsconfig.json
└── README.md
```

## ✨ 功能

- 🎨 选择游戏模板（动物/汽车/公主/恐龙/太空等）
- ✍️ 语音或文字输入，AI 生成可玩的 HTML5 小游戏
- 📚 作品本地存储（`localStorage`）
- 👨‍👩‍👧 家长控制：时长限制、家长验证
- 🤖 首页选择生成模型（V3.2）：默认跟随 `GAME_MODEL`，也可选择内置/自定义模型
- ⚙️ 设置内模型配置：添加、编辑、删除、测试；自定义模型保存在本机浏览器
- 🧪 模型测试只验证调用与返回，不生成游戏
- 🔄 Remix 上下文增强（V3.3）：改编时透传原游戏完整源码与结构档案，模型在原游戏基础上做最小修改；AI 不可用时保留原游戏
- 🧰 工程保障（V3.4）：类型检查、CI、生成/Remix/存储三条核心路径回归、发布流程

## 📝 说明

- 前端使用 Vite + React 18（JavaScript + 少量 TypeScript）
- AI 生成接入 OpenAI 兼容的 Chat Completions API（火山方舟 Ark：Doubao Seed 2.0 Pro / DeepSeek，也支持自定义兼容接口）
- 未选择模型时按环境变量 `GAME_MODEL` 生成；AI 不可用时普通创作降级到本地模板，Remix 保留原游戏
- 生产环境部署在 Vercel（`api/` 作为 Serverless Functions），部署说明见 `DEPLOY.md`
- 独立域名：boxaikids.top
- 版本变更见 `CHANGELOG.md`；V3.4 设计与验收见 `docs/design-v3.4.md`、`docs/uat-v3.4.md`

---

*项目由 AI 助手虾片儿🦐 协助开发*
