/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Source: api-src/models-test.ts + server/src/**
 * Regenerate: npm run build:api
 */
// @ts-nocheck


// api-src/models-test.ts
import { Hono as Hono2 } from "hono";

// server/src/routes/models.ts
import { Hono } from "hono";

// server/src/types/index.ts
var ERROR_CODES = {
  /** 请求体不是合法 JSON */
  INVALID_JSON: "INVALID_JSON",
  /** JSON 合法但不是对象 */
  INVALID_BODY: "INVALID_BODY",
  /** userPrompt 缺失/空白 */
  EMPTY_PROMPT: "EMPTY_PROMPT",
  /** 未捕获的服务端错误 */
  GENERATION_FAILED: "GENERATION_FAILED",
  /** 自定义模型配置不合法 */
  MODEL_CONFIG_INVALID: "MODEL_CONFIG_INVALID",
  /** 未知内置模型 */
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  /** 内置模型缺少环境变量 */
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  /** 模型测试未提供模型参数 */
  MISSING_MODEL: "MISSING_MODEL",
  /** 没有任何可用模型 */
  NO_MODEL: "NO_MODEL",
  /** 模型调用失败（通用） */
  MODEL_CALL_FAILED: "MODEL_CALL_FAILED",
  /** 调用超时 */
  TIMEOUT: "TIMEOUT",
  /** 无法连接上游 */
  NETWORK: "NETWORK",
  /** 鉴权失败 */
  AUTH: "AUTH",
  /** 地址/模型不存在 */
  NOT_FOUND: "NOT_FOUND",
  /** 限流/额度不足 */
  RATE_LIMIT: "RATE_LIMIT",
  /** 上游 5xx */
  UPSTREAM_5XX: "UPSTREAM_5XX",
  /** 上游其他错误 */
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  /** 上游返回非 JSON */
  BAD_RESPONSE: "BAD_RESPONSE",
  /** 上游返回空内容 */
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  /** 模型输出无法解析为游戏 */
  OUTPUT_PARSE_FAILED: "OUTPUT_PARSE_FAILED",
  /** 未知错误 */
  UNKNOWN: "UNKNOWN"
};

// server/src/errors.ts
var ModelConfigError = class extends Error {
  code;
  constructor(message, code = ERROR_CODES.MODEL_CONFIG_INVALID) {
    super(message);
    this.name = "ModelConfigError";
    this.code = code;
  }
};
var ModelCallError = class extends Error {
  code;
  status;
  latencyMs;
  constructor(message, options = {}) {
    super(message);
    this.name = "ModelCallError";
    this.code = options.code || ERROR_CODES.MODEL_CALL_FAILED;
    this.status = options.status;
    this.latencyMs = options.latencyMs ?? 0;
  }
};

// shared/config/models.ts
var BUILTIN_MODEL_DEFS = [
  {
    id: "doubao",
    name: "Doubao Seed 2.0 Pro",
    endpointEnvVars: ["DOUBAO_ENDPOINT_ID", "VOLCENGINE_ENDPOINT_ID"],
    primaryEndpointEnv: "DOUBAO_ENDPOINT_ID"
  },
  {
    id: "deepseek",
    name: "DeepSeek V4 Pro",
    endpointEnvVars: ["DEEPSEEK_ENDPOINT_ID"],
    primaryEndpointEnv: "DEEPSEEK_ENDPOINT_ID"
  }
];
var DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
var DEFAULT_ALLOWED_MODEL_HOSTS = [
  "ark.cn-beijing.volces.com",
  "api.deepseek.com",
  "api.openai.com",
  "open.bigmodel.cn",
  "dashscope.aliyuncs.com",
  "api.moonshot.cn"
];
var MODEL_PRESETS = [
  {
    id: "ark",
    name: "\u706B\u5C71\u65B9\u821F",
    baseUrl: DEFAULT_ARK_BASE_URL
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1/chat/completions"
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions"
  },
  {
    id: "custom",
    name: "\u81EA\u5B9A\u4E49",
    baseUrl: ""
  }
];
var DEFAULT_MODEL_BASE_URL = MODEL_PRESETS[0].baseUrl;

// server/src/services/model.ts
var ENV_MODEL_DEFS = BUILTIN_MODEL_DEFS;
function readEnv(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}
function getServerApiKey() {
  return readEnv("VOLCENGINE_API_KEY");
}
function getArkBaseUrl() {
  return readEnv("VOLCENGINE_BASE_URL") || DEFAULT_ARK_BASE_URL;
}
function getEndpoint(def) {
  for (const key of def.endpointEnvVars) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}
function getAllowedHosts() {
  const raw = readEnv("ALLOWED_MODEL_HOSTS");
  if (!raw) return DEFAULT_ALLOWED_MODEL_HOSTS;
  return raw.split(",").map((item) => item.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
}
function isLocalHostsAllowed() {
  const value = readEnv("ALLOW_LOCAL_MODEL_HOSTS").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}
function normalizeHostname(value) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}
function isLocalHostname(hostname) {
  const host = normalizeHostname(hostname);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}\u2026`;
  return `${value.slice(0, 4)}\u2026${value.slice(-4)}`;
}
function asRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}
function readString(record, key) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}
function redact(text) {
  return text.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***").slice(0, 200);
}
function isAbortError(error) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
function readTokenCount(record, key) {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return void 0;
  }
  return Math.floor(value);
}
function parseTokenUsage(payload) {
  const record = asRecord(payload);
  const usage = asRecord(record?.usage);
  if (!usage) return void 0;
  const promptTokens = readTokenCount(usage, "prompt_tokens");
  const completionTokens = readTokenCount(usage, "completion_tokens");
  if (promptTokens === void 0 && completionTokens === void 0) {
    return void 0;
  }
  const totalTokens = readTokenCount(usage, "total_tokens") ?? (promptTokens ?? 0) + (completionTokens ?? 0);
  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens
  };
}
function buildEnvModels() {
  const apiKey = getServerApiKey();
  const baseUrl = getArkBaseUrl();
  return ENV_MODEL_DEFS.map((def) => {
    const endpoint = getEndpoint(def);
    const available = Boolean(endpoint && apiKey);
    let unavailableReason;
    if (!endpoint) {
      unavailableReason = `\u672A\u914D\u7F6E ${def.primaryEndpointEnv}`;
    } else if (!apiKey) {
      unavailableReason = "\u672A\u914D\u7F6E VOLCENGINE_API_KEY";
    }
    const info = {
      id: def.id,
      name: def.name,
      source: "env",
      available,
      baseUrl,
      modelPreview: maskSecret(endpoint),
      hasApiKey: Boolean(apiKey),
      isDefault: false
    };
    if (unavailableReason) info.unavailableReason = unavailableReason;
    return { info, endpoint, apiKey };
  });
}
function toResolvedModel(model) {
  return {
    id: model.info.id,
    name: model.info.name,
    source: "env",
    baseUrl: model.info.baseUrl,
    model: model.endpoint,
    apiKey: model.apiKey
  };
}
function resolveDefaultModel() {
  const available = buildEnvModels().filter((model) => model.info.available);
  if (available.length === 0) return null;
  const preferredId = readEnv("GAME_MODEL").toLowerCase();
  const preferred = preferredId ? available.find((model) => model.info.id === preferredId) : void 0;
  return toResolvedModel(preferred || available[0]);
}
function getModelCatalog() {
  const defaultModel = resolveDefaultModel();
  const models = buildEnvModels().map((model) => ({
    ...model.info,
    isDefault: model.info.id === defaultModel?.id
  }));
  return {
    models,
    defaultModelId: defaultModel?.id ?? null,
    defaultModelName: defaultModel?.name ?? null,
    hasServerApiKey: Boolean(getServerApiKey())
  };
}
function validateBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ModelConfigError("\u63A5\u53E3\u5730\u5740\u4E0D\u662F\u5408\u6CD5\u7684 URL");
  }
  if (url.username || url.password) {
    throw new ModelConfigError("\u63A5\u53E3\u5730\u5740\u4E0D\u80FD\u5305\u542B\u8D26\u53F7\u5BC6\u7801");
  }
  const hostname = normalizeHostname(url.hostname);
  const local = isLocalHostname(hostname);
  const allowLocal = isLocalHostsAllowed();
  if (local && !allowLocal) {
    throw new ModelConfigError(
      "\u672C\u5730\u63A5\u53E3\u5730\u5740\u672A\u5F00\u542F\uFF1A\u8BF7\u8BBE\u7F6E ALLOW_LOCAL_MODEL_HOSTS=1\uFF08\u4EC5\u5EFA\u8BAE\u672C\u5730\u6D4B\u8BD5\uFF09"
    );
  }
  if (local && allowLocal) {
    return url;
  }
  const hosts = getAllowedHosts();
  const fullHost = url.host.toLowerCase().replace(/\.$/, "");
  const allowed = hosts.some(
    (entry) => entry === fullHost || entry === hostname
  );
  if (!allowed) {
    throw new ModelConfigError(
      "\u63A5\u53E3\u5730\u5740\u4E0D\u5728\u767D\u540D\u5355\u5185\uFF0C\u8BF7\u4F7F\u7528\u652F\u6301\u7684\u6A21\u578B\u670D\u52A1\u5730\u5740"
    );
  }
  if (url.protocol !== "https:") {
    throw new ModelConfigError("\u63A5\u53E3\u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS");
  }
  return url;
}
function resolveCustomModel(input) {
  const record = asRecord(input);
  if (!record) {
    throw new ModelConfigError("\u6A21\u578B\u914D\u7F6E\u683C\u5F0F\u9519\u8BEF");
  }
  const name = readString(record, "name");
  if (!name || name.length > 30) {
    throw new ModelConfigError("\u6A21\u578B\u540D\u79F0\u957F\u5EA6\u9700\u4E3A 1-30 \u4E2A\u5B57\u7B26");
  }
  const baseUrl = readString(record, "baseUrl");
  if (!baseUrl) {
    throw new ModelConfigError("\u8BF7\u586B\u5199\u63A5\u53E3\u5730\u5740");
  }
  const url = validateBaseUrl(baseUrl);
  const model = readString(record, "model");
  if (!model || model.length > 200) {
    throw new ModelConfigError("\u6A21\u578B ID / \u63A5\u5165\u70B9\u957F\u5EA6\u9700\u4E3A 1-200 \u4E2A\u5B57\u7B26");
  }
  let apiKey = readString(record, "apiKey");
  if (apiKey.length > 500) {
    throw new ModelConfigError("API Key \u957F\u5EA6\u4E0D\u80FD\u8D85\u8FC7 500 \u4E2A\u5B57\u7B26");
  }
  if (!apiKey) {
    if (normalizeHostname(url.hostname) === "ark.cn-beijing.volces.com") {
      apiKey = getServerApiKey();
    }
    if (!apiKey) {
      throw new ModelConfigError(
        "\u7F3A\u5C11 API Key\uFF1A\u975E\u706B\u5C71\u65B9\u821F\u63A5\u53E3\u9700\u5728\u6A21\u578B\u914D\u7F6E\u4E2D\u586B\u5199 API Key"
      );
    }
  }
  const rawId = readString(record, "id");
  const id = rawId ? rawId.slice(0, 100) : "custom";
  return { id, name, source: "custom", baseUrl, model, apiKey };
}
function resolveRequestModel(input) {
  if (input.modelConfig !== void 0 && input.modelConfig !== null) {
    return resolveCustomModel(input.modelConfig);
  }
  const rawId = typeof input.modelId === "string" ? input.modelId : typeof input.model === "string" ? input.model : "";
  const id = rawId.trim().toLowerCase();
  if (id) {
    const envModel = buildEnvModels().find((model) => model.info.id === id);
    if (!envModel) {
      throw new ModelConfigError(
        `\u672A\u77E5\u6A21\u578B\uFF1A${rawId.trim()}`,
        ERROR_CODES.MODEL_NOT_FOUND
      );
    }
    if (!envModel.info.available) {
      throw new ModelConfigError(
        `\u6A21\u578B\u300C${envModel.info.name}\u300D\u672A\u914D\u7F6E\uFF1A${envModel.info.unavailableReason || "\u7F3A\u5C11\u73AF\u5883\u53D8\u91CF"}`,
        ERROR_CODES.MODEL_UNAVAILABLE
      );
    }
    return toResolvedModel(envModel);
  }
  return resolveDefaultModel();
}
async function callChatCompletion(model, messages, options) {
  const started = Date.now();
  const timeoutMs = Math.max(1e3, options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(model.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: model.model,
          messages,
          max_tokens: options.maxTokens,
          temperature: options.temperature
        }),
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      const latencyMs2 = Date.now() - started;
      if (isAbortError(error)) {
        throw new ModelCallError(
          `\u8BF7\u6C42\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)} \u79D2\uFF09`,
          { code: ERROR_CODES.TIMEOUT, latencyMs: latencyMs2 }
        );
      }
      throw new ModelCallError(
        "\u65E0\u6CD5\u8FDE\u63A5\u6A21\u578B\u63A5\u53E3\uFF08\u8BF7\u68C0\u67E5\u5730\u5740\u6216\u91CD\u5B9A\u5411\u8BBE\u7F6E\uFF09",
        { code: ERROR_CODES.NETWORK, latencyMs: latencyMs2 }
      );
    }
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      let detail = "";
      try {
        detail = redact(await response.text());
      } catch {
        detail = "";
      }
      if (response.status === 401 || response.status === 403) {
        throw new ModelCallError("\u9274\u6743\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 API Key", {
          code: ERROR_CODES.AUTH,
          status: response.status,
          latencyMs
        });
      }
      if (response.status === 404) {
        throw new ModelCallError("\u63A5\u53E3\u5730\u5740\u6216\u6A21\u578B ID \u4E0D\u5B58\u5728", {
          code: ERROR_CODES.NOT_FOUND,
          status: response.status,
          latencyMs
        });
      }
      if (response.status === 429) {
        throw new ModelCallError("\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\u6216\u989D\u5EA6\u4E0D\u8DB3", {
          code: ERROR_CODES.RATE_LIMIT,
          status: response.status,
          latencyMs
        });
      }
      if (response.status >= 500) {
        throw new ModelCallError("\u6A21\u578B\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528", {
          code: ERROR_CODES.UPSTREAM_5XX,
          status: response.status,
          latencyMs
        });
      }
      throw new ModelCallError(
        `\u6A21\u578B\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF\uFF08HTTP ${response.status}\uFF09${detail ? `\uFF1A${detail}` : ""}`,
        {
          code: ERROR_CODES.UPSTREAM_ERROR,
          status: response.status,
          latencyMs
        }
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ModelCallError("\u6A21\u578B\u8FD4\u56DE\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON", {
        code: ERROR_CODES.BAD_RESPONSE,
        status: response.status,
        latencyMs
      });
    }
    const record = asRecord(data);
    const choices = record?.choices;
    const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
    const message = firstChoice ? asRecord(firstChoice.message) : null;
    const content = message?.content;
    const finishReason = firstChoice?.finish_reason;
    if (typeof content !== "string" || !content.trim()) {
      const messageText = finishReason === "length" ? "\u6A21\u578B\u672A\u8FD4\u56DE\u6700\u7EC8\u6587\u672C\uFF08\u53EF\u80FD\u88AB max_tokens \u622A\u65AD\uFF09" : "\u6A21\u578B\u672A\u8FD4\u56DE\u5185\u5BB9";
      throw new ModelCallError(messageText, {
        code: ERROR_CODES.EMPTY_RESPONSE,
        status: response.status,
        latencyMs
      });
    }
    return {
      text: content,
      latencyMs,
      usage: parseTokenUsage(data)
    };
  } finally {
    clearTimeout(timer);
  }
}
function getTestTimeoutMs() {
  const raw = Number(readEnv("MODEL_TEST_TIMEOUT_MS"));
  if (!Number.isFinite(raw) || raw <= 0) return 2e4;
  return Math.min(Math.max(raw, 1e3), 6e4);
}
async function testModel(input) {
  const hasModelInput = Boolean(input.modelId) || Boolean(input.model) || input.modelConfig !== void 0 && input.modelConfig !== null;
  if (!hasModelInput) {
    return {
      ok: false,
      latencyMs: 0,
      modelName: "",
      source: "none",
      message: "\u7F3A\u5C11\u6A21\u578B\u53C2\u6570\uFF1A\u8BF7\u63D0\u4F9B modelId \u6216 modelConfig",
      code: ERROR_CODES.MISSING_MODEL
    };
  }
  let resolved;
  try {
    resolved = resolveRequestModel(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u6A21\u578B\u914D\u7F6E\u4E0D\u5408\u6CD5";
    const code = error instanceof ModelConfigError ? error.code : ERROR_CODES.MODEL_CONFIG_INVALID;
    return {
      ok: false,
      latencyMs: 0,
      modelName: "",
      source: "none",
      message,
      code
    };
  }
  if (!resolved) {
    return {
      ok: false,
      latencyMs: 0,
      modelName: "",
      source: "none",
      message: "\u672A\u914D\u7F6E\u53EF\u7528\u6A21\u578B\uFF0C\u8BF7\u68C0\u67E5\u73AF\u5883\u53D8\u91CF\u6216\u6DFB\u52A0\u81EA\u5B9A\u4E49\u6A21\u578B",
      code: ERROR_CODES.NO_MODEL
    };
  }
  try {
    const { text, latencyMs } = await callChatCompletion(
      resolved,
      [{ role: "user", content: "\u8BF7\u53EA\u56DE\u590D\uFF1AOK" }],
      {
        // 推理模型会先消耗 reasoning tokens，8 太小会导致 content 为空；
        // 256 足够覆盖推理开销，同时成本仍然很低。
        maxTokens: 256,
        temperature: 0,
        timeoutMs: getTestTimeoutMs()
      }
    );
    return {
      ok: true,
      latencyMs,
      modelName: resolved.name,
      source: resolved.source,
      reply: text.trim().slice(0, 100)
    };
  } catch (error) {
    if (error instanceof ModelCallError) {
      return {
        ok: false,
        latencyMs: error.latencyMs,
        modelName: resolved.name,
        source: resolved.source,
        message: error.message,
        code: error.code,
        status: error.status
      };
    }
    return {
      ok: false,
      latencyMs: 0,
      modelName: resolved.name,
      source: resolved.source,
      message: "\u6A21\u578B\u6D4B\u8BD5\u5931\u8D25",
      code: ERROR_CODES.UNKNOWN
    };
  }
}

// server/src/routes/models.ts
function modelCatalogHandler(c) {
  return c.json({
    success: true,
    data: getModelCatalog()
  });
}
async function modelTestHandler(c) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        success: false,
        code: "INVALID_JSON",
        message: "\u8BF7\u6C42\u53C2\u6570\u683C\u5F0F\u9519\u8BEF"
      },
      400
    );
  }
  const record = typeof body === "object" && body !== null ? body : {};
  const result = await testModel({
    modelId: record.modelId,
    model: record.model,
    modelConfig: record.modelConfig
  });
  if (result.ok) {
    return c.json({
      success: true,
      data: {
        ok: true,
        latencyMs: result.latencyMs,
        modelName: result.modelName,
        source: result.source,
        reply: result.reply
      }
    });
  }
  return c.json({
    success: false,
    code: result.code ?? "UNKNOWN",
    message: result.message || "\u6A21\u578B\u6D4B\u8BD5\u5931\u8D25",
    data: {
      latencyMs: result.latencyMs,
      status: result.status,
      code: result.code,
      modelName: result.modelName,
      source: result.source
    }
  });
}
var modelsRoute = new Hono();
modelsRoute.get("/", modelCatalogHandler);
modelsRoute.post("/test", modelTestHandler);

// api-src/models-test.ts
var app = new Hono2();
app.post("*", modelTestHandler);
var POST = (request) => app.fetch(request);
export {
  POST
};
