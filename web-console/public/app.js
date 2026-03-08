const el = {
  title: document.getElementById("title"),
  subtitle: document.getElementById("subtitle"),
  navOverview: document.getElementById("navOverview"),
  navModels: document.getElementById("navModels"),
  navKeys: document.getElementById("navKeys"),
  navChannels: document.getElementById("navChannels"),
  langBtn: document.getElementById("langBtn"),
  gatewayLabel: document.getElementById("gatewayLabel"),
  gatewayStatus: document.getElementById("gatewayStatus"),
  refreshBtn: document.getElementById("refreshBtn"),
  modelsTitle: document.getElementById("modelsTitle"),
  countTag: document.getElementById("countTag"),
  modelsContainer: document.getElementById("modelsContainer"),
  keysTitle: document.getElementById("keysTitle"),
  keysContainer: document.getElementById("keysContainer"),
  channelsTitle: document.getElementById("channelsTitle"),
  telegramLabel: document.getElementById("telegramLabel"),
  telegramStatus: document.getElementById("telegramStatus"),
  telegramToken: document.getElementById("telegramToken"),
  saveTelegramBtn: document.getElementById("saveTelegramBtn"),
  removeTelegramBtn: document.getElementById("removeTelegramBtn"),
  msg: document.getElementById("msg"),
  setupOverlay: document.getElementById("setupOverlay"),
  setupTitle: document.getElementById("setupTitle"),
  setupDesc: document.getElementById("setupDesc"),
  setupNodeLabel: document.getElementById("setupNodeLabel"),
  setupNodeState: document.getElementById("setupNodeState"),
  setupClawLabel: document.getElementById("setupClawLabel"),
  setupClawState: document.getElementById("setupClawState"),
  setupInitLabel: document.getElementById("setupInitLabel"),
  setupInitState: document.getElementById("setupInitState"),
  installNodeBtn: document.getElementById("installNodeBtn"),
  installClawBtn: document.getElementById("installClawBtn"),
  initBtn: document.getElementById("initBtn"),
  retrySetupBtn: document.getElementById("retrySetupBtn"),
};

const i18n = {
  zh: {
    title: "🦞 龙虾 OpenClaw Manager 小白版",
    subtitle: "面向非技术用户的本地可视化管理台",
    navOverview: "总览",
    navModels: "模型",
    navKeys: "密钥",
    navChannels: "渠道",
    gatewayLabel: "网关状态",
    gatewayUp: "在线",
    gatewayDown: "离线",
    refresh: "刷新数据",
    modelsTitle: "可用模型",
    modelsCount: (n) => `${n} 个模型`,
    setDefault: "设为默认",
    currentDefault: "当前默认",
    context: (n) => `上下文 ${n || "未知"}`,
    keysTitle: "AI Key 配置",
    save: "保存",
    configured: "已配置",
    notConfigured: "未配置",
    channelsTitle: "渠道配置",
    telegram: "Telegram 机器人",
    saveTelegram: "保存 Telegram",
    removeTelegram: "移除 Telegram",
    tokenPlaceholder: "输入 Telegram Bot Token",
    loading: "处理中...",
    updated: "已更新",
    removed: "已移除",
    failed: "失败",
    setupTitle: "首次安装引导",
    setupDesc: "当前机器未完成环境准备，按顺序执行 1-3 步后即可正常使用。",
    setupNodeLabel: "1. 安装 Node.js 22+",
    setupClawLabel: "2. 安装 OpenClaw",
    setupInitLabel: "3. 初始化本地配置",
    installNode: "安装 Node.js",
    installClaw: "安装 OpenClaw",
    doInit: "执行初始化",
    retryCheck: "重新检测",
    done: "完成",
    pending: "待处理",
  },
  en: {
    title: "🦞 Lobster OpenClaw Manager for Beginners",
    subtitle: "A local visual control panel for non-technical users",
    navOverview: "Overview",
    navModels: "Models",
    navKeys: "Keys",
    navChannels: "Channels",
    gatewayLabel: "Gateway",
    gatewayUp: "Online",
    gatewayDown: "Offline",
    refresh: "Refresh",
    modelsTitle: "Models",
    modelsCount: (n) => `${n} models`,
    setDefault: "Set Default",
    currentDefault: "Current",
    context: (n) => `Context ${n || "unknown"}`,
    keysTitle: "AI Keys",
    save: "Save",
    configured: "Configured",
    notConfigured: "Not configured",
    channelsTitle: "Channels",
    telegram: "Telegram Bot",
    saveTelegram: "Save Telegram",
    removeTelegram: "Remove Telegram",
    tokenPlaceholder: "Paste Telegram Bot Token",
    loading: "Processing...",
    updated: "Updated",
    removed: "Removed",
    failed: "Failed",
    setupTitle: "Setup Wizard",
    setupDesc: "This machine is not ready. Complete step 1-3.",
    setupNodeLabel: "1. Install Node.js 22+",
    setupClawLabel: "2. Install OpenClaw",
    setupInitLabel: "3. Initialize local config",
    installNode: "Install Node.js",
    installClaw: "Install OpenClaw",
    doInit: "Initialize",
    retryCheck: "Check Again",
    done: "Done",
    pending: "Pending",
  },
};

let lang = "zh";
let models = [];
let keys = [];
let channels = {};
let setupStatus = null;

function t(key, ...args) {
  const value = i18n[lang][key];
  return typeof value === "function" ? value(...args) : value;
}

function setMsg(text, isError = false) {
  el.msg.textContent = text;
  el.msg.style.color = isError ? "#ff8b8b" : "#8da5bb";
}

function renderTexts() {
  el.title.textContent = t("title");
  el.subtitle.textContent = t("subtitle");
  el.navOverview.textContent = t("navOverview");
  el.navModels.textContent = t("navModels");
  el.navKeys.textContent = t("navKeys");
  el.navChannels.textContent = t("navChannels");
  el.gatewayLabel.textContent = t("gatewayLabel");
  el.refreshBtn.textContent = t("refresh");
  el.modelsTitle.textContent = t("modelsTitle");
  el.keysTitle.textContent = t("keysTitle");
  el.channelsTitle.textContent = t("channelsTitle");
  el.telegramLabel.textContent = t("telegram");
  el.saveTelegramBtn.textContent = t("saveTelegram");
  el.removeTelegramBtn.textContent = t("removeTelegram");
  el.telegramToken.placeholder = t("tokenPlaceholder");
  el.langBtn.textContent = lang === "zh" ? "EN" : "中文";
  el.setupTitle.textContent = t("setupTitle");
  el.setupDesc.textContent = t("setupDesc");
  el.setupNodeLabel.textContent = t("setupNodeLabel");
  el.setupClawLabel.textContent = t("setupClawLabel");
  el.setupInitLabel.textContent = t("setupInitLabel");
  el.installNodeBtn.textContent = t("installNode");
  el.installClawBtn.textContent = t("installClaw");
  el.initBtn.textContent = t("doInit");
  el.retrySetupBtn.textContent = t("retryCheck");
  el.countTag.textContent = t("modelsCount", models.length);
}

function itemCard(title, meta, buttonText, disabled, onClick) {
  const item = document.createElement("article");
  item.className = "item";
  const ttl = document.createElement("p");
  ttl.className = "item-title";
  ttl.textContent = title;
  const mt = document.createElement("p");
  mt.className = "item-meta";
  mt.textContent = meta;
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.disabled = disabled;
  btn.textContent = buttonText;
  btn.addEventListener("click", onClick);
  item.append(ttl, mt, btn);
  return item;
}

function renderModels() {
  el.modelsContainer.innerHTML = "";
  el.countTag.textContent = t("modelsCount", models.length);
  for (const model of models) {
    const isDefault = (model.tags || []).includes("default");
    el.modelsContainer.appendChild(
      itemCard(
        model.key,
        `${model.input || "text"} · ${t("context", model.contextWindow)}`,
        isDefault ? t("currentDefault") : t("setDefault"),
        isDefault,
        () => setDefaultModel(model.key)
      )
    );
  }
}

function renderKeys() {
  el.keysContainer.innerHTML = "";
  for (const keyCfg of keys) {
    const item = document.createElement("article");
    item.className = "item";
    const ttl = document.createElement("p");
    ttl.className = "item-title";
    ttl.textContent = keyCfg.key;
    const mt = document.createElement("p");
    mt.className = "item-meta";
    mt.textContent = keyCfg.configured ? `${t("configured")} · ${keyCfg.masked}` : t("notConfigured");
    const input = document.createElement("input");
    input.className = "input";
    input.type = "password";
    input.placeholder = keyCfg.key;
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = t("save");
    btn.addEventListener("click", () => saveKey(keyCfg.key, input.value));
    item.append(ttl, mt, input, btn);
    el.keysContainer.appendChild(item);
  }
}

function renderChannels() {
  const telegram = channels.telegram;
  const ok = telegram && telegram.configured;
  el.telegramStatus.textContent = ok ? t("configured") : t("notConfigured");
  el.telegramStatus.style.color = ok ? "#29c67b" : "#ffb75d";
}

function renderSetup() {
  if (!setupStatus || setupStatus.ready) {
    el.setupOverlay.classList.add("hidden");
    return;
  }
  el.setupOverlay.classList.remove("hidden");
  el.setupNodeState.textContent =
    setupStatus.nodeInstalled && setupStatus.nodeVersionOk
      ? `${t("done")} (${setupStatus.nodeVersion || ""})`
      : t("pending");
  el.setupNodeState.style.color =
    setupStatus.nodeInstalled && setupStatus.nodeVersionOk ? "#29c67b" : "#ffb75d";

  el.setupClawState.textContent = setupStatus.openclawInstalled
    ? `${t("done")} (${setupStatus.openclawVersion || ""})`
    : t("pending");
  el.setupClawState.style.color = setupStatus.openclawInstalled ? "#29c67b" : "#ffb75d";

  const canInit = setupStatus.nodeVersionOk && setupStatus.openclawInstalled;
  el.setupInitState.textContent = canInit ? t("pending") : `${t("pending")} (等待前两步)`;
  el.setupInitState.style.color = canInit ? "#ffb75d" : "#8da5bb";

  el.installNodeBtn.disabled = setupStatus.nodeInstalled && setupStatus.nodeVersionOk;
  el.installClawBtn.disabled = !setupStatus.nodeVersionOk || setupStatus.openclawInstalled;
  el.initBtn.disabled = !canInit;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "request failed");
  return data;
}

async function loadSetupStatus() {
  setupStatus = await fetchJson("/api/setup/status");
  renderSetup();
}

async function refreshAll() {
  setMsg(t("loading"));
  try {
    await loadSetupStatus();
    if (!setupStatus.ready) {
      setMsg("");
      return;
    }
    const [health, modelsResp, keysResp, channelsResp] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/models"),
      fetchJson("/api/providers/keys"),
      fetchJson("/api/channels"),
    ]);
    models = modelsResp.models || [];
    keys = keysResp.keys || [];
    channels = channelsResp.channels || {};
    renderTexts();
    renderModels();
    renderKeys();
    renderChannels();
    const online = health && health.ok !== false;
    el.gatewayStatus.textContent = online ? t("gatewayUp") : t("gatewayDown");
    el.gatewayStatus.style.color = online ? "#29c67b" : "#ffb75d";
    setMsg("");
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

async function setDefaultModel(model) {
  setMsg(`${t("loading")} ${model}`);
  try {
    const data = await fetchJson("/api/models/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    models = data.models || [];
    renderModels();
    setMsg(t("updated"));
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

async function saveKey(key, value) {
  const clean = String(value || "").trim();
  if (!clean) return;
  setMsg(`${t("loading")} ${key}`);
  try {
    await fetchJson("/api/providers/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: clean }),
    });
    keys = (await fetchJson("/api/providers/keys")).keys || [];
    renderKeys();
    setMsg(t("updated"));
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

async function saveTelegram() {
  const token = String(el.telegramToken.value || "").trim();
  if (!token) return;
  setMsg(t("loading"));
  try {
    const data = await fetchJson("/api/channels/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    channels = data.channels.channels || channels;
    el.telegramToken.value = "";
    renderChannels();
    setMsg(t("updated"));
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

async function removeTelegram() {
  setMsg(t("loading"));
  try {
    const data = await fetchJson("/api/channels/telegram", { method: "DELETE" });
    channels = data.channels.channels || {};
    renderChannels();
    setMsg(t("removed"));
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

async function runSetupStep(url) {
  setMsg(t("loading"));
  try {
    await fetchJson(url, { method: "POST" });
    await refreshAll();
    setMsg(t("updated"));
  } catch (error) {
    setMsg(`${t("failed")}: ${error.message}`, true);
  }
}

el.langBtn.addEventListener("click", () => {
  lang = lang === "zh" ? "en" : "zh";
  renderTexts();
  renderModels();
  renderKeys();
  renderChannels();
  renderSetup();
});
el.refreshBtn.addEventListener("click", refreshAll);
el.saveTelegramBtn.addEventListener("click", saveTelegram);
el.removeTelegramBtn.addEventListener("click", removeTelegram);
el.installNodeBtn.addEventListener("click", () => runSetupStep("/api/setup/install-node"));
el.installClawBtn.addEventListener("click", () => runSetupStep("/api/setup/install-openclaw"));
el.initBtn.addEventListener("click", () => runSetupStep("/api/setup/init"));
el.retrySetupBtn.addEventListener("click", refreshAll);

renderTexts();
refreshAll();
