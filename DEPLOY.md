# 部署到 Vercel

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flyjiebox%2F_aikids)

## 手动部署

1. 访问 https://vercel.com/new
2. 选择 GitHub 仓库 `_aikids`
3. Vercel 自动识别 Vite 前端与 `api/` Serverless Functions
4. 在 Project Settings → Environment Variables 配置：
   - `VOLCENGINE_API_KEY`
   - `VOLCENGINE_BASE_URL`（可选）
   - `DOUBAO_ENDPOINT_ID`
   - `DEEPSEEK_ENDPOINT_ID`
   - `GAME_MODEL`（`doubao` / `deepseek`）
   - `ALLOWED_MODEL_HOSTS`（可选）
5. 点击 Deploy

> 不要在 Vercel 生产环境设置 `ALLOW_LOCAL_MODEL_HOSTS=1`；该变量只用于本地测试。
> `vercel.json` 为 `api/generate.ts` 配置 `maxDuration=300`，为 `api/models/test.ts` 配置 `maxDuration=60`。

## 本地开发

前置：Node.js >= 20。

```bash
# 根目录依赖（前端 + 工具链）
npm install

# 本地后端依赖
npm install --prefix server

# 复制环境变量并填写
cp .env.example .env

# 终端 1：后端 http://localhost:4000
cd server && npm run dev

# 终端 2：前端 http://localhost:3000
npm run dev
```

## 发布前检查

```bash
npm run ci
```

等价于 CI 的 typecheck → build → 核心回归 → 内联检查 → 文档检查 → 构建产物冒烟。全部通过后再提交并打 tag：

```bash
git tag -a v3.4.0 -m "V3.4 工程收敛"
git push origin main --tags
```

推送后 Vercel 会自动构建预览/生产环境；在 GitHub Actions 中确认 verify job 全绿。
