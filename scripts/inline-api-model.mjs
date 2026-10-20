/**
 * 把 api/_model.ts 内联到 Vercel API 函数文件。
 *
 * 背景：Vercel 的 Node File Trace 不会打包 api/ 目录下的
 * 跨文件相对导入，导致运行时 ERR_MODULE_NOT_FOUND。
 * 因此每个 HTTP 函数必须是自包含的。
 *
 * 用法：
 *   node scripts/inline-api-model.mjs          # 写入
 *   node scripts/inline-api-model.mjs --check  # 只检查是否同步（CI 用）
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourcePath = path.join(root, 'api/_model.ts');
const targets = ['api/generate.ts', 'api/models/index.ts', 'api/models/test.ts'];

const BEGIN = '// ===== BEGIN inlined model core (source: api/_model.ts) =====';
const END = '// ===== END inlined model core =====';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const shared = fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '').trim();
const block = `${BEGIN}\n${shared}\n${END}\n`;

/**
 * 生成目标文件的期望内容（不写盘）。
 * @param {string} content 现有文件内容
 * @param {string} relative 相对路径（用于报错）
 * @returns {string}
 */
function buildContent(content, relative) {
  // 幂等：先移除旧的内联块
  const oldBlock = new RegExp(
    `${escapeRegExp(BEGIN)}[\\s\\S]*?${escapeRegExp(END)}\\n*`,
    'g'
  );
  let next = content.replace(oldBlock, '');

  // 移除对 _model 的相对导入（[^;]*? 避免跨过 Hono import 的分号）
  next = next.replace(
    /import\s*\{[^;]*?\}\s*from\s*['"]\.\.?\/_model['"];\s*\n?/g,
    ''
  );

  // 在 Hono import 后插入内联代码
  const marker = "import { Hono } from 'hono';\n";
  if (!next.includes(marker)) {
    throw new Error(`${relative}: 未找到 Hono import`);
  }

  next = next.replace(marker, `${marker}\n${block}\n`);
  // 统一保留一个空行，避免多次运行累积空行
  next = next.replace(new RegExp(`${escapeRegExp(END)}\\n{3,}`, 'g'), `${END}\n\n`);

  if (/from\s*['"]\.\.?\/_model['"]/.test(next)) {
    throw new Error(`${relative}: 仍存在 _model 导入`);
  }

  return next;
}

const checkOnly = process.argv.includes('--check');
const stale = [];

for (const relative of targets) {
  const filePath = path.join(root, relative);
  const current = fs.readFileSync(filePath, 'utf8');
  const expected = buildContent(current, relative);

  if (checkOnly) {
    if (current !== expected) {
      stale.push(relative);
    } else {
      console.log(`ok: ${relative}`);
    }
    continue;
  }

  fs.writeFileSync(filePath, expected);
  console.log(`inlined: ${relative} (${expected.length} bytes)`);
}

if (checkOnly && stale.length > 0) {
  console.error(
    `\n❌ 内联模型代码不同步：${stale.join(', ')}\n` +
      '请运行 `npm run inline`（或 `node scripts/inline-api-model.mjs`）后重新提交。'
  );
  process.exitCode = 1;
}
