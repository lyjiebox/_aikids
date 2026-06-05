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
cd frontend
npm install
npm run dev
```
前端运行在 http://localhost:3000（或 3001）

## 📁 项目结构

```
_aikids/
├── docs/          # 设计文档 (Proposal / Design / UAT)
├── server/        # Hono 后端服务
├── frontend/      # Vite + React 前端 (新版本)
├── temp/          # 临时文件
└── README.md      # 本文件
```

## ✨ 功能

- 🎨 选择游戏模板（动物/汽车/公主/恐龙/太空等）
- ✍️ 输入你的游戏创意
- 🎮 AI 生成可玩的 HTML5 小游戏
- 📚 作品本地存储
- 👨‍👩‍👧 家长控制功能

## 📝 说明

- 前端原来用 Taro 实现（见 client-taro-broken 目录），后来改成更简单的 Vite + React
- 当前 AI 游戏生成为 Mock 实现，后续可接入真实 LLM

---

*项目由 AI 助手虾片儿🦐 协助开发*
