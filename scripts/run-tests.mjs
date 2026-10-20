/**
 * 测试发现与执行器。
 *
 * 递归查找 tests/**\/*.test.mjs，按路径排序后用 Node 内置 test runner
 * 一次性执行；任何文件失败都会以非 0 退出。
 *
 * 用法：
 *   npm test
 *   node scripts/run-tests.mjs tests/unit
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const filter = process.argv[2] || '';

function walk(dir) {
  const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(relative));
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(relative);
    }
  }
  return files;
}

const testsDir = path.join(root, 'tests');
if (!fs.existsSync(testsDir)) {
  console.error('❌ 未找到 tests/ 目录');
  process.exit(1);
}

const files = walk('tests')
  .filter((file) => !filter || file.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`❌ 未找到测试文件${filter ? `（过滤条件：${filter}）` : ''}`);
  process.exit(1);
}

console.log(`▶ node --import tsx --test (${files.length} files)`);
for (const file of files) console.log(`  - ${file}`);

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-timeout=120000', ...files],
  { cwd: root, stdio: 'inherit', env: process.env }
);

child.on('error', (error) => {
  console.error('❌ 测试进程启动失败：', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`❌ 测试进程被信号终止：${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
