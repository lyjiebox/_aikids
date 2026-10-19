/**
 * 把 api/_model.ts 内联到 Vercel API 函数文件。
 *
 * 背景：Vercel 的 Node File Trace 不会打包 api/ 目录下的
 * 跨文件相对导入，导致运行时 ERR_MODULE_NOT_FOUND。
 * 因此每个 HTTP 函数必须是自包含的。
 *
 * 运行：node temp/v3.2/inline-api-model.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'api/_model.ts');
const targets = [
  'api/generate.ts',
  'api/models/index.ts',
  'api/models/test.ts',
];

const shared = fs
  .readFileSync(sourcePath, 'utf8')
  .replace(/^\uFEFF/, '')
  .trim();

const BEGIN = '// ===== BEGIN inlined model core (source: api/_model.ts) =====';
const END = '// ===== END inlined model core =====';

for (const relative of targets) {
  const filePath = path.join(root, relative);
  let content = fs.readFileSync(filePath, 'utf8');

  // 幂等：先移除旧的内联块
  const oldBlock = new RegExp(
    `${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}\\n?`,
    'g'
  );
  content = content.replace(oldBlock, '');

  // 移除对 _model 的相对导入（[^;]*? 避免跨过 Hono import 的分号）
  content = content.replace(
    /import\s*\{[^;]*?\}\s*from\s*['"]\.\.?\/_model['"];\s*\n?/g,
    ''
  );

  // 在 Hono import 后插入内联代码
  const marker = "import { Hono } from 'hono';\n";
  if (!content.includes(marker)) {
    throw new Error(`${relative}: 未找到 Hono import`);
  }

  const block = `${BEGIN}\n${shared}\n${END}\n`;
  content = content.replace(marker, `${marker}\n${block}\n`);

  if (/from\s*['"]\.\.?\/_model['"]/.test(content)) {
    throw new Error(`${relative}: 仍存在 _model 导入`);
  }

  fs.writeFileSync(filePath, content);
  console.log(`inlined: ${relative} (${content.length} bytes)`);
}
