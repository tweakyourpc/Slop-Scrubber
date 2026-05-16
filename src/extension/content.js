(async () => {
  const scorer = await import(chrome.runtime.getURL("scorer.js"));

  const DOMAIN = location.hostname;
  const RULES_URL = chrome.runtime.getURL("config/rules.json");
  const SCAN_BATCH_DELAY_MS = 150;
  const FLAGGED_ATTR = "data-slop-scrubber-flagged";
  const SCANNED_ATTR = "data-slop-scrubber-scanned";
  const MIN_CANDIDATE_TEXT_LENGTH = 20;
  const DEFAULT_MAX_CANDIDATE_TEXT_LENGTH = 1200;
  const GENERIC_FALLBACK_SELECTOR = "div, a";
  const HEADING_SELECTORS = [
    "[slot='title']",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "[role='heading']",
    "[data-testid='tweetText']",
    "[data-test-id='post-content']",
  ];
  const PUBLISHER_SELECTORS = [
    "[data-publisher]",
    "[data-testid='User-Name']",
    "[data-testid='socialContext']",
    "[class*='feed-shared-actor__name']",
    "[class*='update-components-actor__title']",
    "[class*='sponsored-label']",
    "[class*='ad-label']",
    "[class*='promo-label']",
    "[class*='brandvoice']",
    "[aria-label*='sponsored' i]",
    "[aria-label*='promoted' i]",
    "[aria-label*='brandvoice' i]",
    "[aria-label*='presented by' i]",
    "[aria-label*='paid partner content' i]",
    "[aria-label*='advertiser content' i]",
    "[aria-label*='around the web' i]",
    "[aria-label*='you may like' i]",
    ".publisher",
    ".source",
    "[class*='publisher']",
    "[class*='source']",
    "cite",
    "footer",
  ];
  const KNOWN_CARD_SELECTOR = [
    "c-wiz",
    "g-card",
    "shreddit-post",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-grid-media",
    "[data-testid='tweet']",
    "[data-testid='cellInnerDiv']",
    "[data-urn*='urn:li:activity']",
    "[class*='feed-shared-update']",
    "[class*='feed-shared-update-v2']",
    "[class*='taboola']",
    "[class*='outbrain']",
    "[data-widget-type*='taboola']",
    "[data-widget-type*='outbrain']",
  ].join(", ");
  const CANDIDATE_SELECTOR = [
    "article",
    "[role='article']",
    "section",
    "li",
    "c-wiz",
    "g-card",
    "shreddit-post",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-grid-media",
    "[data-testid='tweet']",
    "[data-testid='cellInnerDiv']",
    "[data-urn*='urn:li:activity']",
    "[class*='feed-shared-update']",
    "[class*='feed-shared-update-v2']",
    "[class*='taboola']",
    "[class*='outbrain']",
    "[data-widget-type*='taboola']",
    "[data-widget-type*='outbrain']",
  ].join(", ");
  const statsKey = `slopScrubberStats:${DOMAIN}`;
  const state = {
    rules: null,
    disabledDomains: [],
    stats: {
      domain: DOMAIN,
      totalFlagged: 0,
      bucketCounts: { suspect: 0, block: 0 },
      ruleCounts: {},
      updatedAt: null,
    },
    observer: null,
    pendingNodes: new Set(),
    flushTimer: null,
    persistTimer: null,
    countedNodes: new WeakSet(),
    revealListenerAttached: false,
    enabled: true,
  };

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(items) {
    return new Promise((resolve) => chrome.storage.local.set(items, resolve));
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function nodeText(node) {
    return normalizeText(
      node?.innerText ||
        node?.textContent ||
        node?.getAttribute?.("data-publisher") ||
        node?.getAttribute?.("aria-label") ||
        ""
    );
  }

  function isElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE;
  }

  function matchesSelector(node, selector) {
    return Boolean(selector && node.matches?.(selector));
  }

  function queryFirstText(node, selectors) {
    for (const selector of selectors) {
      const match = node.matches?.(selector) ? node : node.querySelector(selector);
      const text = nodeText(match);
      if (text) {
        return text;
      }
    }
    return "";
  }

  function hasKnownCardMarker(node) {
    return matchesSelector(node, KNOWN_CARD_SELECTOR);
  }

  function hasExcerptSignal(node) {
    return Boolean(normalizeText(
      node.getAttribute?.("data-excerpt") ||
        node.querySelector("[data-excerpt], p, #description-text, [slot='summary']")?.innerText ||
        ""
    ));
  }

  function hasCardSignals(node) {
    return Boolean(
      hasKnownCardMarker(node) ||
      node.hasAttribute?.("data-publisher") ||
      node.hasAttribute?.("data-excerpt") ||
      queryFirstText(node, HEADING_SELECTORS) ||
      queryFirstText(node, PUBLISHER_SELECTORS)
    );
  }

  function hasStructuredFallbackSignals(node) {
    return Boolean(firstHeadingText(node) && (firstPublisherText(node) || hasExcerptSignal(node)));
  }

  function maxCandidateTextLength(node) {
    if (hasKnownCardMarker(node)) {
      return 1600;
    }
    if (matchesSelector(node, "a")) {
      return 400;
    }
    return DEFAULT_MAX_CANDIDATE_TEXT_LENGTH;
  }

  function isCandidateElement(node) {
    if (!isElement(node)) {
      return false;
    }
    if (!node.isConnected || node.matches("script, style, template, noscript")) {
      return false;
    }
    const text = normalizeText(node.innerText || node.textContent || "");
    if (text.length < MIN_CANDIDATE_TEXT_LENGTH) {
      return false;
    }
    if (text.length > maxCandidateTextLength(node) && !hasKnownCardMarker(node)) {
      return false;
    }
    if (matchesSelector(node, GENERIC_FALLBACK_SELECTOR)) {
      return hasKnownCardMarker(node) || hasStructuredFallbackSignals(node);
    }
    if (!hasCardSignals(node) && !hasKnownCardMarker(node)) {
      return false;
    }
    return true;
  }

  function firstHeadingText(node) {
    return queryFirstText(node, HEADING_SELECTORS);
  }

  function firstPublisherText(node) {
    return queryFirstText(node, PUBLISHER_SELECTORS) || normalizeText(
      node.getAttribute?.("data-publisher") ||
        node.dataset?.publisher ||
        ""
    );
  }

  function deriveCardFromNode(node) {
    const bodyText = normalizeText(node.innerText || "");
    if (!bodyText) {
      return null;
    }

    const title = firstHeadingText(node) || bodyText.split(/\n+/).map(normalizeText).find(Boolean) || bodyText;
    const publisher = firstPublisherText(node);
    const excerptSource = normalizeText(
      node.getAttribute?.("data-excerpt") ||
        node.querySelector("p")?.innerText ||
        bodyText
    );
    let excerpt = excerptSource;
    if (excerpt && title && excerpt.startsWith(title)) {
      excerpt = normalizeText(excerpt.slice(title.length));
    }
    if (!excerpt && bodyText !== title) {
      excerpt = bodyText;
    }
    return {
      title,
      excerpt,
      publisher,
    };
  }

  function getCandidateNodes(root) {
    const candidates = [];
    const seen = new Set();
    const push = (node) => {
      if (!isCandidateElement(node) || seen.has(node)) {
        return;
      }
      seen.add(node);
      candidates.push(node);
    };

    push(root);
    root.querySelectorAll(CANDIDATE_SELECTOR).forEach((node) => {
      if (isCandidateElement(node)) {
        push(node);
      }
    });
    return candidates;
  }

  function bumpRuleCounts(result) {
    for (const rule of result.matchedRules || []) {
      state.stats.ruleCounts[rule] = (state.stats.ruleCounts[rule] || 0) + 1;
    }
  }

  function applyResult(node, result) {
    const bucket = result.bucket;
    if (bucket === "Human") {
      node.removeAttribute(FLAGGED_ATTR);
      node.removeAttribute("data-slop-scrubber-bucket");
      node.removeAttribute("data-slop-scrubber-score");
      return;
    }

    const nextFlag = bucket === "High Probability Slop (Block)" ? "block" : "suspect";
    const prevFlag = node.getAttribute(FLAGGED_ATTR);
    node.setAttribute(FLAGGED_ATTR, nextFlag);
    node.setAttribute("data-slop-scrubber-bucket", bucket);
    node.setAttribute("data-slop-scrubber-score", String(result.score));

    if (prevFlag !== nextFlag && !state.countedNodes.has(node)) {
      state.countedNodes.add(node);
      state.stats.totalFlagged += 1;
      state.stats.bucketCounts[nextFlag] += 1;
      bumpRuleCounts(result);
    }
  }

  async function persistStats() {
    state.stats.updatedAt = Date.now();
    const payload = await storageGet([statsKey]);
    const current = payload[statsKey] || {};
    const mergedRuleCounts = { ...(current.ruleCounts || {}) };
    for (const [key, value] of Object.entries(state.stats.ruleCounts)) {
      mergedRuleCounts[key] = (mergedRuleCounts[key] || 0) + value;
    }
    const merged = {
      ...current,
      ...state.stats,
      totalFlagged: (current.totalFlagged || 0) + state.stats.totalFlagged,
      bucketCounts: {
        suspect: (current.bucketCounts?.suspect || 0) + state.stats.bucketCounts.suspect,
        block: (current.bucketCounts?.block || 0) + state.stats.bucketCounts.block,
      },
      ruleCounts: mergedRuleCounts,
    };
    await storageSet({ [statsKey]: merged });
    state.stats.bucketCounts = { suspect: 0, block: 0 };
    state.stats.ruleCounts = {};
    state.stats.totalFlagged = 0;
  }

  function schedulePersist() {
    if (state.persistTimer) {
      return;
    }
    state.persistTimer = setTimeout(async () => {
      state.persistTimer = null;
      await persistStats();
    }, SCAN_BATCH_DELAY_MS);
  }

  function evaluateNode(node) {
    if (!state.enabled || !isCandidateElement(node) || node.hasAttribute(SCANNED_ATTR)) {
      return;
    }

    const card = deriveCardFromNode(node);
    if (!card) {
      node.setAttribute(SCANNED_ATTR, "1");
      return;
    }

    const result = scorer.scoreContentCard(card, state.rules);
    node.setAttribute(SCANNED_ATTR, "1");
    applyResult(node, result);
    if (result.bucket !== "Human") {
      schedulePersist();
    }
  }

  function flushPending() {
    const nodes = Array.from(state.pendingNodes);
    state.pendingNodes.clear();
    for (const node of nodes) {
      for (const candidate of getCandidateNodes(node)) {
        evaluateNode(candidate);
      }
    }
  }

  function scheduleFlush() {
    if (state.flushTimer) {
      return;
    }
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      flushPending();
      schedulePersist();
    }, SCAN_BATCH_DELAY_MS);
  }

  function queueNode(node) {
    if (!isElement(node)) {
      return;
    }
    state.pendingNodes.add(node);
    scheduleFlush();
  }

  function disconnectObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  function clearScanState(root) {
    if (!root) {
      return;
    }
    root.querySelectorAll(`[${SCANNED_ATTR}]`).forEach((node) => {
      node.removeAttribute(SCANNED_ATTR);
    });
  }

  function clearAllFlags(root) {
    if (!root) {
      return;
    }
    root.querySelectorAll(`[${FLAGGED_ATTR}]`).forEach((node) => {
      node.removeAttribute(FLAGGED_ATTR);
      node.removeAttribute("data-slop-scrubber-bucket");
      node.removeAttribute("data-slop-scrubber-score");
      node.removeAttribute("data-slop-scrubber-revealed");
      node.removeAttribute(SCANNED_ATTR);
    });
  }

  function toggleReveal(event) {
    const direct = event.target.closest?.(`[${FLAGGED_ATTR}="block"]`);
    const byPosition = document.elementsFromPoint(event.clientX, event.clientY)
      .find((node) => node.matches?.(`[${FLAGGED_ATTR}="block"]`));
    const blocked = direct || byPosition;
    if (!blocked) {
      return;
    }
    blocked.toggleAttribute("data-slop-scrubber-revealed");
  }

  async function loadState() {
    const payload = await storageGet(["disabledDomains", statsKey]);
    state.disabledDomains = Array.isArray(payload.disabledDomains) ? payload.disabledDomains : [];
    state.enabled = !state.disabledDomains.includes(DOMAIN);
  }

  async function loadRules() {
    const response = await fetch(RULES_URL);
    if (!response.ok) {
      throw new Error(`Failed to load rules: ${response.status}`);
    }
    return response.json();
  }

  async function setDomainEnabled(enabled) {
    const nextDisabled = new Set(state.disabledDomains);
    if (enabled) {
      nextDisabled.delete(DOMAIN);
    } else {
      nextDisabled.add(DOMAIN);
    }
    state.disabledDomains = Array.from(nextDisabled);
    state.enabled = enabled;
    await storageSet({ disabledDomains: state.disabledDomains });
    if (!enabled) {
      disconnectObserver();
      clearAllFlags(document.body);
    } else if (!state.observer) {
      clearScanState(document.body);
      startObserver();
      queueNode(document.body);
    }
  }

  function startObserver() {
    if (!state.enabled || state.observer || !document.body) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          queueNode(addedNode);
        }
      }
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function attachRevealListener() {
    if (state.revealListenerAttached || !document.body) {
      return;
    }
    document.body.addEventListener("click", toggleReveal, true);
    state.revealListenerAttached = true;
  }

  async function boot() {
    state.rules = await loadRules();
    await loadState();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (changes.disabledDomains) {
        state.disabledDomains = Array.isArray(changes.disabledDomains.newValue)
          ? changes.disabledDomains.newValue
          : [];
        const enabled = !state.disabledDomains.includes(DOMAIN);
        if (enabled !== state.enabled) {
          state.enabled = enabled;
          if (!enabled) {
            disconnectObserver();
            clearAllFlags(document.body);
          } else if (document.body) {
            clearScanState(document.body);
            startObserver();
            queueNode(document.body);
          }
        }
      }
    });

    if (!state.enabled) {
      attachRevealListener();
      return;
    }

    queueNode(document.body);
    attachRevealListener();
    startObserver();
  }

  window.addEventListener("beforeunload", () => {
    disconnectObserver();
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
      flushPending();
    }
    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = null;
    }
    persistStats();
  });

  const start = () => boot().catch((error) => console.error(error));
  if (document.body) {
    start();
  } else {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  }

})();
