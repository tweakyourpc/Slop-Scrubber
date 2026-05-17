const REPO_URL = "https://github.com/tweakyourpc/Slop-Scrubber";
const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve));
const storageRemove = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
let currentDomain = null;
let currentRules = null;
let currentPanel = null;
let refreshTimer = null;

function domainFromUrl(urlString) {
  try {
    return new URL(urlString).hostname;
  } catch {
    return null;
  }
}

function byCountDesc(entries) {
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function truncate(text, max = 60) {
  if (String(text).length <= max) {
    return String(text);
  }
  return `${String(text).slice(0, max - 1)}…`;
}

function relativeTime(timestamp) {
  if (!timestamp) {
    return "Never";
  }
  const delta = Math.max(0, Date.now() - Number(timestamp));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function loadRules() {
  const response = await fetch(chrome.runtime.getURL("config/rules.json"));
  if (!response.ok) {
    throw new Error(`Failed to load rules: ${response.status}`);
  }
  return response.json();
}

function countActiveRules(rules) {
  return (rules.sentinel_words?.length || 0) + Object.keys(rules.regex_patterns || {}).length;
}

function bucketClass(bucket) {
  if (bucket === "High Probability Slop (Block)") {
    return "audit-bucket block";
  }
  if (bucket === "Suspect (Highlight)") {
    return "audit-bucket suspect";
  }
  return "audit-bucket human";
}

function renderRules(ruleCounts) {
  const list = document.getElementById("rule-list");
  list.innerHTML = "";
  const entries = byCountDesc(Object.entries(ruleCounts || {})).slice(0, 5);
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No fired rules on this domain yet.";
    list.appendChild(item);
    return;
  }
  for (const [rule, count] of entries) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const value = document.createElement("span");
    label.textContent = rule;
    value.textContent = String(count);
    value.className = "value";
    item.append(label, value);
    list.appendChild(item);
  }
}

function renderAuditLog(entries) {
  const list = document.getElementById("audit-list");
  list.innerHTML = "";
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No flagged cards recorded yet.";
    list.appendChild(item);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    const main = document.createElement("div");
    const side = document.createElement("div");
    const score = document.createElement("span");
    const bucket = document.createElement("span");
    const title = document.createElement("span");
    const sub = document.createElement("span");

    main.className = "audit-main";
    side.className = "audit-side";
    title.className = "audit-title";
    sub.className = "audit-sub";
    score.className = "value";
    bucket.className = bucketClass(entry.bucket);

    title.textContent = truncate(entry.title || "(untitled)");
    sub.textContent = `${entry.rules?.[0] || "no rule"} • ${relativeTime(entry.flaggedAt)}`;
    score.textContent = (Number(entry.score || 0) / 100).toFixed(2);
    bucket.textContent = entry.bucket === "High Probability Slop (Block)" ? "Block" : entry.bucket === "Suspect (Highlight)" ? "Suspect" : "Human";

    main.append(title, sub);
    side.append(bucket, score);
    item.append(main, side);
    list.appendChild(item);
  }
}

function setStatus(isEnabled, activeRuleCount, updatedAt) {
  document.getElementById("status-indicator").innerHTML = isEnabled
    ? 'Filtering is ON <span class="dot on">●</span>'
    : 'Filtering is OFF <span class="dot off">○</span>';
  document.getElementById("rules-active").textContent = `${activeRuleCount} active`;
  document.getElementById("last-updated").textContent = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : "Never";
}

function activatePanel(panelId) {
  currentPanel = panelId || null;
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("active", panel.id === panelId);
  }
  for (const row of document.querySelectorAll("[data-panel-target]")) {
    row.classList.toggle("active", row.dataset.panelTarget === panelId);
  }
}

async function renderCurrentDomain() {
  const domainLabel = document.getElementById("domain");
  const enabled = document.getElementById("enabled");
  const resetButton = document.getElementById("reset-stats");
  const repoLink = document.getElementById("repo-link");
  repoLink.href = REPO_URL;

  const activeRuleCount = countActiveRules(currentRules);
  document.getElementById("rules-count").textContent = `${activeRuleCount} active`;

  if (!currentDomain) {
    domainLabel.textContent = "Open a web page to inspect this domain.";
    enabled.checked = false;
    enabled.disabled = true;
    resetButton.disabled = true;
    renderRules({});
    renderAuditLog([]);
    setStatus(false, activeRuleCount, null);
    return;
  }

  const statsKey = `slopScrubberStats:${currentDomain}`;
  const auditKey = `slopScrubberAuditLog:${currentDomain}`;
  const payload = await storageGet(["disabledDomains", statsKey, auditKey]);
  const stats = payload[statsKey] || {};
  const auditLog = Array.isArray(payload[auditKey]) ? payload[auditKey] : [];
  const disabledDomains = Array.isArray(payload.disabledDomains) ? payload.disabledDomains : [];
  const isEnabled = !disabledDomains.includes(currentDomain);

  domainLabel.textContent = currentDomain;
  enabled.checked = isEnabled;
  enabled.disabled = false;
  resetButton.disabled = false;
  renderRules(stats.ruleCounts || {});
  renderAuditLog(auditLog.slice(-10).reverse());
  setStatus(isEnabled, activeRuleCount, stats.updatedAt);

  enabled.onchange = async () => {
    const nextDisabled = new Set(disabledDomains);
    if (enabled.checked) {
      nextDisabled.delete(currentDomain);
    } else {
      nextDisabled.add(currentDomain);
    }
    await storageSet({ disabledDomains: Array.from(nextDisabled) });
    setStatus(enabled.checked, activeRuleCount, stats.updatedAt);
  };

  resetButton.onclick = async () => {
    await storageRemove([statsKey, auditKey]);
    renderRules({});
    renderAuditLog([]);
    setStatus(enabled.checked, activeRuleCount, null);
  };

  if (currentPanel) {
    activatePanel(currentPanel);
  }
}

async function updateView() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentDomain = tabs[0]?.url ? domainFromUrl(tabs[0].url) : null;
  if (!currentRules) {
    currentRules = await loadRules();
  }
  await renderCurrentDomain();
}

function startRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(() => {
    renderCurrentDomain().catch((error) => {
      document.getElementById("domain").textContent = String(error);
    });
  }, 60000);
}

for (const row of document.querySelectorAll("[data-panel-target]")) {
  row.addEventListener("click", () => {
    const isActive = row.classList.contains("active");
    activatePanel(isActive ? null : row.dataset.panelTarget);
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !currentDomain) {
    return;
  }
  const statsKey = `slopScrubberStats:${currentDomain}`;
  const auditKey = `slopScrubberAuditLog:${currentDomain}`;
  if (changes.disabledDomains || changes[statsKey] || changes[auditKey]) {
    renderCurrentDomain().catch((error) => {
      document.getElementById("domain").textContent = String(error);
    });
  }
});

updateView().catch((error) => {
  document.getElementById("domain").textContent = String(error);
});
startRefreshTimer();
