import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { exec, execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const builtAppDir = path.join(__dirname, "app");
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 18888);
const HOME = os.homedir();
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const OPENCLAW_DIR = path.join(HOME, ".openclaw");
const CONFIG_FILE = path.join(OPENCLAW_DIR, "openclaw.json");
const DOTENV_FILE = path.join(OPENCLAW_DIR, ".env");
const LEGACY_ENV_FILE = path.join(OPENCLAW_DIR, "env");
const LOG_DIR = path.join(OPENCLAW_DIR, "logs");
const WORKSPACE_DIR = path.join(OPENCLAW_DIR, "workspace");
const WORKSPACE_MEMORY_DIR = path.join(WORKSPACE_DIR, "memory");
const MEMU_LOCAL_DIR = path.join(OPENCLAW_DIR, "memu-local");
const MEMU_LOCAL_DB = path.join(MEMU_LOCAL_DIR, "memories.db");
const SESSION_DIR = path.join(OPENCLAW_DIR, "agents", "main", "sessions");
const SESSION_INDEX_FILE = path.join(SESSION_DIR, "sessions.json");
const MEMORY_DIR = path.join(OPENCLAW_DIR, "memory");
const CRON_JOBS_FILE = path.join(OPENCLAW_DIR, "cron", "jobs.json");
const AUTO_MEMORY_STATE_FILE = path.join(MEMORY_DIR, "auto-extract-state.json");
const GATEWAY_PORT = 18789;
const GATEWAY_LABEL = "ai.openclaw.gateway";
const GATEWAY_PLIST = path.join(HOME, "Library", "LaunchAgents", `${GATEWAY_LABEL}.plist`);
const TEST_CHANNEL_FIELDS = new Set(["userId", "testChatId", "testChannelId"]);
const PROMOTED_NOTES_HEADER = "## Promoted Notes";
const AUTO_MEMORY_VERSION = "2026-03-07-v1";
const AUTO_MEMORY_WINDOW_DAYS = 14;
const AUTO_MEMORY_AUTO_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MEMORY_AUDIT_VERSION = "2026-03-07-v1";
const MEMORY_AUDIT_LOG_FILE = path.join(MEMORY_DIR, "retrieval-audit.jsonl");
const MEMORY_AUDIT_STATE_FILE = path.join(MEMORY_DIR, "retrieval-audit-state.json");
const MEMORY_AUDIT_REFRESH_INTERVAL_MS = 30 * 1000;
const MEMORY_AUDIT_MAX_SESSIONS = 32;
const MEMORY_AUDIT_MAX_RECENT_EVENTS = 8;
const MANAGER_CONFIG_FILE = path.join(OPENCLAW_DIR, "manager.json");
const ALERT_EVENTS_FILE = path.join(OPENCLAW_DIR, "manager-alert-events.jsonl");
const ALERT_RUNTIME_FILE = path.join(OPENCLAW_DIR, "manager-alert-runtime.json");
const ALERT_MONITOR_INTERVAL_MS = 3 * 1000;
const ALERT_MAINTENANCE_WINDOW_MS = 15 * 1000;
const ALERT_EVENT_LIMIT = 20;
const ALERT_EVENT_TYPES = ["down", "recovered", "restart_succeeded", "restart_failed"];
const CRON_NOTIFICATION_EVENTS_FILE = path.join(OPENCLAW_DIR, "manager-cron-events.jsonl");
const CRON_NOTIFICATION_STATE_FILE = path.join(OPENCLAW_DIR, "manager-cron-state.json");
const CRON_NOTIFICATION_MONITOR_INTERVAL_MS = 10 * 1000;
const CRON_NOTIFICATION_EVENT_LIMIT = 30;
const CRON_NOTIFICATION_OUTCOMES = ["success", "failure"];

const ALERT_CHANNEL_SCHEMAS = {
  telegram: {
    id: "telegram",
    label: "Telegram",
    target_label: "Telegram User ID",
    target_placeholder: "1628904587",
    target_field: "userId",
  },
  feishu: {
    id: "feishu",
    label: "飞书",
    target_label: "飞书 Chat ID",
    target_placeholder: "oc_xxx / chat_xxx",
    target_field: "testChatId",
  },
  discord: {
    id: "discord",
    label: "Discord",
    target_label: "Discord Channel ID",
    target_placeholder: "123456789012345678",
    target_field: "testChannelId",
  },
  slack: {
    id: "slack",
    label: "Slack",
    target_label: "Slack Channel ID",
    target_placeholder: "C0123456789",
    target_field: "testChannelId",
  },
};

const DEFAULT_ALERT_SETTINGS = {
  enabled: false,
  channel_type: null,
  target: "",
  auto_restart: true,
  confirm_down_polls: 2,
  cooldown_seconds: 300,
  enabled_events: [...ALERT_EVENT_TYPES],
};

const MANAGER_NOTIFICATION_CHANNEL_SCHEMAS = {
  feishu: {
    id: "feishu",
    label: "飞书通知",
    description: "通过飞书自定义机器人 Webhook 发送单向通知。",
    kind: "webhook",
    supported: true,
    webhook_placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
    secret_placeholder: "可选：如果机器人开启了签名校验，再填写",
  },
  dingtalk: {
    id: "dingtalk",
    label: "钉钉通知",
    description: "通过钉钉自定义机器人 Webhook 发送单向通知。",
    kind: "webhook",
    supported: true,
    webhook_placeholder: "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    secret_placeholder: "可选：如果机器人开启了签名校验，再填写",
  },
  sms: {
    id: "sms",
    label: "短信通知",
    description: "需要额外的短信服务商接入，当前版本仅预留位置。",
    kind: "provider",
    supported: false,
    webhook_placeholder: "",
    secret_placeholder: "",
  },
  voice: {
    id: "voice",
    label: "电话通知",
    description: "需要额外的语音服务商接入，当前版本仅预留位置。",
    kind: "provider",
    supported: false,
    webhook_placeholder: "",
    secret_placeholder: "",
  },
};

const alertRuntime = {
  monitor_active: false,
  bootstrapped: false,
  poll_in_flight: false,
  restart_in_flight: false,
  service_running: false,
  service_pid: null,
  expected_running: false,
  paused_reason: null,
  maintenance_until: null,
  consecutive_down_polls: 0,
  incident_active: false,
  incident_started_at: null,
  restart_attempted: false,
  cooldown_until: null,
  last_poll_at: null,
  last_poll_error: null,
  last_event: null,
  issues: [],
};

const cronNotificationRuntime = {
  monitor_active: false,
  bootstrapped: false,
  poll_in_flight: false,
  last_poll_at: null,
  last_poll_error: null,
  last_event: null,
  issues: [],
  observed_jobs: {},
};

const DURABLE_MEMORY_TARGETS = [
  {
    id: "profile",
    label: "用户画像",
    description: "稳定偏好、身份信息、长期工作习惯。每次恢复都会读。",
    filePath: path.join(WORKSPACE_MEMORY_DIR, "10-core-profile.md"),
    fileLabel: "memory/10-core-profile.md",
  },
  {
    id: "rules",
    label: "协作规则",
    description: "执行方式、边界、输出偏好。每次恢复都会读。",
    filePath: path.join(WORKSPACE_MEMORY_DIR, "30-collaboration-rules.md"),
    fileLabel: "memory/30-collaboration-rules.md",
  },
];

const AUTO_MEMORY_RULES = [
  {
    id: "protect-existing-services",
    target: "rules",
    type: "rule",
    confidence: 0.98,
    match: /((?:不影响|不能影响).*(现有|网页|服务)|现有.*(流程|服务).*(继续|正常)|隔离部署)/,
    content: "部署或安装新组件时，不能影响现有服务和网页流程。",
  },
  {
    id: "chinese-beginner-guidance",
    target: "rules",
    type: "rule",
    confidence: 0.95,
    match: /(中文.*(引导|向导|小白)|小白.*中文|面向小白|一站式安装)/,
    content: "面板和配置流程优先中文化，并面向小白用户。",
  },
  {
    id: "local-privacy-first",
    target: "profile",
    type: "preference",
    confidence: 0.9,
    match: /(本地优先|隐私优先|local-first|privacy-first)/i,
    content: "偏好本地优先、隐私优先的方案。",
  },
  {
    id: "concise-decision-first",
    target: "profile",
    type: "preference",
    confidence: 0.82,
    match: /(结论先|先给结论|简洁|简短|低 token|少废话)/,
    content: "偏好结论先、输出简洁的协作方式。",
  },
  {
    id: "token-efficiency",
    target: "rules",
    type: "rule",
    confidence: 0.88,
    match: /(省 token|高效性|不能.*浪费.*token|不要浪费.*token)/i,
    content: "执行时应优先控制调用成本，避免浪费 token。",
  },
];

const AUTO_MEMORY_NOISE = new Set([
  "1",
  "2",
  "3",
  "ok",
  "回复 ok",
  "继续",
  "好的",
  "好",
  "嗨",
  "hello",
  "启动",
  "检查",
]);

const MEMORY_AUDIT_STOPWORDS = new Set([
  "用户",
  "当前",
  "这个",
  "那个",
  "这些",
  "那些",
  "已经",
  "现在",
  "需要",
  "可以",
  "因为",
  "所以",
  "然后",
  "以及",
  "如果",
  "长期",
  "记忆",
  "候选",
  "会话",
  "配置",
  "规则",
  "协作",
  "方式",
  "系统",
  "默认",
  "稳定",
  "本地",
  "页面",
  "控制台",
  "manager",
  "openclaw",
  "the",
  "and",
  "for",
  "from",
  "with",
  "into",
  "onto",
  "after",
  "before",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "user",
  "users",
  "using",
  "when",
  "while",
  "then",
  "than",
  "only",
  "just",
  "unless",
  "explicitly",
  "does",
  "done",
  "did",
  "doing",
  "do",
  "not",
  "can",
  "will",
  "would",
  "should",
  "could",
  "have",
  "has",
  "had",
  "task",
  "tasks",
  "asks",
  "asked",
  "matter",
  "into",
  "also",
]);

function getExtendedEnv() {
  const fileEnv = readEnvMap();
  const parts = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH || "",
  ].filter(Boolean);

  return {
    ...process.env,
    ...fileEnv,
    PATH: parts.join(":"),
  };
}

const OFFICIAL_PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    icon: "🟣",
    default_base_url: "https://api.anthropic.com",
    api_type: "anthropic-messages",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/anthropic",
    suggested_models: [
      {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        description: "最强大版本，适合复杂任务",
        context_window: 200000,
        max_tokens: 8192,
        recommended: true,
      },
      {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        description: "平衡版本，性价比高",
        context_window: 200000,
        max_tokens: 8192,
        recommended: false,
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "🟢",
    default_base_url: "https://api.openai.com/v1",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/openai",
    suggested_models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        description: "最新多模态模型",
        context_window: 128000,
        max_tokens: 4096,
        recommended: true,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "快速经济版",
        context_window: 128000,
        max_tokens: 4096,
        recommended: false,
      },
    ],
  },
  {
    id: "moonshot",
    name: "Moonshot",
    icon: "🌙",
    default_base_url: "https://api.moonshot.cn/v1",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/moonshot",
    suggested_models: [
      {
        id: "kimi-k2.5",
        name: "Kimi K2.5",
        description: "最新旗舰模型",
        context_window: 200000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "qwen",
    name: "Qwen (通义千问)",
    icon: "🔮",
    default_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/qwen",
    suggested_models: [
      {
        id: "qwen-max",
        name: "Qwen Max",
        description: "最强大版本",
        context_window: 128000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🔵",
    default_base_url: "https://api.deepseek.com",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: null,
    suggested_models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek V3",
        description: "最新对话模型",
        context_window: 128000,
        max_tokens: 8192,
        recommended: true,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek R1",
        description: "推理增强模型",
        context_window: 128000,
        max_tokens: 8192,
        recommended: false,
      },
    ],
  },
  {
    id: "glm",
    name: "GLM (智谱)",
    icon: "🔷",
    default_base_url: "https://open.bigmodel.cn/api/paas/v4",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/glm",
    suggested_models: [
      {
        id: "glm-4",
        name: "GLM-4",
        description: "最新旗舰模型",
        context_window: 128000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: "🟡",
    default_base_url: "https://api.minimax.io/anthropic",
    api_type: "anthropic-messages",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/minimax",
    suggested_models: [
      {
        id: "minimax-m2.1",
        name: "MiniMax M2.1",
        description: "最新模型",
        context_window: 200000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "venice",
    name: "Venice AI",
    icon: "🏛️",
    default_base_url: "https://api.venice.ai/api/v1",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/venice",
    suggested_models: [
      {
        id: "llama-3.3-70b",
        name: "Llama 3.3 70B",
        description: "隐私优先推理",
        context_window: 128000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "🔄",
    default_base_url: "https://openrouter.ai/api/v1",
    api_type: "openai-completions",
    requires_api_key: true,
    docs_url: "https://docs.openclaw.ai/providers/openrouter",
    suggested_models: [
      {
        id: "anthropic/claude-opus-4-5",
        name: "Claude Opus 4.5",
        description: "通过 OpenRouter 访问",
        context_window: 200000,
        max_tokens: 8192,
        recommended: true,
      },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (本地)",
    icon: "🟠",
    default_base_url: "http://localhost:11434",
    api_type: "openai-completions",
    requires_api_key: false,
    docs_url: "https://docs.openclaw.ai/providers/ollama",
    suggested_models: [
      {
        id: "llama3",
        name: "Llama 3",
        description: "本地运行",
        context_window: 8192,
        max_tokens: 4096,
        recommended: true,
      },
    ],
  },
];

function runCommand(cmd, args = [], timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, env: getExtendedEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message || "command failed").trim()));
        return;
      }
      resolve((stdout || "").trim());
    });
  });
}

function runShell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    exec(script, { timeout, shell: "/bin/bash", env: getExtendedEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message || "script failed").trim()));
        return;
      }
      resolve((stdout || "").trim());
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function getStaticRoot() {
  return fs.existsSync(path.join(builtAppDir, "index.html")) ? builtAppDir : publicDir;
}

function serveStatic(req, res) {
  const staticRoot = getStaticRoot();
  const urlPath = req.url === "/" ? "/index.html" : String(req.url || "/");
  const normalized = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(staticRoot, normalized);
  if (!filePath.startsWith(staticRoot)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let finalPath = filePath;
  if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
    const spaFallback = path.join(staticRoot, "index.html");
    if (staticRoot === builtAppDir && fs.existsSync(spaFallback)) {
      finalPath = spaFallback;
    } else {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
  }

  const ext = path.extname(finalPath).toLowerCase();
  const contentType =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
      ? "text/css; charset=utf-8"
      : ext === ".js"
      ? "application/javascript; charset=utf-8"
      : ext === ".svg"
      ? "image/svg+xml"
      : ext === ".json"
      ? "application/json; charset=utf-8"
      : "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(finalPath));
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function ensureObject(target, keys) {
  let current = target;
  for (const key of keys) {
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  return current;
}

function readEnvMap() {
  const out = {};
  for (const envFile of [DOTENV_FILE, LEGACY_ENV_FILE]) {
    if (!fs.existsSync(envFile)) continue;
    const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/g);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const normalized = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
      const idx = normalized.indexOf("=");
      if (idx === -1) continue;
      const key = normalized.slice(0, idx).trim();
      const value = normalized.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      out[key] = value;
    }
  }
  return out;
}

function writeEnvMap(map) {
  fs.mkdirSync(path.dirname(DOTENV_FILE), { recursive: true });
  const lines = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`);
  fs.writeFileSync(DOTENV_FILE, `${lines.join("\n")}\n`, "utf8");
}

function setEnvValue(key, value) {
  const env = readEnvMap();
  env[key] = value;
  writeEnvMap(env);
}

function removeEnvValue(key) {
  const env = readEnvMap();
  delete env[key];
  writeEnvMap(env);
}

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function resolveSecretInputValue(value, env = readEnvMap()) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const legacyRef = trimmed.match(/^env:([A-Z_][A-Z0-9_]*)$/);
  if (legacyRef) {
    return env[legacyRef[1]] || process.env[legacyRef[1]] || "";
  }
  if (!trimmed.includes("${")) {
    return trimmed;
  }
  return trimmed.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, key) => env[key] || process.env[key] || "");
}

function normalizeInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMemoryFingerprint(value) {
  return normalizeInlineText(value)
    .toLowerCase()
    .replace(/[\s.,，。!?！？:：;；"'`~\-_/\\()[\]{}<>|]+/g, "");
}

function readJsonFile(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeAlertChannelType(value) {
  return typeof value === "string" && ALERT_CHANNEL_SCHEMAS[value] ? value : null;
}

function normalizeAlertTarget(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAlertEvents(value) {
  const selected = Array.isArray(value) ? value.filter((item) => ALERT_EVENT_TYPES.includes(item)) : [];
  return selected.length > 0 ? Array.from(new Set(selected)) : [...ALERT_EVENT_TYPES];
}

function readManagerConfigRaw() {
  return readJsonFile(MANAGER_CONFIG_FILE, {});
}

function writeManagerConfig(settings) {
  writeJsonFile(MANAGER_CONFIG_FILE, settings);
}

function getManagerNotificationsRoot(raw = readManagerConfigRaw()) {
  return raw?.notifications && typeof raw.notifications === "object" ? raw.notifications : {};
}

function updateManagerConfig(mutator) {
  const current = readManagerConfigRaw();
  const next = typeof mutator === "function" ? mutator(current) : current;
  writeManagerConfig(next);
  return next;
}

function normalizeNotificationChannelId(value) {
  return typeof value === "string" && MANAGER_NOTIFICATION_CHANNEL_SCHEMAS[value]
    ? value
    : null;
}

function normalizeCronNotificationOutcomes(value) {
  const selected = Array.isArray(value)
    ? value.filter((item) => CRON_NOTIFICATION_OUTCOMES.includes(item))
    : [];
  return selected.length > 0 ? Array.from(new Set(selected)) : [...CRON_NOTIFICATION_OUTCOMES];
}

function normalizeManagerNotificationChannelConfig(channelId, input = {}) {
  const schema = MANAGER_NOTIFICATION_CHANNEL_SCHEMAS[channelId];
  const webhookUrl =
    typeof input.webhook_url === "string"
      ? input.webhook_url.trim()
      : typeof input.webhookUrl === "string"
      ? input.webhookUrl.trim()
      : "";
  const secret =
    typeof input.secret === "string"
      ? input.secret.trim()
      : typeof input.sign_secret === "string"
      ? input.sign_secret.trim()
      : "";
  const enabled = input?.enabled === true && schema?.supported === true;

  return {
    id: channelId,
    label: schema?.label || channelId,
    description: schema?.description || "",
    kind: schema?.kind || "webhook",
    supported: schema?.supported === true,
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : schema?.label || channelId,
    enabled,
    webhook_url: webhookUrl,
    configured: webhookUrl.length > 0,
    secret,
    has_secret: secret.length > 0,
    webhook_placeholder: schema?.webhook_placeholder || "",
    secret_placeholder: schema?.secret_placeholder || "",
  };
}

function getManagerNotificationChannels(raw = readManagerConfigRaw()) {
  const notificationsRoot = getManagerNotificationsRoot(raw);
  const savedChannels =
    notificationsRoot?.channels && typeof notificationsRoot.channels === "object"
      ? notificationsRoot.channels
      : {};

  return Object.keys(MANAGER_NOTIFICATION_CHANNEL_SCHEMAS).map((channelId) =>
    normalizeManagerNotificationChannelConfig(channelId, savedChannels[channelId] || {})
  );
}

function validateManagerNotificationChannels(channels = []) {
  const issues = [];
  for (const channel of channels) {
    if (!channel.supported) continue;
    if (channel.enabled && !channel.webhook_url) {
      issues.push(`${channel.label} 已启用，但还没有填写 Webhook 地址。`);
    }
  }
  return issues;
}

function saveManagerNotificationChannels(input = []) {
  const incoming = Array.isArray(input) ? input : [];
  const channelMap = new Map(incoming.map((item) => [item.id, item]));

  const normalizedChannels = Object.keys(MANAGER_NOTIFICATION_CHANNEL_SCHEMAS).reduce((acc, channelId) => {
    acc[channelId] = normalizeManagerNotificationChannelConfig(channelId, channelMap.get(channelId) || {});
    return acc;
  }, {});

  updateManagerConfig((current) => ({
    ...current,
    notifications: {
      ...getManagerNotificationsRoot(current),
      channels: Object.fromEntries(
        Object.entries(normalizedChannels).map(([channelId, channel]) => [
          channelId,
          {
            enabled: channel.enabled,
            name: channel.name,
            webhook_url: channel.webhook_url,
            secret: channel.secret,
          },
        ])
      ),
    },
  }));

  const payloadChannels = getManagerNotificationChannels();
  return {
    channels: payloadChannels,
    issues: validateManagerNotificationChannels(payloadChannels),
    config_path: MANAGER_CONFIG_FILE,
  };
}

function getManagerNotificationChannelsPayload() {
  const channels = getManagerNotificationChannels();
  return {
    channels,
    issues: validateManagerNotificationChannels(channels),
    config_path: MANAGER_CONFIG_FILE,
  };
}

async function sendTestManagerNotification(input = {}) {
  const channelId = normalizeNotificationChannelId(input.channelId || input.channel_id);
  if (!channelId) {
    return {
      success: false,
      message: "测试通知未发送",
      delivery_status: "skipped_missing_channel",
      delivery_detail: {
        status: "skipped_missing_channel",
        error: "missing channel",
        channel_id: null,
      },
    };
  }

  const message =
    typeof input.message === "string" && input.message.trim()
      ? input.message.trim()
      : [
          "OpenClaw 单向通知测试",
          "",
          `渠道: ${MANAGER_NOTIFICATION_CHANNEL_SCHEMAS[channelId]?.label || channelId}`,
          `时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
          "这是一条测试消息，用于验证定时任务单向通知渠道是否可达。",
        ].join("\n");

  const delivery = await sendManagerNotification(channelId, message);
  return {
    success: delivery.status === "sent",
    message: delivery.status === "sent" ? "测试通知已发送" : "测试通知未发送",
    delivery_status: delivery.status,
    delivery_detail: delivery,
  };
}

function getCronNotificationBindingsRaw(raw = readManagerConfigRaw()) {
  const notificationsRoot = getManagerNotificationsRoot(raw);
  return notificationsRoot?.cron_jobs && typeof notificationsRoot.cron_jobs === "object"
    ? notificationsRoot.cron_jobs
    : {};
}

function normalizeCronNotificationBinding(input = {}, availableChannels = []) {
  const channelId = normalizeNotificationChannelId(input.channel_id || input.channelId);
  const enabled = input?.enabled === true;
  const outcomes = normalizeCronNotificationOutcomes(input.notify_on || input.notifyOn);
  const channel = availableChannels.find((item) => item.id === channelId) || null;

  return {
    enabled,
    channel_id: channelId,
    notify_on: outcomes,
    channel_label: channel?.name || channel?.label || null,
  };
}

function extractCronNotificationBindingInput(input, availableChannels = []) {
  const enabled = input?.notificationEnabled === true;
  const notifyOn = [];
  if (input?.notificationOnSuccess === true) notifyOn.push("success");
  if (input?.notificationOnFailure === true) notifyOn.push("failure");

  return normalizeCronNotificationBinding(
    {
      enabled,
      channel_id: input?.notificationChannelId || null,
      notify_on: notifyOn,
    },
    availableChannels
  );
}

function saveCronNotificationBinding(jobId, input, availableChannels = getManagerNotificationChannels()) {
  const normalized = extractCronNotificationBindingInput(input, availableChannels);
  updateManagerConfig((current) => {
    const currentRoot = getManagerNotificationsRoot(current);
    const currentBindings = getCronNotificationBindingsRaw(current);
    const nextBindings = { ...currentBindings };

    if (normalized.enabled && normalized.channel_id) {
      nextBindings[jobId] = {
        enabled: true,
        channel_id: normalized.channel_id,
        notify_on: normalized.notify_on,
      };
    } else {
      delete nextBindings[jobId];
    }

    return {
      ...current,
      notifications: {
        ...currentRoot,
        cron_jobs: nextBindings,
      },
    };
  });

  return normalized;
}

function removeCronNotificationBinding(jobId) {
  updateManagerConfig((current) => {
    const currentRoot = getManagerNotificationsRoot(current);
    const currentBindings = getCronNotificationBindingsRaw(current);
    if (!currentBindings[jobId]) return current;
    const nextBindings = { ...currentBindings };
    delete nextBindings[jobId];
    return {
      ...current,
      notifications: {
        ...currentRoot,
        cron_jobs: nextBindings,
      },
    };
  });
}

function normalizeAlertSettings(input = {}, channelCandidates = []) {
  const preferredCandidate =
    channelCandidates.find((item) => item.id === "telegram") ||
    channelCandidates.find((item) => item.running) ||
    channelCandidates[0] ||
    null;

  const channelType = normalizeAlertChannelType(input.channel_type) || preferredCandidate?.id || null;
  const candidate = channelCandidates.find((item) => item.id === channelType) || null;

  return {
    enabled: input.enabled === true,
    channel_type: channelType,
    target: normalizeAlertTarget(input.target || candidate?.default_target || ""),
    auto_restart: input.auto_restart !== false,
    confirm_down_polls: Math.max(1, Number(input.confirm_down_polls || DEFAULT_ALERT_SETTINGS.confirm_down_polls)),
    cooldown_seconds: Math.max(60, Number(input.cooldown_seconds || DEFAULT_ALERT_SETTINGS.cooldown_seconds)),
    enabled_events: normalizeAlertEvents(input.enabled_events),
  };
}

function validateAlertSettings(settings, channelCandidates = []) {
  const issues = [];

  if (!settings.enabled) return issues;
  if (!settings.channel_type) {
    issues.push("已开启状态通知，但还没有可用的告警渠道。");
    return issues;
  }

  const candidate = channelCandidates.find((item) => item.id === settings.channel_type) || null;
  if (!candidate) {
    issues.push("当前选择的告警渠道不可用，请重新选择。");
    return issues;
  }

  if (!settings.target) {
    issues.push(`已开启状态通知，但还没有填写 ${candidate.target_label}。`);
  }

  return issues;
}

function readAlertEvents(limit = ALERT_EVENT_LIMIT) {
  return readJsonlTail(ALERT_EVENTS_FILE, limit)
    .reverse()
    .map((event) => ({
      id: String(event?.id || crypto.randomUUID()),
      type: ALERT_EVENT_TYPES.includes(event?.type) ? event.type : "down",
      timestamp: event?.timestamp || new Date().toISOString(),
      source: typeof event?.source === "string" ? event.source : "detector",
      message: truncateText(event?.message || ""),
      delivery_status: typeof event?.delivery_status === "string" ? event.delivery_status : "unknown",
      delivery_detail:
        event?.delivery_detail && typeof event.delivery_detail === "object" ? event.delivery_detail : null,
    }));
}

function persistAlertRuntime(extra = {}) {
  const snapshot = {
    ...alertRuntime,
    ...extra,
    cooldown_remaining_ms: Math.max(0, Number(alertRuntime.cooldown_until || 0) - Date.now()),
  };
  writeJsonFile(ALERT_RUNTIME_FILE, snapshot);
  return snapshot;
}

function getAlertRuntimeStatus() {
  const snapshot = persistAlertRuntime();
  return {
    monitor_active: snapshot.monitor_active,
    bootstrapped: snapshot.bootstrapped,
    service_running: snapshot.service_running,
    service_pid: snapshot.service_pid,
    expected_running: snapshot.expected_running,
    paused_reason: snapshot.paused_reason,
    maintenance_until: snapshot.maintenance_until,
    consecutive_down_polls: snapshot.consecutive_down_polls,
    incident_active: snapshot.incident_active,
    incident_started_at: snapshot.incident_started_at,
    restart_in_flight: snapshot.restart_in_flight,
    restart_attempted: snapshot.restart_attempted,
    cooldown_until: snapshot.cooldown_until,
    cooldown_remaining_ms: snapshot.cooldown_remaining_ms,
    last_poll_at: snapshot.last_poll_at,
    last_poll_error: snapshot.last_poll_error,
    last_event: snapshot.last_event,
    issues: Array.isArray(snapshot.issues) ? snapshot.issues : [],
  };
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function readMarkdownItems(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, ""));
}

function estimateTokensFromText(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function readFileSizeSafe(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

function readRecentVisibleSessions(limit = 12) {
  const payload = readJsonFile(SESSION_INDEX_FILE, {});
  const entries = Object.values(payload || {})
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      updatedAt: Number(item.updatedAt || 0),
      contextTokens: Number(item.contextTokens || 0),
      sessionFile: typeof item.sessionFile === "string" ? item.sessionFile : null,
    }))
    .filter((item) => item.updatedAt > 0)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);

  return entries;
}

function stripPromotedMemoryPrefix(value) {
  return String(value || "").replace(/^\d{4}-\d{2}-\d{2}(?: \[[^\]]+\])?:\s*/, "").trim();
}

function readMarkdownPreview(filePath, maxItems = 6) {
  if (!fs.existsSync(filePath)) {
    return { itemCount: 0, previewItems: [], lastUpdated: null };
  }
  const bulletLines = readMarkdownItems(filePath);
  const stats = fs.statSync(filePath);
  return {
    itemCount: bulletLines.length,
    previewItems: bulletLines.slice(0, maxItems),
    lastUpdated: stats.mtime.toISOString(),
  };
}

function readAutoMemoryState() {
  return readJsonFile(AUTO_MEMORY_STATE_FILE, {
    version: AUTO_MEMORY_VERSION,
    last_run_at: null,
    last_stats: null,
  });
}

function writeAutoMemoryState(partialState) {
  const current = readAutoMemoryState();
  writeJsonFile(AUTO_MEMORY_STATE_FILE, {
    ...current,
    ...partialState,
    version: AUTO_MEMORY_VERSION,
  });
}

function estimateTokensFromChars(value) {
  const chars = Math.max(0, Number(value) || 0);
  if (chars === 0) return 0;
  return Math.ceil(chars / 4);
}

function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function readJsonlTail(filePath, limit = 12) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.trim()) return [];
  return content
    .trim()
    .split(/\r?\n/g)
    .slice(-Math.max(1, limit))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getFileMtimeMs(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function truncateText(value, limit = 120) {
  const text = normalizeInlineText(value);
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function readSessionIndexEntries(limit = MEMORY_AUDIT_MAX_SESSIONS) {
  const payload = readJsonFile(SESSION_INDEX_FILE, {});
  return Object.entries(payload || {})
    .map(([sessionKey, entry]) => ({
      sessionKey,
      sessionFile: typeof entry?.sessionFile === "string" ? entry.sessionFile : null,
      updatedAt: Number(entry?.updatedAt || 0),
      contextTokens: Number(entry?.contextTokens || 0),
      systemPromptReport:
        entry?.systemPromptReport && typeof entry.systemPromptReport === "object" ? entry.systemPromptReport : null,
    }))
    .filter((entry) => entry.sessionFile)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
}

function parseSessionMessageRecords(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/g)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((record) => record?.type === "message" && ["user", "assistant"].includes(record?.message?.role))
    .map((record) => ({
      id: record.id || null,
      timestamp: record.timestamp || null,
      role: record.message.role,
      text: cleanSessionMessage(extractTextFromMessageContent(record.message.content)),
    }))
    .filter((record) => record.text);
}

function buildRecallKeywords(value) {
  const raw = String(value || "").toLowerCase();
  const chunks = raw.match(/[a-z0-9._:-]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  const keywords = new Set();

  for (const chunk of chunks) {
    if (MEMORY_AUDIT_STOPWORDS.has(chunk)) continue;
    if (/^[\u4e00-\u9fff]+$/.test(chunk)) {
      if (chunk.length <= 8) {
        keywords.add(chunk);
      }
      const maxSize = Math.min(4, chunk.length);
      for (let size = 2; size <= maxSize; size += 1) {
        for (let index = 0; index <= chunk.length - size; index += 1) {
          const segment = chunk.slice(index, index + size);
          if (segment.length < 2 || MEMORY_AUDIT_STOPWORDS.has(segment)) continue;
          keywords.add(segment);
        }
      }
      continue;
    }
    keywords.add(chunk);
  }

  return Array.from(keywords)
    .filter((item) => item.length >= 2 && item.length <= 24)
    .slice(0, 80);
}

function buildDurableMemoryAuditEntries() {
  const entries = [];
  const seen = new Set();

  for (const target of DURABLE_MEMORY_TARGETS) {
    const items = readMarkdownItems(target.filePath);
    for (const item of items) {
      const content = stripPromotedMemoryPrefix(item);
      const fingerprint = normalizeMemoryFingerprint(content);
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      entries.push({
        id: `${target.id}:${entries.length + 1}`,
        targetId: target.id,
        targetLabel: target.label,
        fileLabel: target.fileLabel,
        content,
        fingerprint,
        keywords: buildRecallKeywords(content),
        tokenEstimate: estimateTokensFromText(content),
      });
    }
  }

  return entries;
}

function getSharedRecallKeywords(sourceKeywords, targetKeywords) {
  const targetSet = new Set(targetKeywords);
  return sourceKeywords.filter((keyword) => targetSet.has(keyword));
}

function findRelevantMemoryMatches(text, durableEntries, limit = 3) {
  const fingerprint = normalizeMemoryFingerprint(text);
  if (!fingerprint) return [];
  const keywords = buildRecallKeywords(text);

  return durableEntries
    .map((entry) => {
      const exact =
        (fingerprint.length >= 8 && fingerprint.includes(entry.fingerprint)) ||
        (entry.fingerprint.length >= 8 && entry.fingerprint.includes(fingerprint));
      const sharedKeywords = getSharedRecallKeywords(keywords, entry.keywords);
      const strongKeywords = sharedKeywords.filter((keyword) => {
        if (/[0-9]/.test(keyword)) return true;
        if (/^[a-z._:-]+$/.test(keyword)) return keyword.length >= 5;
        return keyword.length >= 4;
      });
      const mediumKeywords = sharedKeywords.filter((keyword) => /^[\u4e00-\u9fff]+$/.test(keyword) && keyword.length === 3);
      const relevant = exact || strongKeywords.length >= 1 || mediumKeywords.length >= 2;

      if (!relevant) {
        return null;
      }

      const score = exact
        ? 0.98
        : Math.min(0.92, 0.45 + strongKeywords.length * 0.18 + mediumKeywords.length * 0.08);

      return {
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        fileLabel: entry.fileLabel,
        content: entry.content,
        tokenEstimate: entry.tokenEstimate,
        score: Number(score.toFixed(2)),
        sharedKeywords: sharedKeywords.slice(0, 6),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function didAssistantApplyMemory(assistantText, matches) {
  if (!assistantText || !matches?.length) return false;
  const assistantFingerprint = normalizeMemoryFingerprint(assistantText);
  const assistantKeywords = buildRecallKeywords(assistantText);

  return matches.some((match) => {
    if (
      (assistantFingerprint.length >= 8 && assistantFingerprint.includes(normalizeMemoryFingerprint(match.content))) ||
      match.sharedKeywords.some((keyword) => assistantKeywords.includes(keyword))
    ) {
      return true;
    }
    return false;
  });
}

function createMemoryAuditSummary() {
  return {
    prompt_events: 0,
    memory_index_events: 0,
    workspace_prompt_token_total: 0,
    memory_index_token_total: 0,
    processed_user_messages: 0,
    related_hit_messages: 0,
    applied_hit_messages: 0,
    targeted_token_total: 0,
    potential_saved_token_total: 0,
  };
}

function readMemoryAuditState() {
  const raw = readJsonFile(MEMORY_AUDIT_STATE_FILE, {});
  return {
    version: MEMORY_AUDIT_VERSION,
    last_refreshed_at: typeof raw.last_refreshed_at === "string" ? raw.last_refreshed_at : null,
    last_session_index_mtime_ms: Number(raw.last_session_index_mtime_ms || 0),
    processed_injections:
      raw.processed_injections && typeof raw.processed_injections === "object" ? raw.processed_injections : {},
    processed_messages:
      raw.processed_messages && typeof raw.processed_messages === "object" ? raw.processed_messages : {},
    summary: {
      ...createMemoryAuditSummary(),
      ...(raw.summary && typeof raw.summary === "object" ? raw.summary : {}),
    },
  };
}

function writeMemoryAuditState(state) {
  const processedMessages = Object.entries(state.processed_messages || {})
    .map(([key, value]) => [key, Number(value || 0)])
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3000);

  writeJsonFile(MEMORY_AUDIT_STATE_FILE, {
    version: MEMORY_AUDIT_VERSION,
    last_refreshed_at: state.last_refreshed_at || null,
    last_session_index_mtime_ms: Number(state.last_session_index_mtime_ms || 0),
    processed_injections: state.processed_injections || {},
    processed_messages: Object.fromEntries(processedMessages),
    summary: {
      ...createMemoryAuditSummary(),
      ...(state.summary || {}),
    },
  });
}

function buildMemoryAuditRecentEvents() {
  return readJsonlTail(MEMORY_AUDIT_LOG_FILE, MEMORY_AUDIT_MAX_RECENT_EVENTS)
    .reverse()
    .map((entry) => {
      if (entry.type === "prompt_injection") {
        return {
          type: "prompt_injection",
          label: "真实注入",
          occurred_at: entry.occurred_at || null,
          session_key: entry.session_key || "unknown",
          preview: truncateText((entry.injected_files || []).join(" · "), 100) || "Workspace prompt files",
          detail: `MEMORY.md ${entry.memory_index_tokens || 0} tokens · 总注入 ${entry.workspace_prompt_tokens || 0} tokens`,
        };
      }

      return {
        type: "memory_recall",
        label: entry.assistant_applied ? "相关命中并采纳" : "相关命中",
        occurred_at: entry.occurred_at || null,
        session_key: entry.session_key || "unknown",
        preview: entry.user_preview || "Recent message",
        detail: `${(entry.matches || [])
          .map((match) => `${match.target_label}:${truncateText(match.content, 36)}`)
          .join(" · ") || "No match details"}${
          typeof entry.potential_saved_tokens === "number" ? ` · 潜在节省 ${entry.potential_saved_tokens} tokens` : ""
        }`,
      };
    });
}

function refreshMemoryAudit(force = false) {
  const currentState = readMemoryAuditState();
  const sessionIndexMtime = getFileMtimeMs(SESSION_INDEX_FILE);
  const lastRefreshAge =
    currentState.last_refreshed_at ? Date.now() - new Date(currentState.last_refreshed_at).getTime() : Infinity;

  if (
    !force &&
    lastRefreshAge < MEMORY_AUDIT_REFRESH_INTERVAL_MS &&
    currentState.last_session_index_mtime_ms >= sessionIndexMtime
  ) {
    return {
      ...currentState,
      recent_events: buildMemoryAuditRecentEvents(),
    };
  }

  const state = {
    ...currentState,
    processed_injections: { ...(currentState.processed_injections || {}) },
    processed_messages: { ...(currentState.processed_messages || {}) },
    summary: {
      ...createMemoryAuditSummary(),
      ...(currentState.summary || {}),
    },
  };
  const durableEntries = buildDurableMemoryAuditEntries();
  const durableTokenBudget = durableEntries.reduce((sum, entry) => sum + entry.tokenEstimate, 0);
  const sessions = readSessionIndexEntries(MEMORY_AUDIT_MAX_SESSIONS);

  for (const session of sessions) {
    const report = session.systemPromptReport;
    if (
      report &&
      Number(report.generatedAt || 0) > 0 &&
      Number(state.processed_injections[session.sessionKey] || 0) !== Number(report.generatedAt || 0)
    ) {
      const injectedFiles = Array.isArray(report.injectedWorkspaceFiles) ? report.injectedWorkspaceFiles : [];
      const workspacePromptTokens = injectedFiles.reduce(
        (sum, item) => sum + estimateTokensFromChars(item?.injectedChars || item?.rawChars || 0),
        0
      );
      const memoryIndexEntry = injectedFiles.find((item) => item?.name === "MEMORY.md");
      const memoryIndexTokens = memoryIndexEntry
        ? estimateTokensFromChars(memoryIndexEntry.injectedChars || memoryIndexEntry.rawChars || 0)
        : 0;

      appendJsonLine(MEMORY_AUDIT_LOG_FILE, {
        type: "prompt_injection",
        occurred_at: new Date(Number(report.generatedAt || Date.now())).toISOString(),
        session_key: session.sessionKey,
        session_id: report.sessionId || null,
        provider: report.provider || null,
        model: report.model || null,
        injected_files: injectedFiles.map((item) => item?.name).filter(Boolean),
        workspace_prompt_tokens: workspacePromptTokens,
        memory_index_tokens: memoryIndexTokens,
      });

      state.processed_injections[session.sessionKey] = Number(report.generatedAt || 0);
      state.summary.prompt_events += 1;
      state.summary.workspace_prompt_token_total += workspacePromptTokens;
      if (memoryIndexTokens > 0) {
        state.summary.memory_index_events += 1;
        state.summary.memory_index_token_total += memoryIndexTokens;
      }
    }

    const records = parseSessionMessageRecords(session.sessionFile);
    if (records.length === 0) continue;
    const memoryIndexTokensFromSession = report
      ? estimateTokensFromChars(
          (Array.isArray(report.injectedWorkspaceFiles)
            ? report.injectedWorkspaceFiles.find((item) => item?.name === "MEMORY.md")?.injectedChars
            : 0) || 0
        )
      : 0;

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!record || record.role !== "user") continue;
      const messageKey = `${session.sessionKey}:${record.id || record.timestamp || index}`;
      if (state.processed_messages[messageKey]) continue;

      const occurredAt = record.timestamp ? Date.parse(record.timestamp) || Date.now() : Date.now();
      state.processed_messages[messageKey] = occurredAt;
      state.summary.processed_user_messages += 1;

      const matches = findRelevantMemoryMatches(record.text, durableEntries, 3);
      if (matches.length === 0) continue;

      let assistantText = "";
      for (let nextIndex = index + 1; nextIndex < records.length; nextIndex += 1) {
        const nextRecord = records[nextIndex];
        if (!nextRecord) continue;
        if (nextRecord.role === "assistant") {
          assistantText = nextRecord.text;
          break;
        }
        if (nextRecord.role === "user") {
          break;
        }
      }

      const targetedTokenEstimate = matches.reduce((sum, match) => sum + match.tokenEstimate, 0);
      const promptBudget = memoryIndexTokensFromSession || durableTokenBudget;
      const potentialSavedTokens =
        promptBudget > 0 ? Math.max(0, promptBudget - targetedTokenEstimate) : null;
      const assistantApplied = didAssistantApplyMemory(assistantText, matches);

      appendJsonLine(MEMORY_AUDIT_LOG_FILE, {
        type: "memory_recall",
        occurred_at: record.timestamp || new Date(occurredAt).toISOString(),
        session_key: session.sessionKey,
        message_id: record.id || null,
        user_preview: truncateText(record.text, 96),
        assistant_applied: assistantApplied,
        assistant_preview: truncateText(assistantText, 96),
        targeted_token_estimate: targetedTokenEstimate,
        potential_saved_tokens: potentialSavedTokens,
        matches: matches.map((match) => ({
          target_id: match.targetId,
          target_label: match.targetLabel,
          file_label: match.fileLabel,
          content: truncateText(match.content, 72),
          score: match.score,
          shared_keywords: match.sharedKeywords,
        })),
      });

      state.summary.related_hit_messages += 1;
      state.summary.targeted_token_total += targetedTokenEstimate;
      if (typeof potentialSavedTokens === "number") {
        state.summary.potential_saved_token_total += potentialSavedTokens;
      }
      if (assistantApplied) {
        state.summary.applied_hit_messages += 1;
      }
    }
  }

  state.last_refreshed_at = new Date().toISOString();
  state.last_session_index_mtime_ms = sessionIndexMtime;
  writeMemoryAuditState(state);

  return {
    ...state,
    recent_events: buildMemoryAuditRecentEvents(),
  };
}

async function ensureMemuLocalDb() {
  fs.mkdirSync(MEMU_LOCAL_DIR, { recursive: true });
  await runCommand(
    "sqlite3",
    [
      MEMU_LOCAL_DB,
      `create table if not exists memories (
        id text primary key,
        content text,
        metadata text,
        embedding blob,
        created_at text,
        updated_at text
      );`,
    ],
    10000
  );
}

async function readCandidateMemories(limit = 24) {
  if (!fs.existsSync(MEMU_LOCAL_DB)) return [];
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 24, 100));
  const separator = "\u001f";
  const sql = `select id,
    replace(replace(ifnull(content, ''), char(10), ' '), char(13), ' '),
    replace(replace(ifnull(metadata, '{}'), char(10), ' '), char(13), ' '),
    ifnull(created_at, ''),
    ifnull(updated_at, '')
    from memories
    order by coalesce(updated_at, created_at) desc
    limit ${boundedLimit};`;
  const output = await runCommand("sqlite3", ["-separator", separator, MEMU_LOCAL_DB, sql], 10000).catch(
    () => ""
  );
  if (!output) return [];
  return output
    .split(/\r?\n/g)
    .filter(Boolean)
    .map((line) => {
      const [id, content, metadataRaw, createdAt, updatedAt] = line.split(separator);
      let metadata = {};
      try {
        metadata = metadataRaw ? JSON.parse(metadataRaw) : {};
      } catch {
        metadata = { raw: metadataRaw };
      }
      return {
        id,
        content: normalizeInlineText(content),
        metadata,
        created_at: createdAt || null,
        updated_at: updatedAt || null,
      };
    });
}

async function getCandidateMemoryById(memoryId) {
  const candidates = await readCandidateMemories(100);
  return candidates.find((candidate) => candidate.id === memoryId) || null;
}

async function getCandidateCount() {
  if (!fs.existsSync(MEMU_LOCAL_DB)) return 0;
  const output = await runCommand("sqlite3", [MEMU_LOCAL_DB, "select count(*) from memories;"], 10000).catch(
    () => "0"
  );
  return Number(output) || 0;
}

function extractTextFromMessageContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function cleanSessionMessage(rawText) {
  if (!rawText) return "";
  let text = String(rawText);
  text = text.replace(/\[media attached:[^\n]*\]\n?/gi, "");
  text = text.replace(/To send an image back,[\s\S]*?(?=Conversation info \(untrusted metadata\):)/gi, "");
  text = text.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/gi, "");
  text = text.replace(/Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\s*/gi, "");
  text = text.replace(/\[\[reply_to_current\]\]\s*/g, "");
  text = text.replace(/Current time:[^\n]+/gi, "");
  text = text.replace(/Return your summary as plain text[\s\S]*$/gi, "");

  const truncationMarkers = ["\nOverview", "\nSecurity audit", "\nChannels", "\nSessions", "\nHealth", "\nFAQ:"];
  for (const marker of truncationMarkers) {
    const index = text.indexOf(marker);
    if (index > 0) {
      text = text.slice(0, index);
      break;
    }
  }

  if (/[┌┬┐└┴┘│├┤─]/.test(text) && text.length > 180) {
    text = text.slice(0, 180);
  }

  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isNoiseSegment(segment) {
  const normalized = normalizeInlineText(segment).toLowerCase();
  if (!normalized) return true;
  if (AUTO_MEMORY_NOISE.has(normalized)) return true;
  if (normalized.length <= 2) return true;
  if (/^https?:\/\/\S+$/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)) return true;
  if (/^(继续|检查|启动|安装|部署|看看|打开)$/.test(normalized)) return true;
  if (/^回复 ok$/i.test(normalized)) return true;
  if (/^(message_id|sender_id|sender|timestamp)/i.test(normalized)) return true;
  return false;
}

function splitIntoMemorySegments(text) {
  return text
    .split(/\r?\n/g)
    .flatMap((line) =>
      line
        .split(/[。！？!?]/g)
        .map((part) => part.replace(/^\s*[\d一二三四五六七八九十]+[、.)]\s*/, ""))
    )
    .map((segment) => normalizeInlineText(segment))
    .filter(Boolean);
}

function inferGenericMemory(segment) {
  if (/[?？]$/.test(segment) || /(什么|怎么|有没有|能不能|可以吗|是不是|是否|吗$)/.test(segment)) {
    return null;
  }
  const scoreParts = {
    stable: 0,
    preference: 0,
    question: 0,
  };

  if (/(不影响|不能|不要|必须|优先|默认|稳定|本地|隐私|中文|小白|隔离)/.test(segment)) {
    scoreParts.stable += 2;
  }
  if (/(偏好|喜欢|希望|尽量|最好|习惯|常用|我一般|我更喜欢|用户)/.test(segment)) {
    scoreParts.preference += 1;
  }
  if (/^(openclaw|docker|npm|curl|http|messageId|chatId|pid)/i.test(segment)) {
    scoreParts.question += 2;
  }
  if (segment.length > 180) {
    scoreParts.question += 2;
  }

  const score = scoreParts.stable + scoreParts.preference - scoreParts.question;
  if (score < 2) return null;

  return {
    content: segment.endsWith("。") ? segment : `${segment}。`,
    target: /(不影响|不能|不要|必须|优先|隔离)/.test(segment) ? "rules" : "profile",
    type: /(不影响|不能|不要|必须|优先|隔离)/.test(segment) ? "rule" : "preference",
    confidence: Math.min(0.88, 0.55 + score * 0.08),
    ruleId: "generic",
  };
}

function extractCandidatesFromText(text) {
  const created = [];
  const seen = new Set();
  let matchedExplicitRule = false;

  for (const rule of AUTO_MEMORY_RULES) {
    if (!rule.match.test(text)) continue;
    matchedExplicitRule = true;
    const fingerprint = normalizeMemoryFingerprint(rule.content);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    created.push({
      content: rule.content,
      target: rule.target,
      type: rule.type,
      confidence: rule.confidence,
      ruleId: rule.id,
    });
  }

  if (matchedExplicitRule) {
    return created;
  }

  for (const segment of splitIntoMemorySegments(text)) {
    if (isNoiseSegment(segment)) continue;
    const inferred = inferGenericMemory(segment);
    if (!inferred) continue;
    const fingerprint = normalizeMemoryFingerprint(inferred.content);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    created.push(inferred);
  }

  return created;
}

async function getExistingMemoryFingerprints() {
  const fingerprints = new Set();
  const candidates = await readCandidateMemories(200);
  for (const candidate of candidates) {
    fingerprints.add(normalizeMemoryFingerprint(candidate.content));
  }
  for (const target of DURABLE_MEMORY_TARGETS) {
    for (const item of readMarkdownItems(target.filePath)) {
      fingerprints.add(normalizeMemoryFingerprint(stripPromotedMemoryPrefix(item)));
    }
  }
  return fingerprints;
}

function listRecentSessionFiles(days = AUTO_MEMORY_WINDOW_DAYS, limit = 80) {
  if (!fs.existsSync(SESSION_DIR)) return [];
  const cutoff = Date.now() - (Math.max(1, Number(days) || AUTO_MEMORY_WINDOW_DAYS) * 24 * 60 * 60 * 1000);
  return fs
    .readdirSync(SESSION_DIR)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const filePath = path.join(SESSION_DIR, name);
      const stats = fs.statSync(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => entry.mtimeMs >= cutoff)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.filePath);
}

async function autoExtractCandidateMemories({ days = AUTO_MEMORY_WINDOW_DAYS, limitSessions = 40 } = {}) {
  await ensureMemuLocalDb();
  const files = listRecentSessionFiles(days, limitSessions);
  const fingerprints = await getExistingMemoryFingerprints();
  const created = [];
  let scannedMessages = 0;
  let duplicates = 0;
  let skippedNoise = 0;

  for (const filePath of files) {
    const lines = fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/g)
      .filter(Boolean);

    for (const line of lines) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record?.type !== "message" || record?.message?.role !== "user") continue;
      scannedMessages += 1;

      const sourceText = extractTextFromMessageContent(record.message.content);
      const cleanedText = cleanSessionMessage(sourceText);
      if (!cleanedText || isNoiseSegment(cleanedText)) {
        skippedNoise += 1;
        continue;
      }

      const suggestions = extractCandidatesFromText(cleanedText);
      if (suggestions.length === 0) {
        skippedNoise += 1;
        continue;
      }

      for (const suggestion of suggestions) {
        const fingerprint = normalizeMemoryFingerprint(suggestion.content);
        if (fingerprints.has(fingerprint)) {
          duplicates += 1;
          continue;
        }
        const stored = await rememberCandidate(suggestion.content, {
          type: suggestion.type,
          source: "auto_extract",
          suggested_target: suggestion.target,
          confidence: suggestion.confidence,
          rule_id: suggestion.ruleId,
          session_file: path.basename(filePath),
          message_id: record.id || null,
          timestamp: record.timestamp || null,
        });
        fingerprints.add(fingerprint);
        created.push(stored);
      }
    }
  }

  const stats = {
    version: AUTO_MEMORY_VERSION,
    window_days: days,
    scanned_sessions: files.length,
    scanned_messages: scannedMessages,
    created_count: created.length,
    duplicate_count: duplicates,
    skipped_noise: skippedNoise,
    created_preview: created.slice(0, 8).map((item) => item.content),
  };

  writeAutoMemoryState({
    last_run_at: new Date().toISOString(),
    last_stats: stats,
  });

  return {
    ...stats,
    created_items: created,
  };
}

function appendPromotedMemory(targetId, content, metadata = {}) {
  const target = DURABLE_MEMORY_TARGETS.find((item) => item.id === targetId);
  if (!target) {
    throw new Error(`未知的长期记忆目标: ${targetId}`);
  }

  const normalizedContent = normalizeInlineText(content);
  if (!normalizedContent) {
    throw new Error("记忆内容不能为空");
  }

  fs.mkdirSync(path.dirname(target.filePath), { recursive: true });
  let fileContent = fs.existsSync(target.filePath) ? fs.readFileSync(target.filePath, "utf8").trimEnd() : "";
  const metadataLabel =
    metadata && typeof metadata === "object" && metadata.type
      ? ` [${normalizeInlineText(metadata.type)}]`
      : "";
  const bulletLine = `- ${new Date().toISOString().slice(0, 10)}${metadataLabel}: ${normalizedContent}`;

  if (fileContent.includes(bulletLine)) {
    return { target, created: false, line: bulletLine };
  }

  if (!fileContent.includes(PROMOTED_NOTES_HEADER)) {
    fileContent = fileContent
      ? `${fileContent}\n\n${PROMOTED_NOTES_HEADER}\n\n${bulletLine}\n`
      : `${PROMOTED_NOTES_HEADER}\n\n${bulletLine}\n`;
  } else {
    fileContent = `${fileContent}\n${bulletLine}\n`;
  }

  fs.writeFileSync(target.filePath, fileContent, "utf8");
  return { target, created: true, line: bulletLine };
}

async function rememberCandidate(content, metadata = {}) {
  const normalizedContent = normalizeInlineText(content);
  if (!normalizedContent) {
    throw new Error("候选记忆不能为空");
  }

  await ensureMemuLocalDb();
  const id = crypto.randomBytes(8).toString("hex");
  const now = new Date().toISOString();
  const nextMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const sql = `insert into memories (id, content, metadata, embedding, created_at, updated_at)
    values (
      ${sqlString(id)},
      ${sqlString(normalizedContent)},
      ${sqlString(JSON.stringify(nextMetadata))},
      null,
      ${sqlString(now)},
      ${sqlString(now)}
    );`;
  await runCommand("sqlite3", [MEMU_LOCAL_DB, sql], 10000);
  return {
    id,
    content: normalizedContent,
    metadata: nextMetadata,
    created_at: now,
    updated_at: now,
  };
}

async function deleteCandidateMemory(memoryId) {
  if (!fs.existsSync(MEMU_LOCAL_DB)) {
    return "候选记忆库不存在";
  }
  await runCommand("sqlite3", [MEMU_LOCAL_DB, `delete from memories where id = ${sqlString(memoryId)};`], 10000);
  return "候选记忆已删除";
}

async function promoteMemoryCandidate(memoryId, targetId) {
  const candidate = await getCandidateMemoryById(memoryId);
  if (!candidate) {
    throw new Error("未找到候选记忆");
  }

  const promotion = appendPromotedMemory(targetId, candidate.content, candidate.metadata);
  await deleteCandidateMemory(memoryId);
  return {
    success: true,
    message: `已晋升到${promotion.target.label}`,
    target_id: promotion.target.id,
    target_label: promotion.target.label,
    created: promotion.created,
  };
}

async function getMemoryOverview() {
  const candidates = await readCandidateMemories();
  const candidateCount = await getCandidateCount();
  const autoState = readAutoMemoryState();
  const memoryAudit = refreshMemoryAudit();
  const auditSummary = memoryAudit.summary || createMemoryAuditSummary();
  const lastRunAt = autoState.last_run_at || null;
  const autoRunDue = !lastRunAt || Date.now() - new Date(lastRunAt).getTime() >= AUTO_MEMORY_AUTO_RUN_INTERVAL_MS;
  const durableRawTexts = [];
  const durableTargets = DURABLE_MEMORY_TARGETS.map((target) => {
    const preview = readMarkdownPreview(target.filePath);
    const items = readMarkdownItems(target.filePath);
    durableRawTexts.push(items.join("\n"));
    return {
      id: target.id,
      label: target.label,
      description: target.description,
      file_path: target.filePath,
      file_label: target.fileLabel,
      item_count: preview.itemCount,
      preview_items: preview.previewItems,
      last_updated: preview.lastUpdated,
    };
  });

  const lastStats = autoState.last_stats || null;
  const durableItemCount = durableTargets.reduce((sum, target) => sum + target.item_count, 0);
  const durableBytes = DURABLE_MEMORY_TARGETS.reduce((sum, target) => sum + readFileSizeSafe(target.filePath), 0);
  const durableTokenEstimate = durableRawTexts.reduce((sum, text) => sum + estimateTokensFromText(text), 0);
  const candidateTokenEstimate = candidates.reduce((sum, item) => sum + estimateTokensFromText(item.content), 0);
  const recentSessions = readRecentVisibleSessions(12);
  const averageContextTokens =
    recentSessions.length > 0
      ? Math.round(
          recentSessions.reduce((sum, item) => sum + (Number.isFinite(item.contextTokens) ? item.contextTokens : 0), 0) /
            recentSessions.length
        )
      : 0;
  const extractionYield =
    lastStats && lastStats.scanned_messages > 0
      ? Number((lastStats.created_count / lastStats.scanned_messages).toFixed(4))
      : null;
  const duplicateRate =
    lastStats && lastStats.scanned_messages > 0
      ? Number((lastStats.duplicate_count / lastStats.scanned_messages).toFixed(4))
      : null;
  const freshnessCoverage =
    lastStats && lastStats.scanned_messages > 0
      ? Number(
          ((lastStats.created_count + lastStats.duplicate_count) / lastStats.scanned_messages).toFixed(4)
        )
      : null;
  const candidateToDurableRatio =
    durableItemCount > 0 ? Number((candidateCount / durableItemCount).toFixed(2)) : candidateCount > 0 ? null : 0;
  const durableContextShare =
    averageContextTokens > 0 ? Number((durableTokenEstimate / averageContextTokens).toFixed(4)) : null;
  const candidateContextShare =
    averageContextTokens > 0 ? Number((candidateTokenEstimate / averageContextTokens).toFixed(4)) : null;
  const promptInjectionRate =
    auditSummary.prompt_events > 0 && recentSessions.length > 0
      ? Number((Math.min(auditSummary.prompt_events, recentSessions.length) / recentSessions.length).toFixed(4))
      : null;
  const relatedHitRate =
    auditSummary.processed_user_messages > 0
      ? Number((auditSummary.related_hit_messages / auditSummary.processed_user_messages).toFixed(4))
      : null;
  const appliedHitRate =
    auditSummary.related_hit_messages > 0
      ? Number((auditSummary.applied_hit_messages / auditSummary.related_hit_messages).toFixed(4))
      : null;
  const averagePromptInjectionTokens =
    auditSummary.prompt_events > 0
      ? Math.round(auditSummary.workspace_prompt_token_total / auditSummary.prompt_events)
      : null;
  const averageMemoryIndexTokens =
    auditSummary.memory_index_events > 0
      ? Math.round(auditSummary.memory_index_token_total / auditSummary.memory_index_events)
      : null;
  const averageTargetedTokens =
    auditSummary.related_hit_messages > 0
      ? Math.round(auditSummary.targeted_token_total / auditSummary.related_hit_messages)
      : null;
  const potentialTokenSavedAverage =
    auditSummary.related_hit_messages > 0
      ? Math.round(auditSummary.potential_saved_token_total / auditSummary.related_hit_messages)
      : null;

  return {
    memu_available: fs.existsSync(MEMU_LOCAL_DB),
    candidate_count: candidateCount,
    candidate_memories: candidates,
    durable_targets: durableTargets,
    strategy: {
      title: "候选池 -> 长期记忆",
      summary: "先进入候选池，再手动晋升到长期记忆文件，避免把临时信息写成永久偏好。",
      notes: [
        "候选池适合临时事实、重复出现但还没确认稳定的信息。",
        "长期记忆只写稳定偏好、身份信息和协作规则。",
        "系统基线文件由脚本生成，不直接手改。",
      ],
    },
    extractor: {
      version: AUTO_MEMORY_VERSION,
      last_run_at: lastRunAt,
      auto_run_due: autoRunDue,
      window_days: AUTO_MEMORY_WINDOW_DAYS,
      last_stats: lastStats,
    },
    efficiency: {
      summary: "真实注入来自 OpenClaw 的 systemPromptReport；相关命中来自本地 sidecar 审计；token 节省目前展示的是按需注入的潜在空间。",
      metrics: {
        extraction_yield: extractionYield,
        duplicate_rate: duplicateRate,
        freshness_coverage: freshnessCoverage,
        candidate_to_durable_ratio: candidateToDurableRatio,
        durable_item_count: durableItemCount,
        durable_bytes: durableBytes,
        durable_token_estimate: durableTokenEstimate,
        candidate_token_estimate: candidateTokenEstimate,
        average_context_tokens: averageContextTokens || null,
        durable_context_share: durableContextShare,
        candidate_context_share: candidateContextShare,
      },
      audit: {
        last_refreshed_at: memoryAudit.last_refreshed_at || null,
        metrics: {
          prompt_events: auditSummary.prompt_events,
          memory_index_events: auditSummary.memory_index_events,
          prompt_injection_rate: promptInjectionRate,
          average_prompt_injection_tokens: averagePromptInjectionTokens,
          average_memory_index_tokens: averageMemoryIndexTokens,
          processed_user_messages: auditSummary.processed_user_messages,
          related_hit_messages: auditSummary.related_hit_messages,
          related_hit_rate: relatedHitRate,
          applied_hit_rate: appliedHitRate,
          average_targeted_tokens: averageTargetedTokens,
          potential_token_saved_average: potentialTokenSavedAverage,
        },
        notes: {
          injection: "真实注入事件来自 OpenClaw 会话索引里的 systemPromptReport，不是页面估算。",
          related_hits: "相关命中表示“最近消息与长期记忆条目出现了明确相关性”，不是直接读取模型内部隐状态。",
          potential_savings: "潜在节省 = 如果未来改成按需注入，只加载命中的记忆条目，理论上可省掉的 prompt token。",
        },
        recent_events: memoryAudit.recent_events || [],
      },
    },
  };
}

function compareVersions(a, b) {
  const ap = String(a || "").split(".").map((x) => Number(x) || 0);
  const bp = String(b || "").split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(ap.length, bp.length); i += 1) {
    const diff = (ap[i] || 0) - (bp[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseElapsedToSeconds(value) {
  if (!value) return null;
  const input = String(value).trim();
  const [dayPart, timePart] = input.includes("-") ? input.split("-") : [null, input];
  const parts = timePart.split(":").map((piece) => Number(piece) || 0);
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  if (dayPart) {
    seconds += (Number(dayPart) || 0) * 86400;
  }
  return seconds;
}

async function commandExists(cmd) {
  try {
    await runShell(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

async function getVersion(cmd, args) {
  try {
    const output = await runCommand(cmd, args);
    return output || null;
  } catch {
    return null;
  }
}

function parseMajor(version) {
  if (!version) return 0;
  return Number(String(version).replace(/^v/i, "").split(".")[0]) || 0;
}

async function getSetupStatus() {
  const nodeVersion = await getVersion("node", ["--version"]);
  const openclawVersion = await getVersion(OPENCLAW_BIN, ["--version"]);
  return {
    node_installed: Boolean(nodeVersion),
    node_version: nodeVersion,
    node_version_ok: parseMajor(nodeVersion) >= 22,
    openclaw_installed: Boolean(openclawVersion),
    openclaw_version: openclawVersion,
    config_dir_exists: fs.existsSync(OPENCLAW_DIR),
    ready: Boolean(openclawVersion) && parseMajor(nodeVersion) >= 22,
    os: process.platform === "darwin" ? "macos" : process.platform,
  };
}

async function installNode() {
  if (process.platform !== "darwin") {
    throw new Error("当前仅支持 macOS 自动安装，请手动安装 Node.js 22+");
  }
  await runShell(
    "command -v brew >/dev/null 2>&1 || /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"",
    20 * 60 * 1000
  );
  await runShell("brew install node@22 && brew link --overwrite --force node@22 || true", 20 * 60 * 1000);
  return {
    success: true,
    message: "Node.js 安装成功",
    error: null,
  };
}

async function installOpenClaw() {
  await runShell("npm install -g openclaw@latest --unsafe-perm", 20 * 60 * 1000);
  return {
    success: true,
    message: "OpenClaw 安装成功",
    error: null,
  };
}

async function initOpenClawConfig() {
  fs.mkdirSync(path.join(OPENCLAW_DIR, "agents", "main", "sessions"), { recursive: true });
  fs.mkdirSync(path.join(OPENCLAW_DIR, "agents", "main", "agent"), { recursive: true });
  fs.mkdirSync(path.join(OPENCLAW_DIR, "credentials"), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (process.platform !== "win32") {
    await runShell(`chmod 700 "${OPENCLAW_DIR}"`);
  }
  await runCommand(OPENCLAW_BIN, ["config", "set", "gateway.mode", "local"], 30000);
  return {
    success: true,
    message: "配置初始化成功",
    error: null,
  };
}

async function openInstallTerminal(installType) {
  if (process.platform !== "darwin") {
    return "请手动安装依赖";
  }
  const script =
    installType === "nodejs"
      ? `#!/bin/bash\nclear\necho "Node.js 安装向导"\ncommand -v brew >/dev/null 2>&1 || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\nbrew install node@22\nbrew link --overwrite --force node@22 || true\necho ""\nnode --version\nread -p "按回车关闭..."\n`
      : `#!/bin/bash\nclear\necho "OpenClaw 安装向导"\nnpm install -g openclaw@latest --unsafe-perm\nopenclaw --version\nread -p "按回车关闭..."\n`;
  const scriptPath = `/tmp/openclaw_${installType}.command`;
  fs.writeFileSync(scriptPath, script, "utf8");
  await runCommand("chmod", ["+x", scriptPath]);
  spawn("open", [scriptPath], { detached: true, stdio: "ignore" }).unref();
  return "已打开安装终端";
}

async function getServicePid() {
  try {
    const output = await runCommand("lsof", ["-nP", `-iTCP:${GATEWAY_PORT}`, "-sTCP:LISTEN", "-t"]);
    const pid = Number(String(output).split(/\r?\n/)[0].trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function getServiceStatus() {
  const pid = await getServicePid();
  const status = {
    running: Boolean(pid),
    pid,
    port: GATEWAY_PORT,
    uptime_seconds: null,
    memory_mb: null,
    cpu_percent: null,
  };
  if (!pid) return status;
  try {
    const output = await runCommand("ps", ["-p", String(pid), "-o", "etime=", "-o", "rss=", "-o", "pcpu="]);
    const [etime, rssRaw, cpuRaw] = output
      .split(/\r?\n/)
      .join(" ")
      .trim()
      .split(/\s+/);
    const rss = Number(rssRaw);
    const cpu = Number(cpuRaw);
    status.uptime_seconds = parseElapsedToSeconds(etime);
    status.memory_mb = Number.isFinite(rss) ? Number((rss / 1024).toFixed(1)) : null;
    status.cpu_percent = Number.isFinite(cpu) ? cpu : null;
  } catch {
    // noop
  }
  return status;
}

async function waitForPort(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pid = await getServicePid();
    if (pid) return pid;
    await sleep(1000);
  }
  return null;
}

function setAlertMaintenance(reason, durationMs = ALERT_MAINTENANCE_WINDOW_MS) {
  alertRuntime.paused_reason = reason || null;
  alertRuntime.maintenance_until = durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : null;
}

function clearAlertMaintenance() {
  alertRuntime.paused_reason = null;
  alertRuntime.maintenance_until = null;
}

function resetAlertIncident() {
  alertRuntime.consecutive_down_polls = 0;
  alertRuntime.incident_active = false;
  alertRuntime.incident_started_at = null;
  alertRuntime.restart_attempted = false;
}

async function startServiceCore() {
  const currentPid = await getServicePid();
  if (currentPid) return `服务已启动，PID: ${currentPid}`;

  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (process.platform === "darwin" && fs.existsSync(GATEWAY_PLIST)) {
    const uid = process.getuid();
    try {
      await runShell(`launchctl kickstart -k gui/${uid}/${GATEWAY_LABEL}`, 15000);
    } catch {
      await runShell(`launchctl bootstrap gui/${uid} "${GATEWAY_PLIST}" || true`, 15000);
      await runShell(`launchctl kickstart -k gui/${uid}/${GATEWAY_LABEL}`, 15000);
    }
  } else {
    const outFd = fs.openSync(path.join(LOG_DIR, "gateway.log"), "a");
    const errFd = fs.openSync(path.join(LOG_DIR, "gateway.err.log"), "a");
    const child = spawn(OPENCLAW_BIN, ["gateway", "--port", String(GATEWAY_PORT)], {
      detached: true,
      stdio: ["ignore", outFd, errFd],
      env: { ...getExtendedEnv(), OPENCLAW_GATEWAY_TOKEN: getOrCreateGatewayToken() },
    });
    child.unref();
  }

  const pid = await waitForPort();
  if (!pid) throw new Error("服务启动超时");
  return `服务已启动，PID: ${pid}`;
}

async function stopServiceCore() {
  const pid = await getServicePid();
  if (!pid) return "服务未在运行";

  if (process.platform === "darwin" && fs.existsSync(GATEWAY_PLIST)) {
    const uid = process.getuid();
    try {
      await runShell(`launchctl bootout gui/${uid} "${GATEWAY_PLIST}"`, 15000);
    } catch {
      // fallback to kill
    }
  }

  const afterBootout = await getServicePid();
  if (afterBootout) {
    try {
      await runCommand("kill", ["-TERM", String(afterBootout)]);
      await sleep(1500);
    } catch {
      // noop
    }
  }
  const afterTerm = await getServicePid();
  if (afterTerm) {
    await runCommand("kill", ["-9", String(afterTerm)]);
  }
  return "服务已停止";
}

async function restartServiceCore() {
  await stopServiceCore();
  await sleep(1000);
  return startServiceCore();
}

async function startService(options = {}) {
  try {
    const message = await startServiceCore();
    alertRuntime.expected_running = true;
    alertRuntime.service_running = true;
    alertRuntime.last_poll_error = null;
    resetAlertIncident();
    if (options.resumeMonitoring !== false) {
      clearAlertMaintenance();
    }
    persistAlertRuntime();
    return message;
  } catch (error) {
    alertRuntime.last_poll_error = error.message;
    persistAlertRuntime();
    throw error;
  }
}

async function stopService(options = {}) {
  const shouldPause = options.pauseMonitoring !== false;
  if (shouldPause) {
    setAlertMaintenance("manual_stop", 0);
  }
  try {
    const message = await stopServiceCore();
    alertRuntime.expected_running = false;
    alertRuntime.service_running = false;
    alertRuntime.service_pid = null;
    resetAlertIncident();
    alertRuntime.cooldown_until = null;
    persistAlertRuntime();
    return message;
  } catch (error) {
    if (shouldPause) {
      clearAlertMaintenance();
    }
    alertRuntime.last_poll_error = error.message;
    persistAlertRuntime();
    throw error;
  }
}

async function restartService(options = {}) {
  const source = options.source || "manual_action";
  if (source === "manual_action") {
    setAlertMaintenance("manual_restart", ALERT_MAINTENANCE_WINDOW_MS);
  }

  try {
    const message = await restartServiceCore();
    alertRuntime.expected_running = true;
    alertRuntime.service_running = true;
    alertRuntime.last_poll_error = null;
    resetAlertIncident();
    alertRuntime.cooldown_until = null;
    persistAlertRuntime();
    await appendAlertEvent({
      type: "restart_succeeded",
      source,
      message: source === "manual_action" ? "手动重启成功" : "检测到异常后自动重启成功",
    });
    return message;
  } catch (error) {
    alertRuntime.expected_running = true;
    alertRuntime.service_running = false;
    alertRuntime.last_poll_error = error.message;
    persistAlertRuntime();
    await appendAlertEvent({
      type: "restart_failed",
      source,
      message: source === "manual_action" ? `手动重启失败: ${error.message}` : `自动重启失败: ${error.message}`,
    });
    throw error;
  } finally {
    if (source === "manual_action") {
      clearAlertMaintenance();
      persistAlertRuntime();
    }
  }
}

async function getLogs(lines = 100) {
  const files = [path.join(LOG_DIR, "gateway.log"), path.join(LOG_DIR, "gateway.err.log")];
  const all = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const output = await runCommand("tail", ["-n", String(lines), file]);
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => all.push(line));
    } catch {
      // noop
    }
  }
  return all.slice(-lines);
}

function isAlertCooldownActive(now = Date.now()) {
  return Boolean(alertRuntime.cooldown_until && Date.parse(alertRuntime.cooldown_until) > now);
}

function isAlertMonitoringPaused(now = Date.now()) {
  if (alertRuntime.paused_reason === "manual_stop") return true;
  if (!alertRuntime.maintenance_until) return false;
  return Date.parse(alertRuntime.maintenance_until) > now;
}

async function handleRecoveredEvent(message = "服务已恢复上线") {
  if (!alertRuntime.incident_active) return;
  await appendAlertEvent({
    type: "recovered",
    source: "detector",
    message,
  });
  resetAlertIncident();
  alertRuntime.cooldown_until = null;
}

async function runAutoRestart(settings) {
  if (alertRuntime.restart_in_flight) return;

  alertRuntime.restart_in_flight = true;
  alertRuntime.restart_attempted = true;
  alertRuntime.cooldown_until = new Date(Date.now() + settings.cooldown_seconds * 1000).toISOString();
  persistAlertRuntime();

  try {
    await restartService({ source: "auto_restart" });
    const status = await getServiceStatus();
    alertRuntime.service_running = status.running;
    alertRuntime.service_pid = status.pid;
    if (status.running) {
      alertRuntime.expected_running = true;
      await handleRecoveredEvent("服务自动重启后已恢复上线");
    }
  } finally {
    alertRuntime.restart_in_flight = false;
    persistAlertRuntime();
  }
}

async function monitorAlertState() {
  if (alertRuntime.poll_in_flight) return;

  alertRuntime.poll_in_flight = true;
  alertRuntime.monitor_active = true;

  try {
    const settingsPayload = await getAlertSettings();
    const settings = settingsPayload.settings;
    const now = Date.now();
    const status = await getServiceStatus();

    alertRuntime.last_poll_at = new Date(now).toISOString();
    alertRuntime.last_poll_error = null;
    alertRuntime.service_running = status.running;
    alertRuntime.service_pid = status.pid;
    alertRuntime.issues = settingsPayload.issues;

    if (!alertRuntime.bootstrapped) {
      alertRuntime.bootstrapped = true;
      alertRuntime.expected_running = status.running;
      persistAlertRuntime();
      return;
    }

    if (!settings.enabled) {
      if (status.running) {
        alertRuntime.expected_running = true;
      }
      persistAlertRuntime();
      return;
    }

    if (alertRuntime.incident_active && alertRuntime.restart_attempted && !isAlertCooldownActive(now)) {
      resetAlertIncident();
      persistAlertRuntime();
      return;
    }

    if (alertRuntime.paused_reason === "manual_stop" && status.running) {
      clearAlertMaintenance();
      alertRuntime.expected_running = true;
    }

    if (isAlertMonitoringPaused(now)) {
      persistAlertRuntime();
      return;
    }

    if (status.running) {
      alertRuntime.expected_running = true;
      await handleRecoveredEvent();
      persistAlertRuntime();
      return;
    }

    if (!alertRuntime.expected_running) {
      resetAlertIncident();
      persistAlertRuntime();
      return;
    }

    alertRuntime.consecutive_down_polls += 1;
    if (alertRuntime.consecutive_down_polls < settings.confirm_down_polls) {
      persistAlertRuntime();
      return;
    }

    if (!alertRuntime.incident_active) {
      alertRuntime.incident_active = true;
      alertRuntime.incident_started_at = new Date(now).toISOString();
      await appendAlertEvent({
        type: "down",
        source: "detector",
        message: settings.auto_restart ? "服务异常下线，准备尝试自动重启" : "服务异常下线，请手动检查",
      });
    }

    if (settings.auto_restart && !alertRuntime.restart_attempted && !isAlertCooldownActive(now)) {
      await runAutoRestart(settings);
      return;
    }

    persistAlertRuntime();
  } catch (error) {
    alertRuntime.last_poll_error = error.message;
    persistAlertRuntime();
  } finally {
    alertRuntime.poll_in_flight = false;
    persistAlertRuntime();
  }
}

async function bootstrapAlertMonitor() {
  try {
    const status = await getServiceStatus();
    alertRuntime.bootstrapped = true;
    alertRuntime.monitor_active = true;
    alertRuntime.service_running = status.running;
    alertRuntime.service_pid = status.pid;
    alertRuntime.expected_running = status.running;
    alertRuntime.last_poll_at = new Date().toISOString();
    const settingsPayload = await getAlertSettings();
    alertRuntime.issues = settingsPayload.issues;
    persistAlertRuntime();
  } catch (error) {
    alertRuntime.monitor_active = true;
    alertRuntime.last_poll_error = error.message;
    persistAlertRuntime();
  }
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getOrCreateGatewayToken() {
  const config = readConfig();
  const existing = resolveSecretInputValue(config?.gateway?.auth?.token);
  if (existing) return existing;
  const env = readEnvMap();
  if (env.OPENCLAW_GATEWAY_TOKEN) return env.OPENCLAW_GATEWAY_TOKEN;
  const token = generateToken();
  ensureObject(config, ["gateway", "auth"]);
  config.gateway.auth.token = "${OPENCLAW_GATEWAY_TOKEN}";
  config.gateway.auth.mode = "token";
  config.gateway.mode = "local";
  setEnvValue("OPENCLAW_GATEWAY_TOKEN", token);
  writeConfig(config);
  return token;
}

function getAIConfig() {
  const config = readConfig();
  const env = readEnvMap();
  const primary = config?.agents?.defaults?.model?.primary || null;
  const available = Object.keys(config?.agents?.defaults?.models || {});
  const providers = Object.entries(config?.models?.providers || {}).map(([providerName, providerConfig]) => {
    const models = Array.isArray(providerConfig.models)
      ? providerConfig.models.map((model) => ({
          full_id: `${providerName}/${model.id}`,
          id: model.id,
          name: model.name || model.id,
          api_type: model.api || null,
          context_window: model.contextWindow || null,
          max_tokens: model.maxTokens || null,
          is_primary: primary === `${providerName}/${model.id}`,
        }))
      : [];

    return {
      name: providerName,
      base_url: providerConfig.baseUrl || "",
      api_key_masked: maskValue(resolveSecretInputValue(providerConfig.apiKey || "", env) || providerConfig.apiKey || ""),
      has_api_key: Boolean(resolveSecretInputValue(providerConfig.apiKey || "", env) || providerConfig.apiKey),
      models,
    };
  });

  return {
    primary_model: primary,
    configured_providers: providers,
    available_models: available,
  };
}

function saveProvider(args) {
  const { providerName, baseUrl, apiKey, apiType, models } = args;
  const config = readConfig();
  ensureObject(config, ["models", "providers"]);
  ensureObject(config, ["agents", "defaults", "models"]);

  const previousKey = config?.models?.providers?.[providerName]?.apiKey;
  const providerModels = (models || []).map((model) => {
    const next = {
      id: model.id,
      name: model.name,
      api: model.api || apiType,
      input: Array.isArray(model.input) && model.input.length > 0 ? model.input : ["text"],
      cost: model.cost || {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    };
    if (model.context_window) next.contextWindow = model.context_window;
    if (model.max_tokens) next.maxTokens = model.max_tokens;
    if (model.reasoning !== null && model.reasoning !== undefined) next.reasoning = model.reasoning;
    return next;
  });

  config.models.providers[providerName] = {
    baseUrl,
    models: providerModels,
    ...(apiKey ? { apiKey } : previousKey ? { apiKey: previousKey } : {}),
  };

  for (const model of models || []) {
    config.agents.defaults.models[`${providerName}/${model.id}`] = {};
  }

  ensureObject(config, ["meta"]);
  config.meta.lastTouchedAt = new Date().toISOString();
  writeConfig(config);
  return `Provider ${providerName} 已保存`;
}

function deleteProvider(providerName) {
  const config = readConfig();
  if (config?.models?.providers) {
    delete config.models.providers[providerName];
  }
  const modelBucket = config?.agents?.defaults?.models || {};
  for (const key of Object.keys(modelBucket)) {
    if (key.startsWith(`${providerName}/`)) {
      delete modelBucket[key];
    }
  }
  if (config?.agents?.defaults?.model?.primary?.startsWith(`${providerName}/`)) {
    config.agents.defaults.model.primary = null;
  }
  writeConfig(config);
  return `Provider ${providerName} 已删除`;
}

function setPrimaryModel(modelId) {
  const config = readConfig();
  ensureObject(config, ["agents", "defaults", "model"]);
  config.agents.defaults.model.primary = modelId;
  writeConfig(config);
  return `主模型已设置为 ${modelId}`;
}

function addAvailableModel(modelId) {
  const config = readConfig();
  ensureObject(config, ["agents", "defaults", "models"]);
  config.agents.defaults.models[modelId] = {};
  writeConfig(config);
  return `模型 ${modelId} 已添加`;
}

function removeAvailableModel(modelId) {
  const config = readConfig();
  if (config?.agents?.defaults?.models) {
    delete config.agents.defaults.models[modelId];
  }
  writeConfig(config);
  return `模型 ${modelId} 已移除`;
}

function getChannelsConfig() {
  const config = readConfig();
  const env = readEnvMap();
  const channels = config.channels || {};
  const channelTypes = [
    ["telegram", "telegram", ["userId"]],
    ["discord", "discord", ["testChannelId"]],
    ["slack", "slack", ["testChannelId"]],
    ["feishu", "feishu", ["testChatId"]],
    ["whatsapp", "whatsapp", []],
    ["imessage", "imessage", []],
    ["wechat", "wechat", []],
    ["dingtalk", "dingtalk", []],
  ];

  return channelTypes.map(([channelId, channelType, testFields]) => {
    const raw = channels[channelId] || {};
    const mapped = Object.fromEntries(
      Object.entries(raw).filter(([key]) => key !== "enabled")
    );
    for (const field of testFields) {
      const envKey = `OPENCLAW_${channelId.toUpperCase()}_${field.toUpperCase()}`;
      if (env[envKey]) mapped[field] = env[envKey];
    }
    const enabled = Object.keys(mapped).length > 0 || raw.enabled === true;
    return {
      id: channelId,
      channel_type: channelType,
      enabled,
      config: mapped,
    };
  });
}

async function getChannelsOverview() {
  const channels = getChannelsConfig();
  let statusPayload = null;
  let statusAvailable = false;
  let statusError = null;

  try {
    const output = await runCommand(OPENCLAW_BIN, ["channels", "status", "--json"], 20000);
    statusPayload = JSON.parse(output);
    statusAvailable = true;
  } catch (error) {
    statusError = error.message;
  }

  const statusChannels = statusPayload?.channels || {};
  const channelAccounts = statusPayload?.channelAccounts || {};
  const channelOrder = Array.isArray(statusPayload?.channelOrder) ? statusPayload.channelOrder : [];

  const items = channels.map((channel) => {
    const statusItem = statusChannels[channel.id] || {};
    const accounts = Array.isArray(channelAccounts[channel.id]) ? channelAccounts[channel.id] : [];
    const runningAccountCount = accounts.filter((item) => item?.running === true).length;
    const configured = Boolean(channel.enabled || statusItem.configured);
    const running = Boolean(statusItem.running || runningAccountCount > 0);

    return {
      id: channel.id,
      channel_type: channel.channel_type,
      configured,
      running,
      account_count: accounts.length,
      running_account_count: runningAccountCount,
      mode: typeof statusItem.mode === "string" ? statusItem.mode : null,
      last_error: typeof statusItem.lastError === "string" ? statusItem.lastError : null,
    };
  });

  const configuredCount = items.filter((item) => item.configured).length;
  const runningCount = items.filter((item) => item.running).length;
  const recommendedFocusChannel =
    items.find((item) => item.running)?.id ||
    items.find((item) => item.configured)?.id ||
    null;

  return {
    channels: items,
    configured_count: configuredCount,
    running_count: runningCount,
    coexistence_enabled: configuredCount > 1,
    recommended_focus_channel: recommendedFocusChannel,
    channel_order: channelOrder,
    status_available: statusAvailable,
    status_error: statusError,
  };
}

async function getAlertChannelCandidates() {
  const overview = await getChannelsOverview().catch(() => null);
  const channelMap = new Map(getChannelsConfig().map((item) => [item.id, item]));
  const statusMap = new Map((overview?.channels || []).map((item) => [item.id, item]));

  return Object.values(ALERT_CHANNEL_SCHEMAS)
    .map((schema) => {
      const configItem = channelMap.get(schema.id);
      const statusItem = statusMap.get(schema.id);
      const configured = Boolean(configItem?.enabled || statusItem?.configured);
      const running = Boolean(statusItem?.running);
      if (!configured) return null;

      let defaultTarget = normalizeAlertTarget(configItem?.config?.[schema.target_field] || "");
      if (!defaultTarget && schema.id === "telegram") {
        const allowFrom = Array.isArray(configItem?.config?.allowFrom) ? configItem.config.allowFrom : [];
        const groupAllowFrom = Array.isArray(configItem?.config?.groupAllowFrom)
          ? configItem.config.groupAllowFrom
          : [];
        defaultTarget = normalizeAlertTarget(allowFrom[0] || groupAllowFrom[0] || "");
      }

      return {
        ...schema,
        configured,
        running,
        default_target: defaultTarget,
      };
    })
    .filter(Boolean);
}

async function getAlertSettings() {
  const channelCandidates = await getAlertChannelCandidates();
  const settings = normalizeAlertSettings(readManagerConfigRaw(), channelCandidates);
  return {
    settings,
    available_channels: channelCandidates,
    issues: validateAlertSettings(settings, channelCandidates),
    config_path: MANAGER_CONFIG_FILE,
  };
}

async function sendChannelAlertMessage(channelType, target, message) {
  await runCommand(
    OPENCLAW_BIN,
    ["message", "send", "--channel", channelType, "--target", target, "--message", message, "--json"],
    30000
  );
}

function buildFeishuWebhookRequest(channel, message) {
  const payload = {
    msg_type: "text",
    content: {
      text: message,
    },
  };

  if (channel.secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${channel.secret}`;
    payload.timestamp = timestamp;
    payload.sign = crypto.createHmac("sha256", stringToSign).update("").digest("base64");
  }

  return {
    url: channel.webhook_url,
    payload,
  };
}

function buildDingtalkWebhookRequest(channel, message) {
  const payload = {
    msgtype: "text",
    text: {
      content: message,
    },
  };
  const nextUrl = new URL(channel.webhook_url);

  if (channel.secret) {
    const timestamp = Date.now().toString();
    const stringToSign = `${timestamp}\n${channel.secret}`;
    const sign = crypto.createHmac("sha256", channel.secret).update(stringToSign).digest("base64");
    nextUrl.searchParams.set("timestamp", timestamp);
    nextUrl.searchParams.set("sign", sign);
  }

  return {
    url: nextUrl.toString(),
    payload,
  };
}

async function sendWebhookNotification(channel, message) {
  if (!channel?.supported) {
    return { status: "skipped_unsupported", error: "unsupported channel", channel_id: channel?.id || null };
  }
  if (!channel?.enabled) {
    return { status: "disabled", error: "channel disabled", channel_id: channel.id };
  }
  if (!channel?.configured || !channel?.webhook_url) {
    return { status: "skipped_missing_webhook", error: "missing webhook", channel_id: channel.id };
  }

  const request =
    channel.id === "feishu"
      ? buildFeishuWebhookRequest(channel, message)
      : channel.id === "dingtalk"
      ? buildDingtalkWebhookRequest(channel, message)
      : null;

  if (!request) {
    return { status: "skipped_unsupported", error: "unsupported channel", channel_id: channel.id };
  }

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request.payload),
    });
    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${truncateText(rawText || response.statusText, 180)}`);
    }

    if (channel.id === "feishu" && payload && Number(payload.code || 0) !== 0) {
      throw new Error(payload.msg || `Feishu webhook error: ${payload.code}`);
    }

    if (channel.id === "dingtalk" && payload && Number(payload.errcode || 0) !== 0) {
      throw new Error(payload.errmsg || `DingTalk webhook error: ${payload.errcode}`);
    }

    return {
      status: "sent",
      error: null,
      channel_id: channel.id,
      channel_name: channel.name || channel.label,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message,
      channel_id: channel.id,
      channel_name: channel.name || channel.label,
    };
  }
}

async function sendManagerNotification(channelId, message) {
  const channel = getManagerNotificationChannels().find((item) => item.id === channelId) || null;
  if (!channel) {
    return { status: "skipped_missing_channel", error: "missing channel", channel_id: null };
  }
  return sendWebhookNotification(channel, message);
}

function formatAlertMessage(event) {
  const timestamp = new Date(event.timestamp).toLocaleString("zh-CN", { hour12: false });
  const typeLabel =
    event.type === "down"
      ? "服务异常下线"
      : event.type === "recovered"
      ? "服务恢复上线"
      : event.type === "restart_succeeded"
      ? "服务重启成功"
      : "服务重启失败";

  return [
    "OpenClaw 状态通知",
    "",
    `事件: ${typeLabel}`,
    `时间: ${timestamp}`,
    `来源: ${event.source}`,
    "",
    event.message,
  ].join("\n");
}

async function deliverAlertEvent(event, settings, options = {}) {
  const effectiveSettings = settings || normalizeAlertSettings(readManagerConfigRaw(), []);
  if (!options.force && effectiveSettings.enabled !== true) {
    return { status: "disabled", error: null, channel_type: null, target: null };
  }
  if (!options.force && !effectiveSettings.enabled_events.includes(event.type)) {
    return { status: "disabled_event", error: null, channel_type: null, target: null };
  }
  if (!effectiveSettings.channel_type) {
    return { status: "skipped_missing_channel", error: "missing channel", channel_type: null, target: null };
  }
  if (!effectiveSettings.target) {
    return {
      status: "skipped_missing_target",
      error: "missing target",
      channel_type: effectiveSettings.channel_type,
      target: null,
    };
  }

  try {
    await sendChannelAlertMessage(
      effectiveSettings.channel_type,
      effectiveSettings.target,
      options.message || formatAlertMessage(event)
    );
    return {
      status: "sent",
      error: null,
      channel_type: effectiveSettings.channel_type,
      target: effectiveSettings.target,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message,
      channel_type: effectiveSettings.channel_type,
      target: effectiveSettings.target,
    };
  }
}

async function appendAlertEvent(eventInput, options = {}) {
  const timestamp = new Date().toISOString();
  const event = {
    id: crypto.randomUUID(),
    timestamp,
    type: eventInput.type,
    source: eventInput.source || "detector",
    message: truncateText(eventInput.message || ""),
    delivery_status: "pending",
    delivery_detail: null,
  };

  const settingsPayload = await getAlertSettings();
  const delivery = await deliverAlertEvent(event, settingsPayload.settings, options);
  event.delivery_status = delivery.status;
  event.delivery_detail = delivery;
  appendJsonLine(ALERT_EVENTS_FILE, event);
  alertRuntime.last_event = event;
  alertRuntime.issues = settingsPayload.issues;
  persistAlertRuntime();
  return event;
}

async function saveAlertSettings(input = {}) {
  const channelCandidates = await getAlertChannelCandidates();
  const settings = normalizeAlertSettings(input, channelCandidates);
  updateManagerConfig((current) => ({
    ...current,
    ...settings,
  }));
  alertRuntime.issues = validateAlertSettings(settings, channelCandidates);
  persistAlertRuntime();
  return {
    settings,
    available_channels: channelCandidates,
    issues: alertRuntime.issues,
    config_path: MANAGER_CONFIG_FILE,
  };
}

async function sendTestAlert(input = {}) {
  const channelCandidates = await getAlertChannelCandidates();
  const effectiveSettings = normalizeAlertSettings(
    {
      ...readManagerConfigRaw(),
      ...input,
    },
    channelCandidates
  );

  const message = [
    "OpenClaw 状态通知测试",
    "",
    `时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    "这是一条测试消息，用于验证告警渠道是否可达。",
  ].join("\n");

  const delivery = await deliverAlertEvent(
    {
      type: "restart_succeeded",
      source: "manual_action",
      timestamp: new Date().toISOString(),
      message: "状态通知测试",
    },
    effectiveSettings,
    { force: true, message }
  );

  return {
    success: delivery.status === "sent",
    message: delivery.status === "sent" ? "测试通知已发送" : "测试通知未发送",
    delivery_status: delivery.status,
    delivery_detail: delivery,
  };
}

function toOptionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOptionalString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatChineseDateTime(value) {
  const dateValue =
    typeof value === "number" && Number.isFinite(value)
      ? new Date(value)
      : value instanceof Date
      ? value
      : new Date();
  return dateValue.toLocaleString("zh-CN", { hour12: false });
}

function normalizeUsageWindow(window) {
  return {
    label: String(window?.label || ""),
    used_percent: Math.max(0, Math.min(100, Number(window?.usedPercent || 0))),
    reset_at: toOptionalNumber(window?.resetAt),
  };
}

function normalizeProviderUsage(item) {
  return {
    provider: String(item?.provider || ""),
    display_name: String(item?.displayName || item?.provider || "未知 Provider"),
    plan: toOptionalString(item?.plan),
    error: toOptionalString(item?.error),
    windows: Array.isArray(item?.windows) ? item.windows.map(normalizeUsageWindow) : [],
  };
}

function normalizeSessionUsage(session) {
  return {
    key: String(session?.key || ""),
    updated_at: Number(session?.updatedAt || 0),
    age_ms: toOptionalNumber(session?.ageMs),
    input_tokens: toOptionalNumber(session?.inputTokens),
    output_tokens: toOptionalNumber(session?.outputTokens),
    total_tokens: toOptionalNumber(session?.totalTokens),
    context_tokens: toOptionalNumber(session?.contextTokens),
    model: toOptionalString(session?.model),
    model_provider: toOptionalString(session?.modelProvider),
    kind: toOptionalString(session?.kind),
  };
}

async function getUsageOverview() {
  const [channelListResult, sessionsResult] = await Promise.allSettled([
    runCommand(OPENCLAW_BIN, ["channels", "list", "--json"], 20000),
    runCommand(OPENCLAW_BIN, ["sessions", "--json"], 20000),
  ]);

  let updatedAt = null;
  let providers = [];
  let sessions = [];

  if (channelListResult.status === "fulfilled") {
    const payload = JSON.parse(channelListResult.value);
    const usage = payload?.usage || {};
    updatedAt = toOptionalNumber(usage.updatedAt);
    providers = Array.isArray(usage.providers) ? usage.providers.map(normalizeProviderUsage) : [];
  }

  if (sessionsResult.status === "fulfilled") {
    const payload = JSON.parse(sessionsResult.value);
    sessions = Array.isArray(payload?.sessions)
      ? payload.sessions
          .filter((session) => typeof session?.key === "string" && !session.key.includes(":run:"))
          .map(normalizeSessionUsage)
          .sort((left, right) => right.updated_at - left.updated_at)
      : [];
  }

  if (channelListResult.status === "rejected" && sessionsResult.status === "rejected") {
    throw new Error(
      `获取使用情况失败: ${channelListResult.reason?.message || channelListResult.reason || "unknown"}`
    );
  }

  return {
    updated_at: updatedAt,
    providers,
    sessions,
    total_sessions: sessions.length,
    total_token_estimate: sessions.reduce((sum, item) => sum + (item.total_tokens || 0), 0),
  };
}

function normalizeCronJob(job) {
  return {
    id: String(job?.id || ""),
    agent_id: toOptionalString(job?.agentId),
    name: String(job?.name || "未命名任务"),
    description: toOptionalString(job?.description),
    enabled: job?.enabled !== false,
    schedule: {
      kind: String(job?.schedule?.kind || "cron"),
      expr: toOptionalString(job?.schedule?.expr),
      every: toOptionalString(job?.schedule?.every),
      at: toOptionalString(job?.schedule?.at),
      tz: toOptionalString(job?.schedule?.tz),
    },
    payload: {
      kind: String(job?.payload?.kind || "agentTurn"),
      message: toOptionalString(job?.payload?.message),
      text: toOptionalString(job?.payload?.text),
      model: toOptionalString(job?.payload?.model),
    },
    session_target: toOptionalString(job?.sessionTarget),
    wake_mode: toOptionalString(job?.wakeMode),
    state: {
      next_run_at_ms: toOptionalNumber(job?.state?.nextRunAtMs),
      last_run_at_ms: toOptionalNumber(job?.state?.lastRunAtMs),
      last_status: toOptionalString(job?.state?.lastStatus),
      last_run_status: toOptionalString(job?.state?.lastRunStatus),
      last_duration_ms: toOptionalNumber(job?.state?.lastDurationMs),
      last_error: toOptionalString(job?.state?.lastError),
      consecutive_errors: Number(job?.state?.consecutiveErrors || 0),
    },
    delivery: {
      mode: toOptionalString(job?.delivery?.mode),
      channel: toOptionalString(job?.delivery?.channel),
      to: toOptionalString(job?.delivery?.to),
      account_id: toOptionalString(job?.delivery?.accountId),
    },
    created_at_ms: toOptionalNumber(job?.createdAtMs),
    updated_at_ms: toOptionalNumber(job?.updatedAtMs),
  };
}

function getCronNotificationChannelOptions() {
  return getManagerNotificationChannels().map((channel) => ({
    id: channel.id,
    label: channel.label,
    name: channel.name,
    description: channel.description,
    enabled: channel.enabled,
    configured: channel.configured,
    supported: channel.supported,
  }));
}

function persistCronNotificationState(extra = {}) {
  const snapshot = {
    ...cronNotificationRuntime,
    ...extra,
    observed_jobs:
      extra?.observed_jobs && typeof extra.observed_jobs === "object"
        ? extra.observed_jobs
        : cronNotificationRuntime.observed_jobs,
  };
  writeJsonFile(CRON_NOTIFICATION_STATE_FILE, snapshot);
  return snapshot;
}

function loadCronNotificationState() {
  const saved = readJsonFile(CRON_NOTIFICATION_STATE_FILE, {});
  cronNotificationRuntime.monitor_active = saved?.monitor_active === true;
  cronNotificationRuntime.bootstrapped = saved?.bootstrapped === true;
  cronNotificationRuntime.last_poll_at = toOptionalString(saved?.last_poll_at);
  cronNotificationRuntime.last_poll_error = toOptionalString(saved?.last_poll_error);
  cronNotificationRuntime.last_event =
    saved?.last_event && typeof saved.last_event === "object" ? saved.last_event : null;
  cronNotificationRuntime.issues = Array.isArray(saved?.issues) ? saved.issues : [];
  cronNotificationRuntime.observed_jobs =
    saved?.observed_jobs && typeof saved.observed_jobs === "object" ? saved.observed_jobs : {};
}

function buildCronNotificationView(jobId, channels) {
  const bindingsRaw = getCronNotificationBindingsRaw();
  const binding = normalizeCronNotificationBinding(bindingsRaw[jobId] || {}, channels);
  const channel = channels.find((item) => item.id === binding.channel_id) || null;
  const runtimeState = cronNotificationRuntime.observed_jobs?.[jobId] || {};

  return {
    enabled: binding.enabled,
    channel_id: binding.channel_id,
    channel_label: channel?.name || channel?.label || null,
    channel_enabled: channel?.enabled === true,
    channel_configured: channel?.configured === true,
    notify_on: binding.notify_on,
    last_delivery_at: toOptionalString(runtimeState?.last_delivery_at),
    last_delivery_status: toOptionalString(runtimeState?.last_delivery_status),
    last_delivery_error: toOptionalString(runtimeState?.last_delivery_error),
  };
}

function formatCronNotificationMessage(job, outcome) {
  const timestamp = formatChineseDateTime(job?.state?.last_run_at_ms || Date.now());
  const statusLabel = outcome === "failure" ? "执行失败" : "执行成功";
  const contentPreview = truncateText(job?.payload?.message || job?.payload?.text || "无任务内容", 140);
  const errorText = job?.state?.last_error ? truncateText(job.state.last_error, 240) : null;

  return [
    "OpenClaw 定时任务通知",
    "",
    `任务: ${job?.name || "未命名任务"}`,
    `结果: ${statusLabel}`,
    `时间: ${timestamp}`,
    `模型: ${job?.payload?.model || "默认模型"}`,
    `会话: ${job?.session_target || "main"}`,
    "",
    `任务内容: ${contentPreview}`,
    ...(errorText ? ["", `错误信息: ${errorText}`] : []),
  ].join("\n");
}

function getCronNotificationOutcome(job) {
  const status = String(job?.state?.last_status || job?.state?.last_run_status || "").toLowerCase();
  if (status === "ok" || status === "success") return "success";
  if (status === "error" || status === "failed" || status === "failure") return "failure";
  return null;
}

async function appendCronNotificationEvent(eventInput) {
  const event = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    job_id: String(eventInput.job_id || ""),
    job_name: String(eventInput.job_name || "未命名任务"),
    outcome: eventInput.outcome === "failure" ? "failure" : "success",
    message: truncateText(eventInput.message || ""),
    delivery_status: String(eventInput.delivery_status || "unknown"),
    delivery_detail:
      eventInput.delivery_detail && typeof eventInput.delivery_detail === "object"
        ? eventInput.delivery_detail
        : null,
  };
  appendJsonLine(CRON_NOTIFICATION_EVENTS_FILE, event);
  cronNotificationRuntime.last_event = event;
  persistCronNotificationState();
  return event;
}

async function deliverCronJobNotification(job, binding, channels) {
  const channel = channels.find((item) => item.id === binding.channel_id) || null;
  if (!binding.enabled) {
    return { status: "disabled", error: null, channel_id: null };
  }
  if (!channel) {
    return { status: "skipped_missing_channel", error: "missing channel", channel_id: null };
  }
  const outcome = getCronNotificationOutcome(job);
  if (!outcome || !binding.notify_on.includes(outcome)) {
    return { status: "skipped_event", error: null, channel_id: channel.id };
  }

  const delivery = await sendWebhookNotification(channel, formatCronNotificationMessage(job, outcome));
  await appendCronNotificationEvent({
    job_id: job.id,
    job_name: job.name,
    outcome,
    message: `${job.name} ${outcome === "failure" ? "执行失败" : "执行成功"}`,
    delivery_status: delivery.status,
    delivery_detail: delivery,
  });
  return delivery;
}

async function monitorCronNotifications() {
  if (cronNotificationRuntime.poll_in_flight) return;

  cronNotificationRuntime.poll_in_flight = true;
  cronNotificationRuntime.monitor_active = true;

  try {
    const overview = await getCronOverviewBase();
    const channels = getManagerNotificationChannels();
    const bindingsRaw = getCronNotificationBindingsRaw();
    const nextObservedJobs = { ...cronNotificationRuntime.observed_jobs };
    const liveJobIds = new Set();

    cronNotificationRuntime.last_poll_at = new Date().toISOString();
    cronNotificationRuntime.last_poll_error = null;
    cronNotificationRuntime.issues = validateManagerNotificationChannels(channels);

    for (const job of overview.jobs) {
      liveJobIds.add(job.id);
      const binding = normalizeCronNotificationBinding(bindingsRaw[job.id] || {}, channels);
      const previous = nextObservedJobs[job.id] || {};
      const lastRunAtMs = toOptionalNumber(job?.state?.last_run_at_ms);
      const lastStatus = toOptionalString(job?.state?.last_status || job?.state?.last_run_status);

      if (!cronNotificationRuntime.bootstrapped || !previous.initialized) {
        nextObservedJobs[job.id] = {
          ...previous,
          initialized: true,
          last_seen_run_at_ms: lastRunAtMs,
          last_seen_status: lastStatus,
        };
        continue;
      }

      const hasNewRun =
        typeof lastRunAtMs === "number" &&
        Number.isFinite(lastRunAtMs) &&
        (typeof previous.last_seen_run_at_ms !== "number" ||
          lastRunAtMs > previous.last_seen_run_at_ms ||
          (lastRunAtMs === previous.last_seen_run_at_ms && lastStatus && lastStatus !== previous.last_seen_status));

      if (hasNewRun) {
        const delivery = await deliverCronJobNotification(job, binding, channels);
        nextObservedJobs[job.id] = {
          ...previous,
          initialized: true,
          last_seen_run_at_ms: lastRunAtMs,
          last_seen_status: lastStatus,
          last_delivery_at:
            delivery.status === "sent" || delivery.status === "failed" ? new Date().toISOString() : previous.last_delivery_at || null,
          last_delivery_status: delivery.status,
          last_delivery_error: delivery.error || null,
        };
      } else {
        nextObservedJobs[job.id] = {
          ...previous,
          initialized: true,
          last_seen_run_at_ms: typeof lastRunAtMs === "number" ? lastRunAtMs : previous.last_seen_run_at_ms || null,
          last_seen_status: lastStatus || previous.last_seen_status || null,
        };
      }
    }

    for (const jobId of Object.keys(nextObservedJobs)) {
      if (!liveJobIds.has(jobId)) {
        delete nextObservedJobs[jobId];
      }
    }

    cronNotificationRuntime.observed_jobs = nextObservedJobs;
    cronNotificationRuntime.bootstrapped = true;
    persistCronNotificationState();
  } catch (error) {
    cronNotificationRuntime.last_poll_error = error.message;
    persistCronNotificationState();
  } finally {
    cronNotificationRuntime.poll_in_flight = false;
  }
}

async function bootstrapCronNotificationMonitor() {
  loadCronNotificationState();
  cronNotificationRuntime.monitor_active = true;
  await monitorCronNotifications();
}

async function getCronOverviewBase() {
  const [statusResult, listResult] = await Promise.allSettled([
    runCommand(OPENCLAW_BIN, ["cron", "status", "--json"], 20000),
    runCommand(OPENCLAW_BIN, ["cron", "list", "--json"], 20000),
  ]);

  let scheduler = null;
  let jobs = [];

  if (statusResult.status === "fulfilled") {
    const payload = JSON.parse(statusResult.value);
    scheduler = {
      enabled: payload?.enabled !== false,
      store_path: toOptionalString(payload?.storePath),
      jobs: Number(payload?.jobs || 0),
      next_wake_at_ms: toOptionalNumber(payload?.nextWakeAtMs),
    };
  }

  if (listResult.status === "fulfilled") {
    const payload = JSON.parse(listResult.value);
    jobs = Array.isArray(payload?.jobs) ? payload.jobs.map(normalizeCronJob) : [];
  }

  if (statusResult.status === "rejected" && listResult.status === "rejected") {
    throw new Error(
      `获取定时任务失败: ${statusResult.reason?.message || statusResult.reason || "unknown"}`
    );
  }

  return {
    scheduler,
    jobs,
  };
}

async function getCronOverview() {
  const overview = await getCronOverviewBase();
  const channels = getManagerNotificationChannels();

  return {
    ...overview,
    notification_channels: getCronNotificationChannelOptions(),
    jobs: overview.jobs.map((job) => ({
      ...job,
      notification: buildCronNotificationView(job.id, channels),
    })),
  };
}

function addFlagWithValue(args, flag, value) {
  const normalized = String(value || "").trim();
  if (!normalized) return;
  args.push(flag, normalized);
}

function clearCronJobModelOverride(jobId) {
  const payload = readJsonFile(CRON_JOBS_FILE, null);
  if (!payload || !Array.isArray(payload.jobs)) {
    return false;
  }

  let changed = false;
  payload.jobs = payload.jobs.map((job) => {
    if (String(job?.id || "") !== String(jobId)) {
      return job;
    }
    if (!job?.payload || typeof job.payload !== "object" || !Object.prototype.hasOwnProperty.call(job.payload, "model")) {
      return job;
    }

    const nextPayload = { ...job.payload };
    delete nextPayload.model;
    changed = true;
    return {
      ...job,
      payload: nextPayload,
      updatedAtMs: Date.now(),
    };
  });

  if (changed) {
    writeJsonFile(CRON_JOBS_FILE, payload);
  }

  return changed;
}

function buildCronArgs(input, isEdit = false) {
  const name = String(input?.name || "").trim();
  const message = String(input?.message || "").trim();
  const scheduleType = String(input?.scheduleType || "").trim();
  const scheduleValue = String(input?.scheduleValue || "").trim();
  const payloadKind = String(input?.payloadKind || "").trim();

  if (!name) {
    throw new Error("请填写任务名称");
  }
  if (!scheduleValue) {
    throw new Error("请填写触发时间");
  }
  if (!["cron", "every", "at"].includes(scheduleType)) {
    throw new Error("不支持的调度类型");
  }
  if (!["agentTurn", "systemEvent"].includes(payloadKind)) {
    throw new Error("不支持的任务载荷类型");
  }
  if (!message) {
    throw new Error(payloadKind === "systemEvent" ? "请填写系统事件内容" : "请填写任务消息");
  }

  const args = [];
  addFlagWithValue(args, "--name", name);
  addFlagWithValue(args, "--description", input?.description);

  if (scheduleType === "cron") {
    addFlagWithValue(args, "--cron", scheduleValue);
    addFlagWithValue(args, "--tz", input?.timezone);
  } else if (scheduleType === "every") {
    addFlagWithValue(args, "--every", scheduleValue);
  } else {
    addFlagWithValue(args, "--at", scheduleValue);
  }

  if (payloadKind === "agentTurn") {
    addFlagWithValue(args, "--message", message);
    addFlagWithValue(args, "--model", input?.model);
  } else {
    addFlagWithValue(args, "--system-event", message);
  }

  addFlagWithValue(args, "--session", input?.sessionTarget);
  addFlagWithValue(args, "--wake", input?.wakeMode);

  if (input?.announce) {
    args.push("--announce");
  } else {
    args.push("--no-deliver");
  }

  addFlagWithValue(args, "--channel", input?.channel);
  addFlagWithValue(args, "--to", input?.to);
  addFlagWithValue(args, "--account", input?.accountId);

  if (isEdit) {
    args.push(input?.enabled === false ? "--disable" : "--enable");
  } else if (input?.enabled === false) {
    args.push("--disabled");
  }

  return args;
}

async function createCronJob(input) {
  const beforeOverview = await getCronOverviewBase().catch(() => ({ jobs: [] }));
  const beforeIds = new Set((beforeOverview.jobs || []).map((job) => job.id));
  const args = ["cron", "add", "--json", ...buildCronArgs(input)];
  const output = await runCommand(OPENCLAW_BIN, args, 30000);

  let jobId = null;
  try {
    const payload = JSON.parse(output);
    jobId =
      toOptionalString(payload?.job?.id) ||
      toOptionalString(payload?.id) ||
      toOptionalString(payload?.jobId) ||
      null;
  } catch {
    jobId = null;
  }

  if (!jobId) {
    const afterOverview = await getCronOverviewBase().catch(() => ({ jobs: [] }));
    const createdJob =
      (afterOverview.jobs || []).find((job) => !beforeIds.has(job.id)) ||
      [...(afterOverview.jobs || [])].sort((left, right) => (right.created_at_ms || 0) - (left.created_at_ms || 0))[0] ||
      null;
    jobId = createdJob?.id || null;
  }

  if (jobId) {
    saveCronNotificationBinding(jobId, input);
  }

  return "定时任务已创建";
}

async function updateCronJob(input) {
  const jobId = String(input?.id || "").trim();
  if (!jobId) {
    throw new Error("缺少任务 ID");
  }
  const args = ["cron", "edit", jobId, ...buildCronArgs(input, true)];
  await runCommand(OPENCLAW_BIN, args, 30000);
  if (String(input?.payloadKind || "").trim() === "agentTurn" && !String(input?.model || "").trim()) {
    clearCronJobModelOverride(jobId);
  }
  saveCronNotificationBinding(jobId, input);
  return "定时任务已更新";
}

async function enableCronJob(jobId) {
  await runCommand(OPENCLAW_BIN, ["cron", "enable", String(jobId)], 20000);
  return "定时任务已启用";
}

async function disableCronJob(jobId) {
  await runCommand(OPENCLAW_BIN, ["cron", "disable", String(jobId)], 20000);
  return "定时任务已停用";
}

async function runCronJob(jobId) {
  await runCommand(OPENCLAW_BIN, ["cron", "run", String(jobId)], 45000);
  return "定时任务已手动触发";
}

async function removeCronJob(jobId) {
  await runCommand(OPENCLAW_BIN, ["cron", "rm", String(jobId)], 20000);
  removeCronNotificationBinding(String(jobId));
  if (cronNotificationRuntime.observed_jobs?.[jobId]) {
    delete cronNotificationRuntime.observed_jobs[jobId];
    persistCronNotificationState();
  }
  return "定时任务已删除";
}

function saveChannelConfig(channel) {
  const config = readConfig();
  const env = readEnvMap();
  ensureObject(config, ["channels"]);
  ensureObject(config, ["plugins", "entries"]);
  if (!Array.isArray(config.plugins.allow)) config.plugins.allow = [];

  const nextConfig = { enabled: true };
  for (const [key, value] of Object.entries(channel.config || {})) {
    if (TEST_CHANNEL_FIELDS.has(key)) {
      env[`OPENCLAW_${channel.id.toUpperCase()}_${key.toUpperCase()}`] = String(value);
    } else {
      nextConfig[key] = value;
    }
  }

  config.channels[channel.id] = nextConfig;
  if (!config.plugins.allow.includes(channel.id)) {
    config.plugins.allow.push(channel.id);
  }
  config.plugins.entries[channel.id] = { enabled: true };

  writeConfig(config);
  writeEnvMap(env);
  return `${channel.channel_type} 配置已保存`;
}

function clearChannelConfig(channelId) {
  const config = readConfig();
  const env = readEnvMap();
  if (config.channels) delete config.channels[channelId];
  if (Array.isArray(config?.plugins?.allow)) {
    config.plugins.allow = config.plugins.allow.filter((value) => value !== channelId);
  }
  if (config?.plugins?.entries) delete config.plugins.entries[channelId];
  delete env[`OPENCLAW_${channelId.toUpperCase()}_USERID`];
  delete env[`OPENCLAW_${channelId.toUpperCase()}_TESTCHATID`];
  delete env[`OPENCLAW_${channelId.toUpperCase()}_TESTCHANNELID`];
  writeConfig(config);
  writeEnvMap(env);
  return `${channelId} 配置已清空`;
}

async function checkFeishuPlugin() {
  try {
    const output = await runCommand(OPENCLAW_BIN, ["plugins", "list"]);
    const line = output
      .split(/\r?\n/)
      .find((value) => value.toLowerCase().includes("feishu"));
    if (!line) {
      return { installed: false, version: null, plugin_name: null };
    }
    const version = line.includes("@") ? line.split("@").pop().trim() : null;
    return { installed: true, version, plugin_name: line.trim() };
  } catch {
    return { installed: false, version: null, plugin_name: null };
  }
}

async function installFeishuPlugin() {
  await runCommand(OPENCLAW_BIN, ["plugins", "install", "@m1heng-clawd/feishu"], 10 * 60 * 1000);
  return "飞书插件安装成功";
}

async function runDoctor() {
  const nodeVersion = await getVersion("node", ["--version"]);
  const openclawVersion = await getVersion(OPENCLAW_BIN, ["--version"]);
  const results = [
    {
      name: "OpenClaw 安装",
      passed: Boolean(openclawVersion),
      message: openclawVersion ? `OpenClaw 已安装: ${openclawVersion}` : "OpenClaw 未安装",
      suggestion: openclawVersion ? null : "运行: npm install -g openclaw",
    },
    {
      name: "Node.js",
      passed: parseMajor(nodeVersion) >= 22,
      message: nodeVersion || "未安装",
      suggestion: parseMajor(nodeVersion) >= 22 ? null : "请安装 Node.js 22+",
    },
    {
      name: "配置文件",
      passed: fs.existsSync(CONFIG_FILE),
      message: fs.existsSync(CONFIG_FILE) ? `配置文件存在: ${CONFIG_FILE}` : "配置文件不存在",
      suggestion: fs.existsSync(CONFIG_FILE) ? null : "运行初始化配置",
    },
    {
      name: "环境变量",
      passed: fs.existsSync(DOTENV_FILE) || fs.existsSync(LEGACY_ENV_FILE),
      message:
        fs.existsSync(DOTENV_FILE) || fs.existsSync(LEGACY_ENV_FILE)
          ? `环境变量文件存在: ${fs.existsSync(DOTENV_FILE) ? DOTENV_FILE : LEGACY_ENV_FILE}`
          : "环境变量文件不存在",
      suggestion: fs.existsSync(DOTENV_FILE) || fs.existsSync(LEGACY_ENV_FILE) ? null : "请配置 AI API Key",
    },
  ];
  try {
    const doctorOutput = await runCommand(OPENCLAW_BIN, ["doctor"], 30000);
    results.push({
      name: "OpenClaw Doctor",
      passed: !String(doctorOutput).toLowerCase().includes("invalid"),
      message: doctorOutput || "doctor 已执行",
      suggestion: null,
    });
  } catch (error) {
    results.push({
      name: "OpenClaw Doctor",
      passed: false,
      message: error.message,
      suggestion: null,
    });
  }
  return results;
}

async function testAIConnection() {
  const started = Date.now();
  try {
    const output = await runCommand(
      OPENCLAW_BIN,
      ["agent", "--local", "--to", "+1234567890", "--message", "回复 OK"],
      45000
    );
    const success = !/error|401|403/i.test(output);
    return {
      success,
      provider: "current",
      model: "default",
      response: success ? output : null,
      error: success ? null : output,
      latency_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      success: false,
      provider: "current",
      model: "default",
      response: null,
      error: error.message,
      latency_ms: Date.now() - started,
    };
  }
}

async function testChannel(channelType) {
  try {
    const payload = JSON.parse(await runCommand(OPENCLAW_BIN, ["channels", "status", "--json"], 20000));
    const item = payload.channels?.[channelType] || null;
    if (!item || !item.configured) {
      return {
        success: false,
        channel: channelType,
        message: `${channelType} 未连接`,
        error: "渠道未配置",
      };
    }
    return {
      success: true,
      channel: channelType,
      message: `${channelType} 状态正常`,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      channel: channelType,
      message: "测试失败",
      error: error.message,
    };
  }
}

async function getSystemInfo() {
  const osName =
    process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
      ? "windows"
      : "linux";
  let osVersion = "unknown";
  if (process.platform === "darwin") {
    osVersion = (await getVersion("sw_vers", ["-productVersion"])) || "unknown";
  }
  return {
    os: osName,
    os_version: osVersion,
    arch: os.arch(),
    openclaw_installed: Boolean(await getVersion(OPENCLAW_BIN, ["--version"])),
    openclaw_version: await getVersion(OPENCLAW_BIN, ["--version"]),
    node_version: await getVersion("node", ["--version"]),
    config_dir: OPENCLAW_DIR,
  };
}

async function startChannelLogin(channelType) {
  if (channelType !== "whatsapp") {
    return `${channelType} 暂不支持网页登录引导`;
  }
  const scriptPath = "/tmp/openclaw_whatsapp_login.command";
  const script = `#!/bin/bash\nclear\necho "WhatsApp 登录向导"\nopenclaw channels login --channel whatsapp --verbose\nread -p "按回车关闭..."\n`;
  fs.writeFileSync(scriptPath, script, "utf8");
  await runCommand("chmod", ["+x", scriptPath]);
  spawn("open", [scriptPath], { detached: true, stdio: "ignore" }).unref();
  return "已打开 WhatsApp 登录终端";
}

async function checkOpenClawUpdate() {
  const currentVersion = await getVersion(OPENCLAW_BIN, ["--version"]);
  const latestVersion = await getVersion("npm", ["view", "openclaw", "version"]);
  return {
    update_available: Boolean(currentVersion && latestVersion && compareVersions(latestVersion, currentVersion) > 0),
    current_version: currentVersion,
    latest_version: latestVersion,
    error: null,
  };
}

async function updateOpenClaw() {
  await runShell("npm install -g openclaw@latest --unsafe-perm", 20 * 60 * 1000);
  return {
    success: true,
    message: "OpenClaw 更新成功",
    error: null,
  };
}

async function uninstallOpenClaw() {
  await runShell("npm uninstall -g openclaw", 10 * 60 * 1000);
  return {
    success: true,
    message: "OpenClaw 已卸载",
    error: null,
  };
}

function scoreDashboardSession(session) {
  const key = String(session?.key || "");
  let score = 0;

  if (/^agent:[^:]+:main$/.test(key)) score += 120;
  if (session?.kind === "direct") score += 40;
  if (!key.includes(":cron:")) score += 30;
  if (/(telegram|whatsapp|discord|slack|feishu|imessage)/.test(key)) score -= 10;

  return score;
}

async function getPreferredDashboardSessionKey() {
  try {
    const payload = JSON.parse(await runCommand(OPENCLAW_BIN, ["sessions", "--json"], 20000));
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    const preferred = [...sessions]
      .filter((item) => typeof item?.key === "string" && item.key)
      .sort((left, right) => {
        const scoreDiff = scoreDashboardSession(right) - scoreDashboardSession(left);
        if (scoreDiff !== 0) return scoreDiff;
        return Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0);
      })[0];

    return preferred?.key || "agent:main:main";
  } catch {
    return "agent:main:main";
  }
}

async function getDashboardUrl() {
  const token = getOrCreateGatewayToken();
  const sessionKey = await getPreferredDashboardSessionKey();
  const url = new URL(`http://127.0.0.1:${GATEWAY_PORT}/chat`);
  url.searchParams.set("session", sessionKey);
  url.searchParams.set("token", token);
  return url.toString();
}

async function openTarget(target) {
  await runCommand("open", [target], 10000);
}

const handlers = {
  check_environment: () => getSetupStatus(),
  install_nodejs: () => installNode(),
  install_openclaw: () => installOpenClaw(),
  init_openclaw_config: () => initOpenClawConfig(),
  open_install_terminal: ({ installType }) => openInstallTerminal(installType),
  uninstall_openclaw: () => uninstallOpenClaw(),
  check_openclaw_update: () => checkOpenClawUpdate(),
  update_openclaw: () => updateOpenClaw(),

  get_service_status: () => getServiceStatus(),
  start_service: () => startService(),
  stop_service: () => stopService(),
  restart_service: () => restartService(),
  get_logs: ({ lines }) => getLogs(lines || 100),

  check_openclaw_installed: async () => Boolean(await getVersion(OPENCLAW_BIN, ["--version"])),
  get_openclaw_version: () => getVersion(OPENCLAW_BIN, ["--version"]),
  check_port_in_use: async ({ port }) =>
    Boolean(await runCommand("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).catch(() => "")),

  get_config: () => readConfig(),
  save_config: ({ config }) => {
    writeConfig(config || {});
    return "配置已保存";
  },
  get_env_value: ({ key }) => readEnvMap()[key] || null,
  save_env_value: ({ key, value }) => {
    setEnvValue(key, value);
    return "环境变量已保存";
  },

  get_or_create_gateway_token: () => getOrCreateGatewayToken(),
  get_dashboard_url: () => getDashboardUrl(),

  get_official_providers: () => OFFICIAL_PROVIDERS,
  get_ai_providers: () =>
    OFFICIAL_PROVIDERS.map((provider) => ({
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      default_base_url: provider.default_base_url,
      requires_api_key: provider.requires_api_key,
      models: provider.suggested_models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        recommended: model.recommended,
      })),
    })),
  get_ai_config: () => getAIConfig(),
  save_provider: (args) => saveProvider(args),
  delete_provider: ({ providerName }) => deleteProvider(providerName),
  set_primary_model: ({ modelId }) => setPrimaryModel(modelId),
  add_available_model: ({ modelId }) => addAvailableModel(modelId),
  remove_available_model: ({ modelId }) => removeAvailableModel(modelId),

  get_channels_config: () => getChannelsConfig(),
  get_channels_overview: () => getChannelsOverview(),
  save_channel_config: ({ channel }) => saveChannelConfig(channel),
  clear_channel_config: ({ channelId }) => clearChannelConfig(channelId),
  get_alert_settings: () => getAlertSettings(),
  save_alert_settings: ({ settings }) => saveAlertSettings(settings || {}),
  get_alert_events: ({ limit }) => ({
    events: readAlertEvents(limit || ALERT_EVENT_LIMIT),
  }),
  send_test_alert: ({ settings }) => sendTestAlert(settings || {}),
  get_alert_runtime_status: () => getAlertRuntimeStatus(),
  get_notification_channels: () => getManagerNotificationChannelsPayload(),
  save_notification_channels: ({ channels }) => saveManagerNotificationChannels(channels || []),
  send_test_notification_channel: ({ channelId, message }) =>
    sendTestManagerNotification({ channelId, message }),
  get_usage_overview: () => getUsageOverview(),
  get_cron_overview: () => getCronOverview(),
  create_cron_job: ({ input }) => createCronJob(input),
  update_cron_job: ({ input }) => updateCronJob(input),
  enable_cron_job: ({ jobId }) => enableCronJob(jobId),
  disable_cron_job: ({ jobId }) => disableCronJob(jobId),
  run_cron_job: ({ jobId }) => runCronJob(jobId),
  remove_cron_job: ({ jobId }) => removeCronJob(jobId),

  check_feishu_plugin: () => checkFeishuPlugin(),
  install_feishu_plugin: () => installFeishuPlugin(),

  run_doctor: () => runDoctor(),
  test_ai_connection: () => testAIConnection(),
  test_channel: ({ channelType }) => testChannel(channelType),
  get_system_info: () => getSystemInfo(),
  start_channel_login: ({ channelType }) => startChannelLogin(channelType),

  get_memory_overview: () => getMemoryOverview(),
  run_memory_auto_extract: ({ days, limitSessions }) =>
    autoExtractCandidateMemories({ days, limitSessions }),
  remember_candidate: ({ content, metadata }) => rememberCandidate(content, metadata),
  promote_memory_candidate: ({ memoryId, targetId }) => promoteMemoryCandidate(memoryId, targetId),
  delete_memory_candidate: ({ memoryId }) => deleteCandidateMemory(memoryId),
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/invoke" && req.method === "POST") {
      const { cmd, args } = await parseBody(req);
      const handler = handlers[cmd];
      if (!handler) {
        sendJson(res, 404, { error: `unsupported invoke: ${cmd}` });
        return;
      }
      const result = await handler(args || {});
      sendJson(res, 200, { result });
      return;
    }

    if (req.url === "/api/open" && req.method === "POST") {
      const { target } = await parseBody(req);
      if (!target) {
        sendJson(res, 400, { error: "target is required" });
        return;
      }
      await openTarget(target);
      sendJson(res, 200, { ok: true });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OpenClaw bridge running: http://127.0.0.1:${PORT}`);
  void bootstrapAlertMonitor();
  void bootstrapCronNotificationMonitor();
  setInterval(() => {
    void monitorAlertState();
  }, ALERT_MONITOR_INTERVAL_MS);
  setInterval(() => {
    void monitorCronNotifications();
  }, CRON_NOTIFICATION_MONITOR_INTERVAL_MS);
});
