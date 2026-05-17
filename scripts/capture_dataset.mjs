import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import puppeteer from "puppeteer-core";

import { scoreContentCard } from "../src/extension/scorer.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_SITES_PATH = path.join(ROOT, "config", "dataset_sites.json");
const DEFAULT_RULES_PATH = path.join(ROOT, "config", "rules.json");
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "dist", "datasets");
const DEFAULT_CHROME_PATH = process.env.SLOP_SCRUBBER_CHROME_PATH || "/usr/bin/google-chrome";
const SUSPICIOUS_TOKENS = [
  "sponsored",
  "promoted",
  "brand studio",
  "brandvoice",
  "deal",
  "check price",
  "buy now",
  "doctors don't want",
  "experts reveal",
  "you won't believe",
  "around the web"
];

function parseArgs(argv) {
  const options = {
    sitesPath: DEFAULT_SITES_PATH,
    rulesPath: DEFAULT_RULES_PATH,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    limit: 36,
    maxCardsPerSite: 60,
    waitMs: 7000,
    headless: true,
    chromePath: DEFAULT_CHROME_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--sites" && next) {
      options.sitesPath = path.resolve(next);
      index += 1;
    } else if (arg === "--rules" && next) {
      options.rulesPath = path.resolve(next);
      index += 1;
    } else if (arg === "--out" && next) {
      options.outputRoot = path.resolve(next);
      index += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Number(next);
      index += 1;
    } else if (arg === "--max-cards" && next) {
      options.maxCardsPerSite = Number(next);
      index += 1;
    } else if (arg === "--wait-ms" && next) {
      options.waitMs = Number(next);
      index += 1;
    } else if (arg === "--chrome-path" && next) {
      options.chromePath = next;
      index += 1;
    } else if (arg === "--headful") {
      options.headless = false;
    }
  }

  return options;
}

function timestampLabel(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function suspiciousPass(card, score) {
  if (score >= 25) {
    return false;
  }
  const joined = `${card.title} ${card.excerpt} ${card.publisher}`.toLowerCase();
  return SUSPICIOUS_TOKENS.some((token) => joined.includes(token));
}

function classifySample(card, result) {
  if (result.score >= 60) {
    return "high_probability_slop";
  }
  if (result.score >= 25) {
    return "suspect";
  }
  if (result.score >= 15) {
    return "borderline_human";
  }
  if (suspiciousPass(card, result.score)) {
    return "suspicious_pass";
  }
  return "human";
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function appendNdjson(filePath, rows) {
  if (!rows.length) {
    return;
  }
  const payload = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  await fs.appendFile(filePath, payload, "utf8");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeNdjson(filePath, rows) {
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(filePath, payload ? `${payload}\n` : "", "utf8");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCardsFromPage(maxCards) {
  const GENERIC_FALLBACK_SELECTOR = "article, [role='article'], section, li, a, div";
  const EXTRA_SELECTOR = [
    "shreddit-post",
    "c-wiz",
    "g-card",
    "[data-testid='tweet']",
    "[data-testid='card.wrapper']",
    ".feed-shared-update-v2",
    ".occludable-update",
    "[data-testid='feedItem']",
    "[data-testid='postThreadItem']",
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-grid-media",
    "[class*='taboola']",
    "[class*='outbrain']",
    "[data-widget-type*='taboola']",
    "[data-widget-type*='outbrain']"
  ].join(", ");
  const CANDIDATE_SELECTOR = `${GENERIC_FALLBACK_SELECTOR}, ${EXTRA_SELECTOR}`;
  const TITLE_SELECTORS = [
    "#video-title",
    "[data-testid='tweetText']",
    "[data-testid='postText']",
    "[data-testid='post-text']",
    "[data-testid='feedItem-postText']",
    "[data-testid='post-text-content']",
    ".feed-shared-text",
    "[data-test-id='main-feed-activity-card__commentary']",
    ".videoCube-title",
    ".card-title",
    "[class*='item-title']",
    "[slot='title']",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "[role='heading']",
    "[dir='auto']"
  ];
  const PUBLISHER_SELECTORS = [
    "#channel-name",
    "[data-testid='User-Name']",
    "[data-testid='socialContext']",
    "[data-testid='profileLink']",
    ".publisher",
    ".source",
    "cite",
    "footer",
    "[data-publisher]",
    "[data-ad-label]",
    "[class*='branding']",
    "[class*='sponsored']",
    "[class*='publisher']",
    "[class*='source']"
  ];
  const EXCERPT_SELECTORS = [
    "#metadata-line",
    "[data-testid='card.wrapper']",
    "[data-testid='embed-external']",
    "[data-testid='embed-record']",
    "[data-testid='embed-record-with-media']",
    "[data-testid='tweetText']",
    "[data-testid='postText']",
    "[data-testid='post-text']",
    "[data-testid='feedItem-postText']",
    "[data-testid='post-text-content']",
    "p",
    "[slot='summary']"
  ];

  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const queryText = (node, selectors) => {
    for (const selector of selectors) {
      const match = node.matches?.(selector) ? node : node.querySelector(selector);
      const text = normalize(match?.innerText || match?.textContent || match?.getAttribute?.("aria-label") || "");
      if (text) {
        return text;
      }
    }
    return "";
  };

  const hidden = (node) => {
    const style = window.getComputedStyle(node);
    if (node.hidden || node.getAttribute("aria-hidden") === "true") {
      return true;
    }
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
    const rect = node.getBoundingClientRect();
    return rect.width === 0 || rect.height === 0;
  };

  const mediaOnly = (node) => {
    if (!node.querySelector("img, picture, video, canvas, svg")) {
      return false;
    }
    return normalize(node.innerText || node.textContent || "").length < 20;
  };

  const chromeUi = (node) => {
    if (node.closest("header, nav, footer, aside, form")) {
      return true;
    }
    const landmark = node.getAttribute("role");
    if (["navigation", "banner", "search", "contentinfo"].includes(landmark || "")) {
      return true;
    }
    const classText = normalize(node.className || "").toLowerCase();
    if (/(masthead|navbar|navrail|menu|searchbox|ybar|header)/.test(classText)) {
      return true;
    }
    return false;
  };

  const plausibleTitle = (title) => {
    const normalized = normalize(title);
    if (normalized.length < 18 || normalized.length > 220) {
      return false;
    }
    const words = normalized.split(/\s+/);
    return words.length >= 4 && !/^(search|sign in|news finance sports)/i.test(normalized);
  };

  const cards = [];
  const seen = new Set();
  for (const node of document.querySelectorAll(CANDIDATE_SELECTOR)) {
    if (cards.length >= maxCards) {
      break;
    }
    if (!(node instanceof HTMLElement) || hidden(node) || mediaOnly(node) || chromeUi(node)) {
      continue;
    }
    const bodyText = normalize(node.innerText || node.textContent || "");
    if (bodyText.length < 30 || bodyText.length > 2000) {
      continue;
    }
    const title = queryText(node, TITLE_SELECTORS) || normalize(bodyText.split(/\n+/)[0] || bodyText);
    if (!plausibleTitle(title)) {
      continue;
    }
    const publisher = queryText(node, PUBLISHER_SELECTORS);
    const excerpt = queryText(node, EXCERPT_SELECTORS) || bodyText;
    const key = `${title}||${publisher}||${excerpt.slice(0, 160)}`;
    if (!title || seen.has(key)) {
      continue;
    }
    if (!node.querySelector("a, h1, h2, h3, h4, h5, h6, [role='heading']")) {
      continue;
    }
    seen.add(key);
    cards.push({
      title,
      excerpt: normalize(excerpt.startsWith(title) ? excerpt.slice(title.length) : excerpt),
      publisher,
      bodyText,
      href: node.closest("a")?.href || node.querySelector("a")?.href || null,
      fingerprint: {
        tag: node.tagName.toLowerCase(),
        className: normalize(node.className || "").slice(0, 180),
        dataTestId: node.getAttribute("data-testid") || null
      },
      outerHtmlSnippet: (node.outerHTML || "").slice(0, 1200)
    });
  }
  return cards;
}

async function scrollPage(page) {
  await page.evaluate(async () => {
    for (let index = 0; index < 4; index += 1) {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    window.scrollTo(0, 0);
  });
}

async function maybeDismissOverlays(page) {
  await page.evaluate(() => {
    const labels = ["accept", "accept all", "i agree", "agree", "continue", "close", "not now"];
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    for (const button of buttons) {
      const text = String(button.textContent || "").trim().toLowerCase();
      if (labels.includes(text)) {
        button.click();
      }
    }
  }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

async function captureSite(page, site, rules, options) {
  const startedAt = Date.now();
  const record = {
    site,
    startedAt,
    ok: false,
    error: null,
    count: 0,
    cards: []
  };

  const performCapture = async () => {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(options.waitMs);
    await maybeDismissOverlays(page);
    await scrollPage(page);
    await sleep(1000);
    const cards = await page.evaluate(extractCardsFromPage, options.maxCardsPerSite);
    record.cards = cards.map((card) => {
      const normalizedCard = {
        title: normalizeText(card.title),
        excerpt: normalizeText(card.excerpt),
        publisher: normalizeText(card.publisher)
      };
      const result = scoreContentCard(normalizedCard, rules);
      return {
        ...card,
        result,
        sampleClass: classifySample(normalizedCard, result),
        capturedAt: Date.now()
      };
    });
    record.count = record.cards.length;
    record.ok = true;
  };

  try {
    await performCapture();
  } catch (error) {
    if (String(error).includes("Execution context was destroyed")) {
      try {
        await sleep(1500);
        await performCapture();
      } catch (retryError) {
        record.error = String(retryError);
      }
    } else {
      record.error = String(error);
    }
  }

  record.finishedAt = Date.now();
  record.durationMs = record.finishedAt - startedAt;
  return record;
}

function summarizeRuns(runs) {
  const summary = {
    sitesAttempted: runs.length,
    sitesSucceeded: runs.filter((run) => run.ok).length,
    sitesFailed: runs.filter((run) => !run.ok).length,
    cardsCaptured: 0,
    bucketCounts: {
      human: 0,
      suspect: 0,
      block: 0,
      borderline_human: 0,
      suspicious_pass: 0
    },
    topRules: {},
    failures: runs.filter((run) => !run.ok).map((run) => ({
      site: run.site.label,
      url: run.site.url,
      error: run.error
    }))
  };

  for (const run of runs) {
    for (const card of run.cards) {
      summary.cardsCaptured += 1;
      if (card.result.bucket === "High Probability Slop (Block)") {
        summary.bucketCounts.block += 1;
      } else if (card.result.bucket === "Suspect (Highlight)") {
        summary.bucketCounts.suspect += 1;
      } else {
        summary.bucketCounts.human += 1;
      }
      if (card.sampleClass === "borderline_human") {
        summary.bucketCounts.borderline_human += 1;
      }
      if (card.sampleClass === "suspicious_pass") {
        summary.bucketCounts.suspicious_pass += 1;
      }
      for (const rule of card.result.matchedRules || []) {
        summary.topRules[rule] = (summary.topRules[rule] || 0) + 1;
      }
    }
  }

  summary.topRules = Object.fromEntries(
    Object.entries(summary.topRules)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 25)
  );
  return summary;
}

function interestingRows(runs) {
  const rows = [];
  for (const run of runs) {
    for (const card of run.cards) {
      if (
        card.result.bucket === "Suspect (Highlight)" ||
        card.result.bucket === "High Probability Slop (Block)" ||
        card.sampleClass === "borderline_human" ||
        card.sampleClass === "suspicious_pass"
      ) {
        rows.push({
          site: run.site.label,
          category: run.site.category,
          siteUrl: run.site.url,
          ...card
        });
      }
    }
  }
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [sites, rules] = await Promise.all([
    loadJson(options.sitesPath),
    loadJson(options.rulesPath)
  ]);
  const chosenSites = sites.slice(0, options.limit);
  const runDir = path.join(options.outputRoot, `capture-${timestampLabel()}`);
  await ensureDir(runDir);

  const browser = await puppeteer.launch({
    executablePath: options.chromePath,
    headless: options.headless,
    args: [
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--disable-features=Translate,AutomationControlled",
      "--window-size=1440,2000"
    ],
    defaultViewport: {
      width: 1440,
      height: 2000,
      deviceScaleFactor: 1
    }
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
  );

  const runs = [];
  const ndjsonPath = path.join(runDir, "cards.ndjson");
  await writeJson(path.join(runDir, "sites.json"), chosenSites);

  for (const site of chosenSites) {
    console.log(`capture ${site.label} ${site.url}`);
    const run = await captureSite(page, site, rules, options);
    runs.push(run);
    const rows = run.cards.map((card) => ({
      site: site.label,
      category: site.category,
      siteUrl: site.url,
      ok: run.ok,
      durationMs: run.durationMs,
      ...card
    }));
    await appendNdjson(ndjsonPath, rows);
  }

  await browser.close();

  const summary = summarizeRuns(runs);
  const reviewRows = interestingRows(runs);
  await writeJson(path.join(runDir, "summary.json"), summary);
  await writeJson(
    path.join(runDir, "runs.json"),
    runs.map((run) => ({
      site: run.site,
      ok: run.ok,
      error: run.error,
      count: run.count,
      durationMs: run.durationMs
    }))
  );
  await writeNdjson(path.join(runDir, "interesting.ndjson"), reviewRows);
  await writeJson(
    path.join(runDir, "interesting_summary.json"),
    {
      count: reviewRows.length,
      bySampleClass: Object.fromEntries(
        Object.entries(reviewRows.reduce((acc, row) => {
          acc[row.sampleClass] = (acc[row.sampleClass] || 0) + 1;
          return acc;
        }, {})).sort((a, b) => b[1] - a[1])
      )
    }
  );

  console.log(`dataset capture complete: ${runDir}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
