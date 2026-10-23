# AI Kids - 儿童创意游戏平台 🎮

让孩子通过语音或文字描述，AI 生成可玩的小游戏！

当前版本：**3.6.0（扩展性缝）**。本版本不改变主流程，重点是存储抽象与数据版本、作品 UUID、配置外置、本地 telemetry，以及为 V5.1 云端准备迁移脚本。唯一新增用户入口是 Settings 内由家长验证保护的「数据备份 / 诊断日志」。

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

### 4. 修改配置（V3.6）

模板、Prompt、内置模型清单统一放在 `shared/config/`：

```text
shared/config/templates.ts   # 模板清单 + 前端/服务端提示
shared/config/prompts.ts     # 普通 / Remix System Prompt、输出上限
shared/config/models.ts      # 内置模型、默认地址、白名单、前端预设
```

配置变更属于代码变更，改完必须重新构建：

```bash
npm run build         # 前端
npm run build:api     # Vercel Functions（api/*.ts）
npm run build:server  # 本地服务
```

本版本不提供界面内配置编辑；这样服务端 Prompt 与已部署函数始终一致。

## 💾 数据备份与诊断日志（V3.6）

Settings → 家长验证后可：

- **导出全部数据**：作品、设置、自定义模型（含 API Key）打包为 JSON 下载；
- **导入备份**：合并（默认，跳过重复）或覆盖（二次确认）；
- **导出 / 清空本地诊断日志**：生成/试玩/Remix/失败事件只存本机，不上报服务端。

> ⚠️ 备份文件包含自定义模型 API Key，请只保存在自己的设备上，不要发给别人。

## 🧪 测试与 CI

```bash
npm run typecheck      # api-src + src + server 类型检查
npm test               # 单元 + 集成 + 契约（含双端一致性）
npm run build:api      # 由 api-src + server 生成 api/*.ts（自包含）
npm run check:inline   # 生成物是否与源码同步（CI 用）
npm run check:docs     # 版本号 / CHANGELOG / design / uat / README 一致性
npm run smoke:preview  # 构建产物首页与 SPA 路由冒烟
npm run bench          # 性能/成本基线（默认本地桩；--real 调真实模型）
npm run migrate:storage -- temp/v3.6/backup.json --owner family-001  # 生成 V5.1 云端迁移数据（不含 Key）
npm run ci             # 本地等价 CI 全链路
```

测试不依赖真实 API Key：

- `tests/support/stub-model-server.mjs` 提供进程内 OpenAI 兼容测试桩；
- 集成测试用动态端口启动 `server/`，结束后自动回收；
- 双端一致性契约测试把同一请求分别打 `server/` 与 `api/`，锁定状态码、错误码与关键字段；
- 性能基线默认使用测试桩；`npm run bench -- --real` 读取 `.env`，会消耗真实额度。

GitHub Actions 在 push / pull request 时自动执行同一套检查，配置见 `.github/workflows/ci.yml`。

## 📁 项目结构

```text
_aikids/
├── .github/workflows/ci.yml  # CI：typecheck / build / 回归 / 一致性 / 冒烟
├── docs/                     # Proposal / Design / UAT
├── shared/config/            # 模板 / Prompt / 模型清单（V3.6 单一来源）
├── src/                      # Vite + React 前端
│   ├── pages/                # 首页、创作、播放、画廊、设置、模型
│   ├── components/           # 模板、语音、Remix、家长验证等
│   ├── context/              # 全局状态与 localStorage 水合
│   └── services/             # API、存储、schema、备份、telemetry、模型工具
├── api/                      # Vercel 生成物（AUTO-GENERATED，禁止手改）
│   ├── generate.ts           # ← api-src/generate.ts + server/**
│   └── models/{index,test}.ts
├── api-src/                  # Vercel 入口源码（薄适配，构建时打包）
├── server/                   # 唯一业务实现 + 本地 Hono 服务
│   ├── src/types/            # 契约类型与错误码（唯一来源）
│   ├── src/routes/           # generate / models（薄 HTTP 适配）
│   └── src/services/         # prompt / parse / mock / model / remix / metrics / generate
├── tests/                    # 单元 / 集成 / 契约测试
├── scripts/                  # API 生成、测试运行、迁移、基线、文档检查、冒烟
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
- 🧱 架构收敛（V3.5）：生成链路分层、`api/` 由源码生成、统一类型/错误码、双端一致性契约、性能/成本基线
- 🧩 扩展性缝（V3.6）：存储 schema 与导入导出、新作品 UUID、配置外置、本地 telemetry、V5.1 云端迁移脚本

## 📝 说明

- 前端使用 Vite + React 18（JavaScript + 少量 TypeScript）
- AI 生成接入 OpenAI 兼容的 Chat Completions API（火山方舟 Ark：Doubao Seed 2.0 Pro / DeepSeek，也支持自定义兼容接口）
- 未选择模型时按环境变量 `GAME_MODEL` 生成；AI 不可用时普通创作降级到本地模板，Remix 保留原游戏
- 生产环境部署在 Vercel（`api/` 作为 Serverless Functions），部署说明见 `DEPLOY.md`
- 独立域名：boxaikids.top
- 版本变更见 `CHANGELOG.md`；V3.6 设计与验收见 `docs/design-v3.6.md`、`docs/uat-v3.6.md`

---

*项目由 AI 助手虾片儿🦐 协助开发*
