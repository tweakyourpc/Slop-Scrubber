const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve));

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

function renderRules(ruleCounts) {
  const list = document.getElementById("rule-list");
  list.innerHTML = "";
  const entries = byCountDesc(Object.entries(ruleCounts || {})).slice(0, 8);
  if (!entries.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No rule hits yet.";
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

async function updateView() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = tabs[0]?.url ? domainFromUrl(tabs[0].url) : null;
  const domainLabel = document.getElementById("domain");
  const title = document.getElementById("title");
  const status = document.getElementById("status");
  const enabled = document.getElementById("enabled");

  if (!domain) {
    domainLabel.textContent = "No active tab";
    title.textContent = "Slop-Scrubber";
    status.textContent = "Open a web page to inspect per-domain stats.";
    enabled.checked = false;
    return;
  }

  const statsKey = `slopScrubberStats:${domain}`;
  const payload = await storageGet(["disabledDomains", statsKey]);
  const stats = payload[statsKey] || {};
  const disabledDomains = Array.isArray(payload.disabledDomains) ? payload.disabledDomains : [];
  const isEnabled = !disabledDomains.includes(domain);

  title.textContent = "Current Domain";
  domainLabel.textContent = domain;
  enabled.checked = isEnabled;
  document.getElementById("suspect-count").textContent = String(stats.bucketCounts?.suspect || 0);
  document.getElementById("block-count").textContent = String(stats.bucketCounts?.block || 0);
  document.getElementById("flagged-count").textContent = String(stats.totalFlagged || 0);
  renderRules(stats.ruleCounts || {});
  status.textContent = isEnabled ? "Scoring active." : "Scoring disabled for this domain.";

  enabled.onchange = async () => {
    const nextDisabled = new Set(disabledDomains);
    if (enabled.checked) {
      nextDisabled.delete(domain);
    } else {
      nextDisabled.add(domain);
    }
    await storageSet({ disabledDomains: Array.from(nextDisabled) });
    status.textContent = enabled.checked ? "Scoring active." : "Scoring disabled for this domain.";
  };
}

updateView().catch((error) => {
  const status = document.getElementById("status");
  status.textContent = String(error);
});
