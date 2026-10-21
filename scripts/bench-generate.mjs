/**
 * V3.5 生成性能 / 成本基线。
 *
 * 两种模式：
 *   npm run bench -- --runs 3                  # 本地测试桩，不消耗额度
 *   npm run bench -- --real --models doubao,deepseek --runs 1
 *                                             # 读取 .env，调用真实模型
 *
 * 数据来源：
 * - 客户端墙钟延迟（含网络/序列化）
 * - 服务端 [metrics] 结构化日志（upstreamMs / usage / errorCode）
 *
 * 输出：
 *   temp/v3.5/baseline-<mode>-<date>.json
 *   temp/v3.5/baseline-<mode>-<date>.md
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

import { createStubServer } from '../tests/support/stub-model-server.mjs';
import { startBackend, postJson } from '../tests/support/backend.mjs';
import { sourceGame } from '../tests/support/fixtures.mjs';
import {
  estimateCost,
  percentile,
} from '../server/src/services/metrics.ts';

const root = process.cwd();

// ============================================================
// 参数
// ============================================================

function readArgs(argv) {
  const args = {
    real: false,
    models: null,
    runs: null,
    prompts: 3,
    remix: true,
    out: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--real') args.real = true;
    else if (item === '--no-remix') args.remix = false;
    else if (item === '--models') args.models = argv[++i];
    else if (item === '--runs') args.runs = Number(argv[++i]);
    else if (item === '--prompts') args.prompts = Number(argv[++i]);
    else if (item === '--out') args.out = argv[++i];
    else if (item === '--help' || item === '-h') {
      console.log(
        '用法: npm run bench -- [--real] [--models doubao,deepseek] [--runs N] [--prompts N] [--no-remix] [--out temp/v3.5/prefix]'
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数：${item}`);
    }
  }

  args.runs = Number.isFinite(args.runs) && args.runs > 0
    ? Math.floor(args.runs)
    : args.real
      ? 1
      : 3;
  args.prompts = Number.isFinite(args.prompts) && args.prompts > 0
    ? Math.min(Math.floor(args.prompts), 3)
    : 3;

  return args;
}

const args = readArgs(process.argv.slice(2));
const mode = args.real ? 'real' : 'stub';
const requestedModels = (args.models || (args.real ? 'doubao,deepseek' : 'doubao,deepseek'))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// ============================================================
// 固定 Prompt 集
// ============================================================

const PROMPTS = [
  {
    id: 'B1',
    name: '收集',
    templateId: 'free',
    text: '做一个接星星的小游戏，接到星星得 1 分，接到 10 分就胜利',
  },
  {
    id: 'B2',
    name: '打地鼠',
    templateId: 'animal',
    text: '做一个打地鼠游戏，地鼠是小兔子，30 秒内打到 10 只得胜',
  },
  {
    id: 'B3',
    name: '跑酷',
    templateId: 'space',
    text: '做一个太空跑酷小游戏，用方向键躲避陨石，坚持 30 秒获胜',
  },
].slice(0, args.prompts);

const REMIX_PROMPT = {
  id: 'B4',
  name: 'Remix',
  templateId: 'animal',
  instruction: '把星星换成宝石，再加一个会扣分的炸弹',
};

// ============================================================
// 工具
// ============================================================

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readPrices() {
  const input = Number(process.env.BENCH_INPUT_PRICE_PER_1K);
  const output = Number(process.env.BENCH_OUTPUT_PRICE_PER_1K);
  return {
    inputPer1k: Number.isFinite(input) ? input : null,
    outputPer1k: Number.isFinite(output) ? output : null,
  };
}

function tokensOf(row) {
  const usage = row.metric?.usage;
  if (usage) {
    return {
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      estimated: false,
    };
  }
  return {
    promptTokens: row.metric?.estimatedPromptTokens || 0,
    completionTokens: row.metric?.estimatedCompletionTokens || 0,
    estimated: true,
  };
}

function summarize(rows, prices) {
  if (rows.length === 0) {
    return {
      requests: 0,
      p50Ms: 0,
      p90Ms: 0,
      avgMs: 0,
      successRate: 0,
      fallbackRate: 0,
      avgPromptTokens: 0,
      avgCompletionTokens: 0,
      tokensEstimated: false,
      totalCost: null,
      avgCost: null,
    };
  }

  const latencies = rows.map((row) => row.latencyMs);
  const tokens = rows.map(tokensOf);
  const success = rows.filter((row) => row.success).length;
  const fallback = rows.filter(
    (row) => row.status === 200 && row.engine === 'mock'
  ).length;

  let totalCost = null;
  if (prices.inputPer1k !== null || prices.outputPer1k !== null) {
    totalCost = 0;
    for (const token of tokens) {
      const cost = estimateCost(
        {
          promptTokens: token.promptTokens,
          completionTokens: token.completionTokens,
          totalTokens: token.promptTokens + token.completionTokens,
        },
        prices
      );
      totalCost += cost ?? 0;
    }
    totalCost = round(totalCost, 6);
  }

  return {
    requests: rows.length,
    p50Ms: round(percentile(latencies, 50)),
    p90Ms: round(percentile(latencies, 90)),
    avgMs: round(latencies.reduce((sum, value) => sum + value, 0) / rows.length),
    successRate: round(success / rows.length, 4),
    fallbackRate: round(fallback / rows.length, 4),
    avgPromptTokens: round(
      tokens.reduce((sum, item) => sum + item.promptTokens, 0) / rows.length,
      1
    ),
    avgCompletionTokens: round(
      tokens.reduce((sum, item) => sum + item.completionTokens, 0) / rows.length,
      1
    ),
    tokensEstimated: tokens.some((item) => item.estimated),
    totalCost,
    avgCost: totalCost === null ? null : round(totalCost / rows.length, 6),
  };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    const list = map.get(value) || [];
    list.push(row);
    map.set(value, list);
  }
  return map;
}

function formatSummary(summary) {
  return {
    请求数: summary.requests,
    'p50(ms)': summary.p50Ms,
    'p90(ms)': summary.p90Ms,
    '平均(ms)': summary.avgMs,
    成功率: `${round(summary.successRate * 100, 1)}%`,
    降级率: `${round(summary.fallbackRate * 100, 1)}%`,
    平均输入token: summary.avgPromptTokens,
    平均输出token: summary.avgCompletionTokens,
    'token来源': summary.tokensEstimated ? '部分估算' : '上游 usage',
    总成本: summary.totalCost === null ? '未配置单价' : summary.totalCost,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# V3.5 生成性能 / 成本基线（${report.mode}）`);
  lines.push('');
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 目标：${report.target}`);
  lines.push(
    `- 样本：${report.sample.models.join(' / ')} × ${report.sample.prompts} 个场景 × ${report.sample.runs} 轮 = ${report.sample.totalRequests} 次`
  );
  lines.push(
    `- 单价：输入 ${report.pricing.inputPer1k ?? '未配置'} / 1K，输出 ${report.pricing.outputPer1k ?? '未配置'} / 1K（CNY）`
  );
  lines.push('');

  lines.push('## 总览');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|---|---|');
  for (const [key, value] of Object.entries(formatSummary(report.stats.overall))) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('');

  lines.push('## 分模型');
  lines.push('');
  lines.push('| 模型 | 请求 | p50(ms) | p90(ms) | 成功率 | 降级率 | 平均输入token | 平均输出token | 总成本 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const [model, summary] of Object.entries(report.stats.byModel)) {
    lines.push(
      `| ${model} | ${summary.requests} | ${summary.p50Ms} | ${summary.p90Ms} | ${round(summary.successRate * 100, 1)}% | ${round(summary.fallbackRate * 100, 1)}% | ${summary.avgPromptTokens} | ${summary.avgCompletionTokens} | ${summary.totalCost ?? '未配置单价'} |`
    );
  }
  lines.push('');

  lines.push('## 分场景');
  lines.push('');
  lines.push('| 场景 | 请求 | p50(ms) | p90(ms) | 成功率 | 降级率 |');
  lines.push('|---|---|---|---|---|---|');
  for (const [scenario, summary] of Object.entries(report.stats.byScenario)) {
    lines.push(
      `| ${scenario} | ${summary.requests} | ${summary.p50Ms} | ${summary.p90Ms} | ${round(summary.successRate * 100, 1)}% | ${round(summary.fallbackRate * 100, 1)}% |`
    );
  }
  lines.push('');

  lines.push('## 明细');
  lines.push('');
  lines.push('| 场景 | 模型 | 轮次 | 状态 | 引擎 | 客户端(ms) | 上游(ms) | 输入token | 输出token |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of report.results) {
    const token = tokensOf(row);
    lines.push(
      `| ${row.scenario} | ${row.model} | ${row.run} | ${row.status} | ${row.engine ?? '-'} | ${round(row.latencyMs)} | ${row.metric?.upstreamMs ?? '-'} | ${token.promptTokens} | ${token.completionTokens} |`
    );
  }
  lines.push('');

  lines.push('## 口径与限制');
  lines.push('');
  lines.push('- 延迟：客户端从发请求到收到完整响应（含网络与序列化）。');
  lines.push('- 上游延迟：服务端 `[metrics].upstreamMs`。');
  lines.push('- 成功率：HTTP 200 且 `engine=volcengine`（真实模型成功）。');
  lines.push('- 降级率：HTTP 200 但 `engine=mock`（本地模板 / 保留原游戏）。');
  lines.push('- token：优先上游 `usage`；缺失时按 `ceil(字符数 / 1.5)` 估算并标注。');
  lines.push('- p50/p90：nearest-rank，对本次样本计算。');
  if (report.mode === 'real') {
    lines.push(
      `- 真实模型样本量：每场景 ${report.sample.runs} 次；p90 在小样本下不具统计意义，仅作趋势参考。`
    );
  } else {
    lines.push('- 桩模式只验证链路与统计逻辑，不代表真实模型延迟。');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

// ============================================================
// 执行
// ============================================================

const startedAt = new Date();
const prices = readPrices();
let stub = null;
let backend = null;

try {
  let target;
  if (args.real) {
    backend = await startBackend({ real: true });
    target = `real:${backend.baseUrl}`;
  } else {
    stub = await createStubServer();
    backend = await startBackend({
      stubUrl: stub.chatUrl,
      gameModel: requestedModels[0],
    });
    target = `stub:${stub.chatUrl}`;
  }

  // 真实模式：过滤掉未配置的模型
  let models = requestedModels;
  const catalogRes = await fetch(`${backend.baseUrl}/api/models`);
  const catalog = await catalogRes.json();
  const available = new Set(
    (catalog?.data?.models || [])
      .filter((model) => model.available)
      .map((model) => model.id)
  );
  if (args.real) {
    models = requestedModels.filter((model) => available.has(model));
    if (models.length === 0) {
      throw new Error(
        `没有可用模型（请求：${requestedModels.join(', ')}；可用：${[...available].join(', ') || '无'}）`
      );
    }
  }

  const results = [];

  async function waitForMetric(sinceLength) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const chunk = backend.getLog().slice(sinceLength);
      const line = chunk
        .split('\n')
        .filter((item) => item.startsWith('[metrics] '))
        .pop();
      if (line) {
        try {
          return JSON.parse(line.slice('[metrics] '.length));
        } catch {
          // 等待完整行
        }
      }
      await sleep(50);
    }
    return null;
  }

  async function runOne({ scenario, model, run, body }) {
    const logStart = backend.getLog().length;
    const started = performance.now();
    let res;
    try {
      res = await postJson(backend.baseUrl, '/api/generate', body, 300000);
    } catch (error) {
      res = {
        status: 0,
        json: null,
        text: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const latencyMs = performance.now() - started;
    const metric = await waitForMetric(logStart);
    const data = res.json?.data || {};

    const row = {
      scenario,
      model,
      run,
      status: res.status,
      success:
        res.status === 200 &&
        res.json?.success === true &&
        data.engine === 'volcengine',
      engine: data.engine ?? null,
      modelName: data.modelName ?? null,
      warning: data.warning ?? null,
      gameHtmlLength: typeof data.gameHtml === 'string' ? data.gameHtml.length : 0,
      latencyMs: round(latencyMs),
      metric,
      error: res.error ?? (res.json?.code || null),
    };
    results.push(row);
    console.log(
      `${row.success ? '✅' : '❌'} ${scenario} ${model} #${run} ` +
        `status=${row.status} engine=${row.engine ?? '-'} ` +
        `client=${row.latencyMs}ms upstream=${metric?.upstreamMs ?? '-'}ms` +
        `${row.warning ? ` warning=${row.warning}` : ''}`
    );
    return row;
  }

  for (const model of models) {
    for (let run = 1; run <= args.runs; run += 1) {
      for (const prompt of PROMPTS) {
        await runOne({
          scenario: `${prompt.id}-${prompt.name}`,
          model,
          run,
          body: {
            templateId: prompt.templateId,
            userPrompt: prompt.text,
            modelId: model,
          },
        });
      }

      if (args.remix) {
        await runOne({
          scenario: `${REMIX_PROMPT.id}-${REMIX_PROMPT.name}`,
          model,
          run,
          body: {
            templateId: REMIX_PROMPT.templateId,
            userPrompt: REMIX_PROMPT.instruction,
            remixFrom: 'bench-original',
            remixInstruction: REMIX_PROMPT.instruction,
            originalTitle: '星星收集大冒险',
            originalUserPrompt: '做一个接星星的小游戏',
            originalGameHtml: sourceGame,
            modelId: model,
          },
        });
      }
    }
  }

  const byModel = {};
  for (const [model, rows] of groupBy(results, 'model')) {
    byModel[model] = summarize(rows, prices);
  }
  const byScenario = {};
  for (const [scenario, rows] of groupBy(results, 'scenario')) {
    byScenario[scenario] = summarize(rows, prices);
  }

  const report = {
    version: '3.5.0',
    mode,
    target,
    generatedAt: startedAt.toISOString(),
    sample: {
      models,
      prompts: PROMPTS.length + (args.remix ? 1 : 0),
      runs: args.runs,
      totalRequests: results.length,
    },
    pricing: prices,
    stats: {
      overall: summarize(results, prices),
      byModel,
      byScenario,
    },
    results,
  };

  const date = startedAt.toISOString().slice(0, 10);
  const prefix = args.out || path.join('temp', 'v3.5', `baseline-${mode}-${date}`);
  const jsonPath = `${prefix}.json`;
  const mdPath = `${prefix}.md`;
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log('\n===== 汇总 =====');
  console.log(formatSummary(report.stats.overall));
  console.log(`\n📄 ${jsonPath}`);
  console.log(`📄 ${mdPath}`);

  const successRate = report.stats.overall.successRate;
  if (successRate <= 0) {
    console.error('❌ 成功率为 0，请检查模型配置或额度');
    process.exitCode = 1;
  } else if (mode === 'stub' && successRate < 1) {
    console.error('❌ 桩模式成功率应 100%，请检查链路');
    process.exitCode = 1;
  }
} finally {
  if (backend) await backend.stop();
  if (stub) await stub.close();
}
