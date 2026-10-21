# V3.5 生成性能 / 成本基线（stub）

- 生成时间：2026-10-21T02:54:18.585Z
- 目标：stub:http://127.0.0.1:53496/v1/chat/completions
- 样本：doubao / deepseek × 4 个场景 × 3 轮 = 24 次
- 单价：输入 未配置 / 1K，输出 未配置 / 1K（CNY）

## 总览

| 指标 | 值 |
|---|---|
| 请求数 | 24 |
| p50(ms) | 3.62 |
| p90(ms) | 5.81 |
| 平均(ms) | 4.34 |
| 成功率 | 100% |
| 降级率 | 0% |
| 平均输入token | 100 |
| 平均输出token | 200 |
| token来源 | 上游 usage |
| 总成本 | 未配置单价 |

## 分模型

| 模型 | 请求 | p50(ms) | p90(ms) | 成功率 | 降级率 | 平均输入token | 平均输出token | 总成本 |
|---|---|---|---|---|---|---|---|---|
| doubao | 12 | 4.53 | 6.9 | 100% | 0% | 100 | 200 | 未配置单价 |
| deepseek | 12 | 3.48 | 3.62 | 100% | 0% | 100 | 200 | 未配置单价 |

## 分场景

| 场景 | 请求 | p50(ms) | p90(ms) | 成功率 | 降级率 |
|---|---|---|---|---|---|
| B1-收集 | 6 | 3.52 | 12.61 | 100% | 0% |
| B2-打地鼠 | 6 | 3.6 | 5.81 | 100% | 0% |
| B3-跑酷 | 6 | 3.49 | 4.93 | 100% | 0% |
| B4-Remix | 6 | 3.63 | 6.9 | 100% | 0% |

## 明细

| 场景 | 模型 | 轮次 | 状态 | 引擎 | 客户端(ms) | 上游(ms) | 输入token | 输出token |
|---|---|---|---|---|---|---|---|---|
| B1-收集 | doubao | 1 | 200 | volcengine | 12.61 | 8 | 100 | 200 |
| B2-打地鼠 | doubao | 1 | 200 | volcengine | 5.81 | 3 | 100 | 200 |
| B3-跑酷 | doubao | 1 | 200 | volcengine | 4.93 | 3 | 100 | 200 |
| B4-Remix | doubao | 1 | 200 | volcengine | 6.9 | 2 | 100 | 200 |
| B1-收集 | doubao | 2 | 200 | volcengine | 4.53 | 2 | 100 | 200 |
| B2-打地鼠 | doubao | 2 | 200 | volcengine | 4.18 | 1 | 100 | 200 |
| B3-跑酷 | doubao | 2 | 200 | volcengine | 4.58 | 2 | 100 | 200 |
| B4-Remix | doubao | 2 | 200 | volcengine | 4.71 | 2 | 100 | 200 |
| B1-收集 | doubao | 3 | 200 | volcengine | 4.14 | 2 | 100 | 200 |
| B2-打地鼠 | doubao | 3 | 200 | volcengine | 3.71 | 2 | 100 | 200 |
| B3-跑酷 | doubao | 3 | 200 | volcengine | 3.49 | 2 | 100 | 200 |
| B4-Remix | doubao | 3 | 200 | volcengine | 3.63 | 1 | 100 | 200 |
| B1-收集 | deepseek | 1 | 200 | volcengine | 3.52 | 2 | 100 | 200 |
| B2-打地鼠 | deepseek | 1 | 200 | volcengine | 2.23 | 1 | 100 | 200 |
| B3-跑酷 | deepseek | 1 | 200 | volcengine | 3.29 | 1 | 100 | 200 |
| B4-Remix | deepseek | 1 | 200 | volcengine | 3.48 | 2 | 100 | 200 |
| B1-收集 | deepseek | 2 | 200 | volcengine | 3.33 | 1 | 100 | 200 |
| B2-打地鼠 | deepseek | 2 | 200 | volcengine | 3.6 | 2 | 100 | 200 |
| B3-跑酷 | deepseek | 2 | 200 | volcengine | 3.41 | 1 | 100 | 200 |
| B4-Remix | deepseek | 2 | 200 | volcengine | 4 | 1 | 100 | 200 |
| B1-收集 | deepseek | 3 | 200 | volcengine | 3.5 | 2 | 100 | 200 |
| B2-打地鼠 | deepseek | 3 | 200 | volcengine | 3.35 | 1 | 100 | 200 |
| B3-跑酷 | deepseek | 3 | 200 | volcengine | 3.57 | 2 | 100 | 200 |
| B4-Remix | deepseek | 3 | 200 | volcengine | 3.62 | 2 | 100 | 200 |

## 口径与限制

- 延迟：客户端从发请求到收到完整响应（含网络与序列化）。
- 上游延迟：服务端 `[metrics].upstreamMs`。
- 成功率：HTTP 200 且 `engine=volcengine`（真实模型成功）。
- 降级率：HTTP 200 但 `engine=mock`（本地模板 / 保留原游戏）。
- token：优先上游 `usage`；缺失时按 `ceil(字符数 / 1.5)` 估算并标注。
- p50/p90：nearest-rank，对本次样本计算。
- 桩模式只验证链路与统计逻辑，不代表真实模型延迟。

