# AI Kids - 儿童创意游戏平台 🎮

让孩子通过语音或文字描述，AI 生成可玩的小游戏！

## 🚀 快速开始

### 后端服务
```bash
cd server
npm install
npm run dev
```
后端运行在 http://localhost:4000

### 前端服务
```bash
npm install
npm run dev
```
前端运行在 http://localhost:3000（或 3001）

> 环境变量：复制根目录 `.env.example` 为 `.env`，填写 `VOLCENGINE_API_KEY`、`DOUBAO_ENDPOINT_ID`、`DEEPSEEK_ENDPOINT_ID`、`GAME_MODEL` 等。完整说明见 `.env.example`。

## 📁 项目结构

```
_aikids/
├── docs/               # 设计文档 (Proposal / Design / UAT)
├── src/                # Vite + React 前端
├── api/                # Vercel Serverless Functions（生产环境）
├── server/             # Hono 本地开发后端服务
├── client-taro-broken/ # ⚠️ 已废弃：早期 Taro 方案残留
├── temp/               # 临时文件
└── README.md           # 本文件
```

## ✨ 功能

- 🎨 选择游戏模板（动物/汽车/公主/恐龙/太空等）
- ✍️ 输入你的游戏创意
- 🎮 AI 生成可玩的 HTML5 小游戏
- 📚 作品本地存储
- 👨‍👩‍👧 家长控制功能
- 🤖 首页选择生成模型（V3.2）：默认跟随环境变量 `GAME_MODEL`，也可选择内置/自定义模型
- ⚙️ 设置内模型配置（家长验证）：添加、编辑、删除、测试模型；自定义模型保存在本机浏览器
- 🧪 模型测试只验证调用与返回，不生成游戏
- 🧩 高级配置入口预留：提示词优化、最长提示词、最长等待时间
- 🔄 Remix 上下文增强（V3.3）：改编时透传原游戏完整源码与结构档案，模型在原游戏基础上做最小修改；AI 不可用时保留原游戏

## 📝 说明

- 前端原来用 Taro 实现（见 `client-taro-broken/` 目录，已废弃），后来改成更简单的 Vite + React
- AI 游戏生成接入 OpenAI 兼容的 Chat Completions API（火山方舟 Ark：Doubao Seed 2.0 Pro / DeepSeek V4 Pro，也支持自定义兼容接口）
- 未选择模型时按环境变量 `GAME_MODEL` 生成；AI 不可用时自动降级到本地 Mock 游戏
- 生产环境部署在 Vercel（`api/` 作为 Serverless Functions）
- 独立域名：boxaikids.top

---

*项目由 AI 助手虾片儿🦐 协助开发*
