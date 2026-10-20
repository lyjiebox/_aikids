# V3.4 UAT 测试报告（2026-10-20）

> 版本：v3.4.0（工程收敛）
> 对应文档：`docs/design-v3.4.md`、`docs/uat-v3.4.md`
> 执行环境：macOS，Node v24.18.0，npm 11.16.0，Chrome Headless（最新稳定版）
> 执行命令：`npm run ci`

## 1. 结论

| 项目 | 结果 |
|------|------|
| 类型检查（api + src + server） | ✅ 通过 |
| 前端构建 | ✅ 通过（67 modules） |
| 本地后端构建 | ✅ 通过 |
| Node test（单元 + 集成 + 契约） | ✅ 24/24 通过 |
| 内联模型一致性 | ✅ 3/3 文件同步 |
| 文档/版本一致性 | ✅ 通过 |
| 构建产物冒烟 | ✅ 通过 |
| 本地等价 CI | ✅ 退出码 0 |
| 三条核心路径 | ✅ 生成 7/7、Remix 10/10、存储 12/12 |
| 发布 tag | ✅ 已创建 annotated tag `v3.4.0` |

## 2. 核心路径明细

### 2.1 生成（`tests/integration/generate.test.mjs`）

- GEN-01 正常生成成功且不带 Remix 字段
- GEN-02 普通生成 Prompt 与输出上限保持 V3.1/V3.2 契约
- GEN-03 空 prompt 返回 400
- GEN-04 非法 JSON 返回 400
- GEN-05 自定义模型非法地址被白名单拦截
- GEN-06 上游 500 时普通生成降级本地模板
- GEN-07 模型目录接口正常且不回显 API Key

结果：7/7 通过。

### 2.2 Remix（`tests/integration/remix.test.mjs`）

- REMIX-01 完整源码 Remix 成功且保留结构
- REMIX-02 Prompt 包含档案、完整源码与专用规则
- REMIX-03 超长源码进入 outline 并省略中间内容
- REMIX-04 仅 preview 时进入 preview 模式
- REMIX-05 模型失败时原样保留原游戏
- REMIX-06 删除得分系统时审计识别未保留
- REMIX-07 纯 HTML 输出可解析且审计通过
- REMIX-08 非字符串源码不导致 500
- REMIX-09 无模型时保留原游戏而不是随机 Mock
- REMIX-10 响应不回显 API Key

结果：10/10 通过。

### 2.3 存储（`tests/unit/storage.test.mjs`）

12 项断言全部通过：作品/设置/模型往返、损坏 JSON、非数组、非法条目、重复 ID、20 条上限、写入上限、写入异常静默失败、旧作品 `remixCount` 兼容。

### 2.4 生产函数契约（`tests/contract/production-api.test.mjs`）

- CONTRACT-01 普通生成关键字段一致
- CONTRACT-02 Remix full 关键字段一致
- CONTRACT-03 空 prompt 返回 400
- CONTRACT-04 生产响应不回显 API Key

结果：4/4 通过。

## 3. 其他验证

- `npm ci --dry-run`（根 + `server/`）：退出码 0。
- `node -e` 检查 `.github/workflows/ci.yml`：`ci.yml OK`。
- Chrome Headless 路由抽查：`/`、`/create`、`/gallery`、`/settings`、`/settings/models`、`/play/demo` 均渲染预期内容。
- 历史遗留：`client-taro-broken/`、`test-game.html`、`temp/**/*.mjs` 均已不在 git 跟踪列表。

## 4. 未执行项与原因

| 项目 | 原因 |
|------|------|
| 真实模型手工冒烟（`server/test-generate.ts`） | P2、会消耗真实额度；本版本未改生成逻辑 |
| Vercel 线上预览/线上 API | 本机未安装/登录 Vercel CLI，且无部署权限；以本地 `vite preview` 冒烟替代，未伪造线上结果 |
| GitHub Actions 远端运行 | 需推送后触发；本地已执行完全相同的命令且全绿 |

## 5. 修复记录

| BUG | 摘要 |
|-----|------|
| BUG-3.4-01 | `check:docs` design/uat 路径缺少 `v` 前缀 |
| BUG-3.4-02 | 内联脚本非幂等，`--check` 永远失败 |
| BUG-3.4-03 | 根 typecheck 在 `Create.tsx` 报 13 个类型错误 |
| BUG-3.4-04 | `design-v3.3.md` 误把后处理引擎写成 V3.4 |
| BUG-3.4-05 | `DEPLOY.md` 引用不存在的安装/启动命令 |
| BUG-3.4-06 | 两个 lockfile 版本号未刷新 |

详见 `docs/uat-v3.4.md` 第 14 节。
