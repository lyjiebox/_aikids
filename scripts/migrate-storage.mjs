#!/usr/bin/env node
/**
 * ============================================================
 * migrate-storage.mjs — 本地备份 → V5.1 云端迁移数据（V3.6）
 * ============================================================
 *
 * 用法：
 *   node scripts/migrate-storage.mjs <backup.json> [--out <file>] [--owner <id>]
 *
 * 输入支持：
 * - V3.6 备份（kind: aikids-export）
 * - 旧格式 { works, settings, models }
 * - 裸作品数组
 *
 * 输出：
 * - kind: aikids-cloud-migration
 * - 作品保留本地 ID 作为幂等键，补齐 ownerId / visibility
 * - 不包含自定义模型 apiKey
 *
 * 本脚本只读写本地文件，不访问 localStorage、不发送网络请求。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildCloudMigration,
  parseImportPayload,
} from '../src/services/storage-schema.js';

function printUsage() {
  console.log(
    '用法：node scripts/migrate-storage.mjs <backup.json> [--out <file>] [--owner <id>]'
  );
}

function parseArgs(argv) {
  const args = { input: '', out: '', owner: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--out') {
      args.out = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--owner') {
      args.owner = argv[index + 1] || '';
      index += 1;
    } else if (!args.input) {
      args.input = arg;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  printUsage();
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), args.input);
if (!fs.existsSync(inputPath)) {
  console.error(`❌ 文件不存在：${args.input}`);
  process.exit(1);
}

let text = '';
try {
  text = fs.readFileSync(inputPath, 'utf8');
} catch (error) {
  console.error(`❌ 读取失败：${error.message}`);
  process.exit(1);
}

const parsed = parseImportPayload(text);
if (!parsed.ok) {
  console.error(`❌ ${parsed.message}（${parsed.code}）`);
  process.exit(1);
}

const migration = buildCloudMigration(parsed.snapshot, {
  ownerId: args.owner,
});
const outPath = args.out
  ? path.resolve(process.cwd(), args.out)
  : path.join(path.dirname(inputPath), `${path.basename(inputPath, '.json')}.cloud.json`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(migration, null, 2)}\n`, 'utf8');

console.log('✅ 已生成云端迁移数据');
console.log(`  ownerId：${migration.ownerId}`);
console.log(`  作品：${migration.works.length}`);
console.log(`  模型：${migration.models.length}（不含 API Key）`);
console.log(`  输出：${outPath}`);
