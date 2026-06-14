import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 本地开发时从项目根目录加载 .env（不新增 dotenv 依赖）
 * Vercel 等平台会注入 process.env，此处跳过
 */
export function loadLocalEnv(): void {
  if (process.env.VERCEL) return;

  const envPath = resolve(process.cwd(), '../.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
