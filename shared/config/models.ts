/**
 * ============================================================
 * 共享配置 — 模型清单与接口预设（V3.6）
 * ============================================================
 *
 * 本文件是内置模型定义、默认接口地址、域名白名单与
 * 前端「常用接口预设」的唯一来源。
 *
 * 修改方式：直接改本文件 → 重新构建
 * - 前端：npm run build
 * - Vercel 函数：npm run build:api
 * - 本地服务：npm run build:server
 *
 * 约束：
 * 1. 只放纯数据，不读取 process.env（环境变量由 model.ts 在运行时解析）。
 * 2. 内置模型 id 必须稳定；作品会用 id 记录实际使用的模型。
 * 3. 白名单只放域名，不放协议与路径。
 */

/** 内置模型定义 */
export interface BuiltinModelDef {
  /** 模型 ID，与请求中的 modelId 对应 */
  id: string;
  /** 展示名称 */
  name: string;
  /** 允许的接入点环境变量（按顺序回退） */
  endpointEnvVars: string[];
  /** 缺失时提示的环境变量名 */
  primaryEndpointEnv: string;
}

export const BUILTIN_MODEL_DEFS: BuiltinModelDef[] = [
  {
    id: 'doubao',
    name: 'Doubao Seed 2.0 Pro',
    endpointEnvVars: ['DOUBAO_ENDPOINT_ID', 'VOLCENGINE_ENDPOINT_ID'],
    primaryEndpointEnv: 'DOUBAO_ENDPOINT_ID',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V4 Pro',
    endpointEnvVars: ['DEEPSEEK_ENDPOINT_ID'],
    primaryEndpointEnv: 'DEEPSEEK_ENDPOINT_ID',
  },
];

/** 默认火山方舟 Chat Completions 地址（可用 VOLCENGINE_BASE_URL 覆盖） */
export const DEFAULT_ARK_BASE_URL =
  'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

/** 自定义模型默认域名白名单（可用 ALLOWED_MODEL_HOSTS 覆盖） */
export const DEFAULT_ALLOWED_MODEL_HOSTS: string[] = [
  'ark.cn-beijing.volces.com',
  'api.deepseek.com',
  'api.openai.com',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
];

/** 前端常用接口地址预设 */
export interface ModelPreset {
  id: string;
  name: string;
  baseUrl: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'ark',
    name: '火山方舟',
    baseUrl: DEFAULT_ARK_BASE_URL,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
  },
];

/** 新建自定义模型时的默认接口地址 */
export const DEFAULT_MODEL_BASE_URL = MODEL_PRESETS[0].baseUrl;
