/**
 * 生成 Vercel Serverless 函数（V3.5）。
 *
 * 背景：
 * - Vercel 的 Node File Trace 不会把 api/ 下的跨目录相对导入打包进
 *   sibling function，运行时会出现 ERR_MODULE_NOT_FOUND。
 * - 因此 api/ 下每个 HTTP 函数必须是自包含文件。
 *
 * 做法：
 * - 唯一业务实现在 server/src/**；api-src/* 只是薄入口；
 * - 用 esbuild 把入口 + 依赖打包成 api/{generate.ts,models/index.ts,models/test.ts}；
 * - hono 保持 external，由 Vercel 从 package.json 依赖安装。
 *
 * 用法：
 *   npm run build:api    # 写入
 *   npm run check:inline # 只检查是否同步（CI 用）
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const root = process.cwd();

const BANNER = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Source: api-src/%ENTRY% + server/src/**
 * Regenerate: npm run build:api
 */
// @ts-nocheck
`;

const TARGETS = [
  { entry: 'api-src/generate.ts', out: 'api/generate.ts', label: 'generate' },
  {
    entry: 'api-src/models-index.ts',
    out: 'api/models/index.ts',
    label: 'models-index',
  },
  {
    entry: 'api-src/models-test.ts',
    out: 'api/models/test.ts',
    label: 'models-test',
  },
];

/** 不允许出现在产物中的跨目录相对导入 */
const FORBIDDEN_IMPORTS = [
  /from\s+['"][^'"]*\.\.\/server\//,
  /from\s+['"][^'"]*_model['"]/,
  /require\(\s*['"][^'"]*\.\.\/server\//,
];

async function render(target) {
  const result = await build({
    entryPoints: [path.join(root, target.entry)],
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['hono'],
    legalComments: 'none',
    logLevel: 'silent',
    banner: { js: BANNER.replace('%ENTRY%', target.entry.replace('api-src/', '')) },
  });

  const output = result.outputFiles?.[0];
  if (!output) {
    throw new Error(`${target.entry}: esbuild 未返回产物`);
  }

  const text = output.text.replace(/\r\n/g, '\n');
  for (const pattern of FORBIDDEN_IMPORTS) {
    if (pattern.test(text)) {
      throw new Error(
        `${target.out}: 产物仍包含跨目录相对导入（${pattern}），无法部署到 Vercel`
      );
    }
  }

  if (!text.includes('AUTO-GENERATED FILE')) {
    throw new Error(`${target.out}: 缺少 AUTO-GENERATED banner`);
  }

  return text;
}

const checkOnly = process.argv.includes('--check');
const stale = [];

for (const target of TARGETS) {
  const outputPath = path.join(root, target.out);
  const expected = await render(target);

  if (checkOnly) {
    const current = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n')
      : '';
    if (current !== expected) {
      stale.push(target.out);
      console.error(`❌ 生成物不同步：${target.out}`);
    } else {
      console.log(`ok: ${target.out}`);
    }
    continue;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected);
  console.log(
    `generated: ${target.out} (${Buffer.byteLength(expected)} bytes, ${target.label})`
  );
}

if (checkOnly && stale.length > 0) {
  console.error(
    `\n❌ api/ 生成物与源码不同步：${stale.join(', ')}\n` +
      '请运行 `npm run build:api` 后重新提交。'
  );
  process.exitCode = 1;
}
