/**
 * 文档与版本一致性检查（CI 使用）。
 *
 * 检查：
 * 1. 根 package.json 与 server/package.json 版本一致
 * 2. CHANGELOG.md 含当前版本
 * 3. docs/design-<major.minor>.md、docs/uat-<major.minor>.md 存在
 * 4. README.md 提到当前版本
 * 5. 必需 npm scripts 存在
 * 6. tests/ 下 unit / integration / contract 测试文件存在
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const notes = [];

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

const pkg = readJson('package.json');
const serverPkg = readJson('server/package.json');
const version = pkg.version;
const shortVersion = version.split('.').slice(0, 2).join('.');

if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  errors.push(`package.json 版本号不是 x.y.z：${version}`);
}

if (serverPkg.version !== version) {
  errors.push(
    `版本号不一致：package.json=${version}, server/package.json=${serverPkg.version}`
  );
}

const changelogPath = path.join(root, 'CHANGELOG.md');
if (!exists('CHANGELOG.md')) {
  errors.push('缺少 CHANGELOG.md');
} else {
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  if (!changelog.includes(`## [${version}]`)) {
    errors.push(`CHANGELOG.md 缺少 "## [${version}]" 段落`);
  }
}

const design = `docs/design-v${shortVersion}.md`;
const uat = `docs/uat-v${shortVersion}.md`;
if (!exists(design)) errors.push(`缺少 ${design}`);
if (!exists(uat)) errors.push(`缺少 ${uat}`);

const readmePath = path.join(root, 'README.md');
if (!exists('README.md')) {
  errors.push('缺少 README.md');
} else {
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (!readme.includes(version)) {
    errors.push(`README.md 未提到当前版本 ${version}`);
  }
}

const requiredScripts = [
  'typecheck',
  'build',
  'build:api',
  'test',
  'ci',
  'check:inline',
  'check:docs',
  'smoke:preview',
  'bench',
];
for (const name of requiredScripts) {
  if (!pkg.scripts || typeof pkg.scripts[name] !== 'string') {
    errors.push(`package.json 缺少 npm script：${name}`);
  }
}

const testGroups = {
  unit: [
    'tests/unit/storage.test.mjs',
    'tests/unit/model-utils.test.mjs',
    'tests/unit/remix-core.test.mjs',
    'tests/unit/generate-service.test.mjs',
    'tests/unit/metrics.test.mjs',
  ],
  integration: ['tests/integration/generate.test.mjs', 'tests/integration/remix.test.mjs'],
  contract: [
    'tests/contract/production-api.test.mjs',
    'tests/contract/parity.test.mjs',
  ],
};
for (const [group, files] of Object.entries(testGroups)) {
  for (const file of files) {
    if (!exists(file)) errors.push(`缺少 ${group} 测试：${file}`);
  }
}

// 生成物必须带 banner，且不含旧的内联源/跨目录导入
for (const file of [
  'api/generate.ts',
  'api/models/index.ts',
  'api/models/test.ts',
]) {
  if (!exists(file)) {
    errors.push(`缺少生成物：${file}`);
    continue;
  }
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (!content.includes('AUTO-GENERATED FILE')) {
    errors.push(`${file} 缺少 AUTO-GENERATED banner`);
  }
  if (/from\s+['"][^'"]*(?:\.\.\/server\/|_model['"])/.test(content)) {
    errors.push(`${file} 仍包含跨目录相对导入`);
  }
}

const ciWorkflow = '.github/workflows/ci.yml';
if (!exists(ciWorkflow)) {
  errors.push(`缺少 CI 工作流：${ciWorkflow}`);
} else {
  const workflow = fs.readFileSync(path.join(root, ciWorkflow), 'utf8');
  for (const needle of ['npm run typecheck', 'npm run build', 'npm test', 'npm run smoke:preview']) {
    if (!workflow.includes(needle)) {
      errors.push(`CI 工作流缺少步骤：${needle}`);
    }
  }
}

notes.push(`version=${version}`);
notes.push(`design=${design}`);
notes.push(`uat=${uat}`);
notes.push(`tests=${Object.values(testGroups).flat().length}`);

if (errors.length > 0) {
  console.error('❌ 文档/版本一致性检查失败：');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✅ 文档/版本一致性检查通过（${notes.join(', ')}）`);
}
