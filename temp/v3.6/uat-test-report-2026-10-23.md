# V3.6 UAT 测试报告

> 版本：v3.6（扩展性缝）
> 日期：2026-10-23
> 环境：macOS，Node v24.18.0，npm 11.16.0，Chrome 156.0.8078.47（Headless）
> 对应文档：`docs/design-v3.6.md`、`docs/uat-v3.6.md`

---

## 1. 结论

| 项 | 结果 |
|----|------|
| 本地 CI（typecheck / build / build:server / test / check:inline / check:docs / smoke） | ✅ 通过（连续 2 次） |
| 自动化测试 | ✅ 91/91 通过 |
| 配置外置（前端 / api / server 三端） | ✅ 通过 |
| 存储 schema / 旧作品 ID / UUID / 导出导入 / 合并覆盖 | ✅ 通过 |
| 本地 telemetry（四类事件、上限、脱敏、导出） | ✅ 通过 |
| Settings 导出/导入真实 UI 流程 | ✅ 26 项检查通过 |
| 创作 / UUID / 生成与 Remix telemetry UI 流程 | ✅ 12 项检查通过 |
| V5.1 迁移 CLI | ✅ 通过 |
| 编译后的 `server/dist` 启动 | ✅ 通过 |
| 远端 CI | ✅ run 39893330258（a71db4d）success |
| Vercel 生产冒烟 | ✅ 部署 7269173611（a71db4d）success；生产 UI UAT 26/26 |

---

## 2. 自动测试

### 2.1 全量 CI

```bash
npm run ci
```

结果：退出码 0。日志：`temp/v3.6/ci-run-2.log`。

阶段结果：

| 阶段 | 结果 |
|------|------|
| `typecheck`（前端 + server + shared） | ✅ |
| `build`（Vite） | ✅ |
| `build:server`（tsc，含 `shared/`） | ✅ |
| `npm test` | ✅ 91/91 |
| `check:inline`（3 个 api 生成物） | ✅ |
| `check:docs`（version=3.6.0，tests=12） | ✅ |
| `smoke:preview`（首页/SPA/JS/404） | ✅ |

### 2.2 新增单元测试

| 文件 | 覆盖 |
|------|------|
| `tests/unit/storage-schema.test.mjs` | UUID、旧 ID 保留、schema 字段、HTML 不截断、导出信封、三种导入格式、非法/未来版本、合并/覆盖、模型上限、云端迁移、全链路 |
| `tests/unit/telemetry.test.mjs` | 四类事件、未知类型、200 条上限、敏感字段过滤、消息脱敏、非法字段、写入异常、导出信封 |
| `tests/unit/config.test.mjs` | 模板唯一性、名称/提示派生、Prompt 与参数零漂移、模型清单/白名单、业务层不再内联、前端从 shared 读取 |

全量 `npm test`：91 项通过，0 失败。

---

## 3. Settings 导出/导入 UI UAT（Headless Chrome）

脚本：`temp/v3.6/ui-uat.mjs`（本地前端 :3000 + 后端 :4000）。

种子数据：2 个旧作品（时间戳 ID）、1 个自定义模型（含测试 Key）、默认设置。

| 检查 | 结果 |
|------|------|
| Settings 显示数据备份区块 | ✅ |
| Settings 显示「备份包含 API Key」警告 | ✅ |
| Settings 显示本地诊断日志 | ✅ |
| 点击导出生成 `aikids-backup-*.json` | ✅ |
| 备份 `kind/schemaVersion` 正确 | ✅ |
| 备份含 2 个作品、1 个模型、API Key | ✅ |
| 旧作品 ID 保留在备份中 | ✅ |
| 导入弹窗显示文件作品/模型数量与导出时间 | ✅ |
| 合并导入保留旧作品与原 ID | ✅ |
| 合并导入新增 1 个作品、跳过 1 个重复作品 | ✅ |
| 合并导入新增 1 个模型 | ✅ |
| 设置按导入值合并（30 → 45） | ✅ |
| 合并摘要含新增/跳过计数 | ✅ |
| 导入作品补齐 schema / owner / visibility | ✅ |
| 非法 JSON 不修改现有作品 | ✅ |
| 非法导入显示错误并记录 failure telemetry | ✅ |
| 进入播放页记录 play 事件 | ✅ |
| 导出诊断日志文件 | ✅ |
| 诊断日志不含 HTML / Prompt / Key | ✅ |

> 26 项检查全部通过，无控制台未捕获异常。

---

## 4. 创作 / UUID / Telemetry UI UAT（无模型 Mock）

脚本：`temp/v3.6/create-uat.mjs`（后端以空模型环境启动，确保不消耗真实额度）。

| 检查 | 结果 |
|------|------|
| 创作页渲染输入框，URL 预选模板 | ✅ |
| Mock 生成成功并保存 1 个作品 | ✅ |
| 新作品 ID 为 UUID v4 | ✅ |
| 新作品含 `schemaVersion=1 / ownerId=null / visibility=private` | ✅ |
| 生成成功跳转 `/play/<uuid>` | ✅ |
| 记录 `generate` 事件（create / mock / ok=false） | ✅ |
| 事件不含 Prompt / HTML | ✅ |
| 播放页打开 Remix 弹窗 | ✅ |
| 确认 Remix 记录 `remix` 事件（仅 instructionChars） | ✅ |
| 无模型 Remix 不产生重复作品 | ✅ |
| Remix 保留原游戏时仍记录 `generate` 事件（mode=remix） | ✅ |

> 12 项检查全部通过。

---

## 5. 配置外置验证

```bash
npm run typecheck
npm run build
npm run build:server
npm run build:api
npm run check:inline
```

结果：

- `shared/config/{templates,prompts,models}.ts` 为唯一来源；
- `server/src/services/*` 只 import / re-export，不再内联长 Prompt 与模型常量；
- `src/config/site.js`、`src/services/model-utils.js` 从 shared 读取；
- `server/dist/server/src/index.js` 与 `server/dist/shared/config/*.js` 生成；
- `api/*.ts` 重新生成并 `check:inline` 三个 ok。

编译后的本地服务验证：

```bash
VOLCENGINE_API_KEY= ... PORT=4010 npm --prefix server start
curl http://127.0.0.1:4010/
curl http://127.0.0.1:4010/api/models
```

结果：`AI Kids Server - OK!`；模型目录返回 `success=true`（无 Key 时 available=false）。

---

## 6. V5.1 迁移 CLI

```bash
node scripts/migrate-storage.mjs temp/v3.6/backup-sample.json \
  --out temp/v3.6/cloud-migration-sample.json --owner family-001
```

结果：

- `kind=aikids-cloud-migration`、`schemaVersion=1`、`ownerId=family-001`；
- 2 个旧作品保留原 ID（`1700000000000`、`1700000000001`）；
- 每条记录有 `ownerId=family-001`、`visibility=private`；
- 输出不含 `apiKey` / `sk-`；
- 非法 JSON：退出码 1，打印 `INVALID_JSON`；
- 无参数：退出码 1，打印用法。

---

## 7. 回归与兼容

| 项 | 结果 |
|----|------|
| V3.5 集成测试（GEN / REMIX） | ✅ 全部通过 |
| 双端一致性契约（parity） | ✅ 全部通过 |
| 生产函数契约（production-api） | ✅ 全部通过 |
| 旧作品 `remixCount` 缺失补 0 | ✅ `storage.test.mjs` |
| 旧设置对象结构不变 | ✅ `storage.test.mjs` |
| 旧自定义模型 Key 保留 | ✅ `storage.test.mjs` |
| V3.5 数据读取 V3.6 额外字段 | ✅ 额外字段被忽略（设计兼容，未做反向回滚演练） |

---

## 8. 未覆盖与限制

- 未用真实模型生成游戏（避免消耗额度）；真实生成链路由 V3.5 基线与现有集成/契约测试覆盖，本版未改 Prompt 语义。
- Headless Chrome 仅覆盖 Chrome；未做 Safari / 移动端真机。
- 导出文件包含 API Key 属于明确产品决策；本次只验证“提示 + 本地生成 + 不上传”，未做文件加密。
- 只在生产环境复跑了 Settings 导出/导入 UI UAT，未在生产用真实模型生成游戏（避免消耗额度）。
- 远端 tag 未推送；本地 tag 指向发布 commit。

---

## 9. 证据文件

| 文件 | 说明 |
|------|------|
| `temp/v3.6/ci-run-2.log` | 最终本地 CI 完整日志 |
| `temp/v3.6/ui-uat.mjs` | Settings 导出/导入 UI UAT 脚本（本地临时） |
| `temp/v3.6/create-uat.mjs` | 创作/UUID/telemetry UI UAT 脚本（本地临时） |
| `temp/v3.6/backup-sample.json` | 迁移 CLI 样例（含测试用假 Key，未提交） |
| `temp/v3.6/cloud-migration-sample.json` | 迁移 CLI 输出样例 |
| `temp/v3.6/server-dist.log` | 编译后 server 启动日志 |


---

## 10. 远端与生产验证（补充）

### 10.1 GitHub Actions

- 远端 CI：run `39893330258`（commit `a71db4d`），conclusion `success`。
- 覆盖：typecheck → build → build:server → 91 项测试 → check:inline → check:docs → preview smoke（Node 20）。

### 10.2 Vercel

| 项 | 结果 |
|----|------|
| 部署 | `7269173611`（commit `a71db4d`，Production，success） |
| 首页 | `https://boxaikids.top/` 308 → `https://www.boxaikids.top/` 200 |
| `/settings` | 200（SPA 回退） |
| `/api/models` | 200，`success=true`，模型可用，不含 Key |
| 前端产物 | 生产 `assets/index-5WuNvK4b.js` 与本地构建一致，包含「数据备份」 |
| 生产 UI UAT | Settings 导出/导入/诊断日志 26/26 通过 |

生产 URL：`https://www.boxaikids.top`（`boxaikids.top` 308 跳转）。
