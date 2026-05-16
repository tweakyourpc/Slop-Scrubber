const EM_DASH = "\u2014";
const LIST_MARKER_RE = /^(?<lead>\s*(?:[-*+]\s+|\d+\.\s+))(?<body>.+)$/;
const SERIAL_SPLIT_RE = /\s*—\s*/;
const TRANSITION_PREFIXES = [
  "and",
  "at least",
  "because",
  "but",
  "especially",
  "even though",
  "for now",
  "instead",
  "just",
  "maybe",
  "perhaps",
  "rather",
  "so",
  "still",
  "then",
  "though",
  "while",
  "yet",
];
const PARENTHETICAL_PREFIXES = [
  "as ",
  "which ",
  "who ",
  "whose ",
  "where ",
  "when ",
  "while ",
  "with ",
  "without ",
];
const COLON_CUE_RE = /\b(is|are|was|were|means|meant|remains|remained|looks|looked|sounds|sounded|feels|felt|goal|result|plan|rule)\b/i;
const ACTION_PREFIXES = ["by ", "just ", "paste ", "review ", "run ", "set up ", "to ", "use "];
const SHORT_LABEL_TERMS = new Set(["guide", "logic", "priority", "reference", "sheet", "status", "tab", "tiers", "values"]);
const SPONSORED_SENTINELS = ["sponsored", "promoted", "partner content", "native ad", "paid post"];
const DEFAULT_THRESHOLDS = { human: 25, suspect: 60 };

function wordCount(text) {
  const trimmed = String(text).trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function isTitleFragment(text) {
  const words = String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 8) {
    return false;
  }
  for (const word of words) {
    const stripped = word.replace(/^[()\[\]{}:;,.'"]+|[()\[\]{}:;,.'"]+$/g, "");
    if (!stripped) {
      continue;
    }
    if (/^\d/.test(stripped)) {
      continue;
    }
    if (/^[A-Z]/.test(stripped)) {
      continue;
    }
    if (["and", "of", "the", "for", "in", "to", "&"].includes(stripped.toLowerCase())) {
      continue;
    }
    return false;
  }
  return true;
}

function looksParenthetical(middle) {
  const lowered = String(middle).trim().toLowerCase();
  return (
    wordCount(middle) >= 2 &&
    wordCount(middle) <= 14 &&
    !/[.!?]$/.test(String(middle).trim()) &&
    PARENTHETICAL_PREFIXES.some((prefix) => lowered.startsWith(prefix))
  );
}

function looksDescriptor(label) {
  if (wordCount(label) > 6) {
    return false;
  }
  const lowered = ` ${String(label).toLowerCase()} `;
  return ![" is ", " are ", " was ", " were ", " has ", " have "].some((token) => lowered.includes(token));
}

function shouldUseComma(right) {
  const lowered = String(right).trim().toLowerCase();
  return TRANSITION_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function shouldUseColon(left, right) {
  const rightLower = String(right).trim().toLowerCase();
  if (String(right).includes("=") && wordCount(left) >= 1 && wordCount(left) <= 5) {
    return true;
  }
  if (String(left).includes("=") && wordCount(right) >= 1 && wordCount(right) <= 4) {
    return true;
  }
  if (ACTION_PREFIXES.some((prefix) => rightLower.startsWith(prefix))) {
    return COLON_CUE_RE.test(left);
  }
  if (rightLower.startsWith("for example") || rightLower.startsWith("namely") || rightLower.startsWith("specifically")) {
    return true;
  }
  return false;
}

function looksHeadingStyle(left, right, line) {
  const stripped = String(line).trim();
  if (!stripped || stripped !== line) {
    return false;
  }
  if (/[.!?:;]$/.test(stripped)) {
    return false;
  }
  if (/\t/.test(stripped) || /^[-*+]/.test(stripped)) {
    return false;
  }
  if (String(left).toLowerCase().startsWith("step ") && wordCount(right) >= 1 && wordCount(right) <= 10) {
    return true;
  }
  if (isTitleFragment(left) && isTitleFragment(right)) {
    return true;
  }
  const leftWords = String(left).split(/\s+/);
  if (leftWords.length >= 1 && leftWords.length <= 5 && SHORT_LABEL_TERMS.has(leftWords[leftWords.length - 1].toLowerCase())) {
    return true;
  }
  return false;
}

function normalizeWhitespace(text) {
  return String(text).split(/\s+/).filter(Boolean).join(" ");
}

export function matchAdLayoutToken(text) {
  const normalized = normalizeWhitespace(text);
  for (const token of ["AmazonSponsored", "WalmartSponsored", "PocketSponsored", "SponsoredContent", "PromotedContent", "NativeAd"]) {
    if (normalized.includes(token)) {
      return token;
    }
  }
  return null;
}

export function matchSponsoredSentinel(text, sentinelWords = []) {
  const lowered = String(text).toLowerCase();
  const candidates = [...new Set([...SPONSORED_SENTINELS, ...sentinelWords].map((word) => String(word).toLowerCase()))];
  for (const token of candidates) {
    if (token && lowered.includes(token)) {
      return token;
    }
  }
  return null;
}

export function hasTypographyNoise(text) {
  return /[!?]{3,}|\.{4,}/.test(String(text));
}

export function extractStrings(payload) {
  const result = [];
  const walk = (value) => {
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (text) {
        result.push(text);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (typeof value === "object") {
      for (const item of Object.values(value)) {
        walk(item);
      }
    }
  };

  walk(payload);
  return result;
}

export function normalizeContentCard(card) {
  if (card && typeof card === "object" && !Array.isArray(card)) {
    return {
      title: String(card.title ?? "").trim(),
      excerpt: String(card.excerpt ?? "").trim(),
      publisher: String(card.publisher ?? "").trim(),
    };
  }
  const [title = "", excerpt = "", publisher = ""] = [...extractStrings(card), "", "", ""];
  return {
    title: String(title).trim(),
    excerpt: String(excerpt).trim(),
    publisher: String(publisher).trim(),
  };
}

export function extractCardStrings(card) {
  const normalized = normalizeContentCard(card);
  const values = [normalized.title, normalized.excerpt, normalized.publisher].filter(Boolean);
  if (values.length) {
    return values;
  }
  return extractStrings(card);
}

function scoreLine(line, weights, { allowTitleFragment = true } = {}) {
  let score = 0;
  const matches = [];
  const breakdown = {};
  const count = String(line).split(EM_DASH).length - 1;

  if (count === 0) {
    if (!allowTitleFragment) {
      return { score, matches, breakdown };
    }
    if (isTitleFragment(line)) {
      const penalty = Number(weights.title_fragment ?? 0);
      if (penalty) {
        score += penalty;
        matches.push("title_fragment");
        breakdown.title_fragment = penalty;
      }
    }
    return { score, matches, breakdown };
  }

  const parts = String(line).split(SERIAL_SPLIT_RE).map((part) => part.trim());
  if (parts.length === 3 && looksParenthetical(parts[1])) {
    const penalty = Number(weights.parenthetical_dash ?? 0);
    score += penalty;
    matches.push("dash_parenthetical");
    breakdown.dash_parenthetical = penalty;
    return { score, matches, breakdown };
  }

  if (parts.length >= 3 && !parts.some((part) => !part)) {
    if (parts.slice(0, -1).every((part) => wordCount(part) <= 10)) {
      const penalty = Number(weights.serial_dash ?? 0) + Math.max(0, parts.length - 3) * Number(weights.serial_dash_step ?? 0);
      score += penalty;
      matches.push("dash_serial");
      breakdown.dash_serial = penalty;
      return { score, matches, breakdown };
    }
  }

  if (count === 1) {
    const listMatch = String(line).match(LIST_MARKER_RE);
    if (listMatch) {
      const body = listMatch.groups?.body ?? "";
      if ((body.split(EM_DASH).length - 1) === 1) {
        const [label] = body.split(EM_DASH).map((part) => part.trim());
        if (looksDescriptor(label)) {
          const penalty = Number(weights.list_descriptor_dash ?? 0);
          score += penalty;
          matches.push("dash_list_descriptor");
          breakdown.dash_list_descriptor = penalty;
          return { score, matches, breakdown };
        }
      }
    }

    const [left, right] = String(line).split(EM_DASH).map((part) => part.trim());
    if (looksHeadingStyle(left, right, line)) {
      const penalty = Number(weights.heading_style_dash ?? 0);
      score += penalty;
      matches.push("dash_heading_style");
      breakdown.dash_heading_style = penalty;
      return { score, matches, breakdown };
    }
    if (shouldUseColon(left, right)) {
      const penalty = Number(weights.colon_candidate_dash ?? 0);
      score += penalty;
      matches.push("dash_colon_candidate");
      breakdown.dash_colon_candidate = penalty;
      return { score, matches, breakdown };
    }
    if (shouldUseComma(right)) {
      const penalty = Number(weights.comma_candidate_dash ?? 0);
      score += penalty;
      matches.push("dash_comma_candidate");
      breakdown.dash_comma_candidate = penalty;
      return { score, matches, breakdown };
    }

    const penalty = Number(weights.single_dash_fallback ?? 0);
    score += penalty;
    matches.push("dash_fallback");
    breakdown.dash_fallback = penalty;
    return { score, matches, breakdown };
  }

  const penalty = Number(weights.multi_dash_fallback ?? 0) + Math.max(0, count - 2) * Number(weights.multi_dash_step ?? 0);
  score += penalty;
  matches.push("dash_multi_fallback");
  breakdown.dash_multi_fallback = penalty;
  return { score, matches, breakdown };
}

function buildRegex(pattern) {
  if (!pattern) {
    return null;
  }
  return new RegExp(pattern);
}

function scoreSingleField(text, rules, field) {
  const weights = rules.weights ?? {};
  const headlineLikePattern = buildRegex(rules.regex_patterns?.headline_like);
  let score = 0;
  const matches = [];
  const breakdown = {};

  if (!text) {
    return { score, matches, breakdown };
  }

  const adToken = matchAdLayoutToken(text);
  if (adToken !== null) {
    const penalty = Number(weights.exact_ad_layout_token ?? 100);
    score += penalty;
    matches.push(`layout:${adToken}`);
    breakdown[`layout:${adToken}`] = penalty;
  }

  const sentinel = matchSponsoredSentinel(text, rules.sentinel_words ?? []);
  if (sentinel !== null) {
    const penalty = Number(weights.sponsored_sentinel ?? 35);
    score += penalty;
    matches.push(`sentinel:${sentinel}`);
    breakdown[`sentinel:${sentinel}`] = penalty;
  }

  if (hasTypographyNoise(text)) {
    const penalty = Number(weights.typography_noise ?? 0);
    if (penalty) {
      score += penalty;
      matches.push("typography_noise");
      breakdown.typography_noise = (breakdown.typography_noise ?? 0) + penalty;
    }
  }

  if (headlineLikePattern) {
    const stripped = String(text).trim().replace(/^[\"'“”‘’()\[\]{}]+|[\"'“”‘’()\[\]{}]+$/g, "");
    if (stripped && headlineLikePattern.test(stripped)) {
      const penalty = Number(weights.headline_like ?? 0);
      if (penalty) {
        score += penalty;
        matches.push("headline_like");
        breakdown.headline_like = (breakdown.headline_like ?? 0) + penalty;
      }
    }
  }

  const lineResult = scoreLine(text, weights, { allowTitleFragment: field !== "publisher" });
  score += lineResult.score;
  matches.push(...lineResult.matches);
  for (const [key, value] of Object.entries(lineResult.breakdown)) {
    breakdown[key] = (breakdown[key] ?? 0) + value;
  }

  return { score, matches, breakdown };
}

function scoreTextFields(fields, rules) {
  let score = 0;
  const matches = [];
  const breakdown = {};

  for (const [field, text] of fields) {
    const fieldResult = scoreSingleField(text, rules, field);
    score += fieldResult.score;
    matches.push(...fieldResult.matches);
    for (const [key, value] of Object.entries(fieldResult.breakdown)) {
      breakdown[key] = (breakdown[key] ?? 0) + value;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const thresholds = rules.thresholds ?? DEFAULT_THRESHOLDS;
  const human = Number(thresholds.human ?? DEFAULT_THRESHOLDS.human);
  const suspect = Number(thresholds.suspect ?? DEFAULT_THRESHOLDS.suspect);
  const bucket = score < human ? "Human" : score < suspect ? "Suspect (Highlight)" : "High Probability Slop (Block)";
  return { score, bucket, matchedRules: matches, breakdown };
}

export function scoreText(text, rules = {}) {
  const result = scoreTextFields([["text", text]], rules);
  return result;
}

export function scoreContentCard(card, rules = {}) {
  const normalized = normalizeContentCard(card);
  const fields = [
    ["title", normalized.title],
    ["excerpt", normalized.excerpt],
    ["publisher", normalized.publisher],
  ];
  if (fields.some(([, text]) => text)) {
    return scoreTextFields(fields, rules);
  }
  return scoreTextFields(extractCardStrings(normalized).map((text) => ["text", text]), rules);
}
