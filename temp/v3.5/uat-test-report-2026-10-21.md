# V3.5 UAT 测试报告

> 版本：v3.5
> 日期：2026-10-21
> 环境：macOS，Node v24.18.0，npm 11.16.0，Chrome Headless（最新稳定版）
> 对应文档：`docs/design-v3.5.md`、`docs/uat-v3.5.md`
> 执行方式：本地自动化 + 真实模型基线 + Chrome Headless 抽查；Vercel 部署后追加生产冒烟

---

## 1. 结论

| 项目 | 结果 |
|------|------|
| 本地 CI（typecheck / build / server build / test / check:inline / check:docs / smoke） | ✅ 退出码 0 |
| 自动化测试 | ✅ 63/63 通过（unit + integration + contract） |
| 双端一致性 | ✅ 9/9 通过（状态码 / 错误码 / 字段 / 内容一致） |
| 生成物一致性 | ✅ 3/3 生成物与源码同步 |
| 桩模式基线 | ✅ 24 次，成功率 100%，p50 3.62ms / p90 5.81ms |
| 真实模型基线 | ⚠️ 8 次，成功 7 次（87.5%），doubao B2 出现一次上游连接失败；p50 67.5s / p90 180.2s |
| UI 抽查 | ✅ 首页 / 创作 / 画廊 / 设置 / 模型 / 播放均渲染 |
| 生产冒烟 | ⏳ 推送后执行（见第 7 节） |

> 补充（2026-10-21 晚间）：首次远端 CI（run `39611179318`）在 Node 20 下 `PARSE-03` 失败，原因是测试用 `.ts` 后缀导入 `GameParseError`，与 service 的省略扩展名导入形成两个模块实例，`instanceof` 不成立；Node 24 未暴露。已改为断言 `error.name + code`，并用本地 Node 20.20.2 复跑 63/63 通过。修复提交待推送。

未发现 P0/P1 代码缺陷；真实模型一次失败为上游网络问题，已如实记录，未用桩结果冒充。

---

## 2. 环境与命令

```bash
# 干净安装
npm ci --cache .npm-cache
npm ci --prefix server --cache .npm-cache

# 本地 CI 全链路
npm run ci
```

结果：退出码 0。完整日志：`temp/v3.5/ci-run-1.log`。

分项：

| 命令 | 结果 | 证据 |
|------|------|------|
| `npm run typecheck` | ✅ | api-src + src + server 无 error |
| `npm run build` | ✅ | 67 modules，dist 生成 |
| `npm run build:server` | ✅ | server/dist 生成 |
| `npm test` | ✅ 63 pass / 0 fail | 见第 3 节 |
| `npm run check:inline` | ✅ | api/generate.ts、api/models/{index,test}.ts 均 `ok` |
| `npm run check:docs` | ✅ | version=3.5.0，tests=9 |
| `npm run smoke:preview` | ✅ | 首页、/create、JS 资源、SPA fallback |

---

## 3. 自动化测试明细

```text
ℹ tests 63
ℹ pass 63
ℹ fail 0
```

| 分组 | 文件 | 覆盖 |
|------|------|------|
| unit | `storage.test.mjs` | 作品 / 设置 / 自定义模型容错与往返 |
| unit | `model-utils.test.mjs` | 模型校验、脱敏、展示、请求参数 |
| unit | `remix-core.test.mjs` | Remix 档案 / Prompt / 预算 / 审计 / 前后端规则一致 |
| unit | `generate-service.test.mjs` | 请求校验、Remix 判定、五种解析、无模型降级、错误码 |
| unit | `metrics.test.mjs` | p50/p90、token 估算、成本换算、指标日志脱敏 |
| integration | `generate.test.mjs` | 生成成功、Prompt 契约、空 Prompt、非法 JSON、白名单、上游 500、空输出降级 |
| integration | `remix.test.mjs` | full / outline / preview / fallback / 审计 / 纯 HTML / 无模型 / 只有 remixFrom / 空输出 |
| contract | `production-api.test.mjs` | 生产函数正常/Remix/错误码/Key 不回显/空输出降级 |
| contract | `parity.test.mjs` | 双端：普通、Remix、空 Prompt、非法 JSON、数组 body、未知模型、上游 500（普通/Remix）、模型目录 |

新增/加强的断言：

- 错误响应必须含 `code`：`EMPTY_PROMPT`、`INVALID_JSON`、`INVALID_BODY`、`MODEL_NOT_FOUND`、`MODEL_CONFIG_INVALID`；
- 只有 `remixFrom`、没有 `remixInstruction` 时按普通生成处理；
- `stub-empty` 时普通生成降级本地模板、Remix 保留原游戏；
- 双端 `data` 字段集合、`gameHtml`、`remixAudit` 完全一致。

---

## 4. 生成物与分层

| 检查 | 结果 |
|------|------|
| `api/generate.ts` 顶部 `AUTO-GENERATED FILE — DO NOT EDIT.` | ✅ |
| 生成物不含 `../server` / `_model` 相对导入 | ✅（构建脚本 + `check-docs` 双重校验） |
| `npm run build:api` 后 `git diff -- api/` 为空 | ✅ |
| 业务实现只在 `server/src/**`；`api-src/*` < 40 行 | ✅ |
| 类型只在 `server/src/types/index.ts` 定义 | ✅（service 内仅 re-export） |

---

## 5. 性能与成本基线

### 5.1 桩模式（链路与统计逻辑）

```bash
npm run bench -- --runs 3 --out temp/v3.5/baseline-stub-2026-10-21
```

| 指标 | 值 |
|------|----|
| 请求数 | 24（2 模型 × 4 场景 × 3 轮） |
| p50 | 3.62 ms |
| p90 | 5.81 ms |
| 成功率 | 100% |
| 降级率 | 0% |
| 平均 token | 100 输入 / 200 输出（桩固定 usage） |

结果文件：`temp/v3.5/baseline-stub-2026-10-21.{json,md}`。

### 5.2 真实模型（doubao / deepseek）

```bash
npm run bench -- --real --models doubao,deepseek --runs 1 \
  --out temp/v3.5/baseline-real-2026-10-21
```

| 模型 | 请求 | p50 | p90 | 成功率 | 降级率 | 平均输入 token | 平均输出 token |
|------|------|-----|-----|--------|--------|----------------|----------------|
| doubao | 4 | 60.0 s | 67.5 s | 75% | 25% | 476 | 2464.3 |
| deepseek | 4 | 154.2 s | 180.2 s | 100% | 0% | 491.5 | 7386 |
| 合计 | 8 | 67.5 s | 180.2 s | 87.5% | 12.5% | 483.8 | 4925.1 |

结果文件：`temp/v3.5/baseline-real-2026-10-21.{json,md}`。

说明：

- doubao 的 `B2-打地鼠` 请求在 60s 后返回「无法连接模型接口」并降级本地模板；其余 7 次由真实模型成功生成。
- 失败样本没有 token 用量，因此总览 token 标记为「部分估算」；成功样本均优先使用上游 `usage`。
- 每场景仅 1 次真实样本，p90 不具统计意义，仅作为趋势参考；扩大样本需额外消耗额度。
- 未配置单价，因此成本显示「未配置单价」；配置 `BENCH_INPUT_PRICE_PER_1K` / `BENCH_OUTPUT_PRICE_PER_1K` 后可直接换算。

---

## 6. UI 抽查（Chrome Headless）

启动 `server/`（真实 `.env`）+ `npm run dev`，用 Chrome Headless dump DOM：

| 路由 | 结果 |
|------|------|
| `/` | ✅ `<title>AI 魔法游戏</title>`，挂载点，模型/作品/设置入口 |
| `/create` | ✅ 创作页、导航渲染 |
| `/gallery` | ✅ 作品页渲染 |
| `/settings` | ✅ 家长验证入口渲染 |
| `/settings/models` | ✅ 家长验证入口渲染 |
| `/play/demo` | ✅ 播放页骨架渲染 |

本版本未改 UI 组件；抽查以「页面可渲染、关键入口存在」为准。

---

## 7. 生产冒烟（待推送后执行）

```bash
PROD_URL=https://boxaikids.top
curl -sS -o /dev/null -w '%{http_code}\n' "$PROD_URL/"
curl -sS "$PROD_URL/api/models" | head -c 500
```

待记录：首页状态码、`/api/models` 响应、生成/Remix（有 Key 时）、Vercel 部署 commit、远端 CI 结果。

---

## 8. 未覆盖 / 风险

| 项 | 说明 |
|----|------|
| 真实模型样本量 | 每场景 1 次，p90 仅趋势；失败 1 次为上游网络问题，未复现 |
| 生产生成/Remix | 待 Vercel 部署后验证；若无 Key/额度，按 UAT 规则记录为未验证 |
| 成本换算 | 未配置单价，只记录 token；成本口径已文档化 |
| 浏览器兼容 | 仅 Chrome Headless 抽查，未做 Safari/移动端真机 |
| 并发/限流 | V3.5 不做，留给 V5.0 |
