import assert from "node:assert/strict";
import {
  scoreText,
  scoreContentCard,
  matchAdLayoutToken,
  matchSponsoredSentinel,
  hasTypographyNoise,
} from "../src/extension/scorer.js";

async function run(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const thresholds = { human: 25, suspect: 60 };

await run("sponsored layout tokens block content", () => {
  const rules = {
    thresholds,
    weights: { exact_ad_layout_token: 100, sponsored_sentinel: 35 },
  };

  const result = scoreContentCard(
    { title: "Popular Today", excerpt: "Sponsored deal inside", publisher: "AmazonSponsored" },
    rules,
  );

  assert.equal(result.score, 100);
  assert.equal(result.bucket, "High Probability Slop (Block)");
  assert.ok(result.matchedRules.includes("layout:AmazonSponsored"));
});

await run("title fragment rule still scores compact titles", () => {
  const rules = {
    thresholds,
    weights: {
      title_fragment: 6,
      comma_candidate_dash: 10,
      single_dash_fallback: 10,
    },
  };

  const result = scoreText("10 Hacks Every Microsoft Outlook User Should Know", rules);

  assert.ok(result.score >= 6);
  assert.ok(["Human", "Suspect (Highlight)", "High Probability Slop (Block)"].includes(result.bucket));
});

await run("listicle style can reach suspect bucket", () => {
  const rules = {
    thresholds,
    weights: {
      title_fragment: 6,
      headline_like: 8,
      comma_candidate_dash: 10,
      typography_noise: 8,
      exact_ad_layout_token: 100,
      sponsored_sentinel: 35,
    },
    regex_patterns: { headline_like: "^(\\d+\\s+)[A-Z]" },
  };

  const result = scoreContentCard(
    {
      title: "10 Hacks Every Microsoft Outlook User Should Know — and why it matters....",
      excerpt: "",
      publisher: "Lifehacker",
    },
    rules,
  );

  assert.ok(result.score >= 25);
  assert.equal(result.bucket, "Suspect (Highlight)");
});

await run("metadata helpers preserve sponsored matching semantics", () => {
  assert.equal(matchAdLayoutToken("AmazonSponsored"), "AmazonSponsored");
  assert.equal(matchAdLayoutToken("Amazon is Sponsored"), null);
  assert.equal(matchSponsoredSentinel("House Promo: a local feature", ["house promo"]), "house promo");
  assert.equal(matchSponsoredSentinel("Forbes BrandVoice | Paid Program"), "brandvoice");
  assert.equal(matchSponsoredSentinel("Presented by Peacock"), "presented by");
  assert.equal(matchSponsoredSentinel("Researchers suggested a new approach"), null);
});

await run("typography noise excludes em dash and catches punctuation clusters", () => {
  assert.equal(hasTypographyNoise("Quick Guide — Get Started"), false);
  assert.equal(hasTypographyNoise("Buy now!!!"), true);
  assert.equal(hasTypographyNoise("Wait...."), true);
});

await run("headline_like ignores normal human sentences", () => {
  const rules = {
    thresholds,
    weights: { headline_like: 8 },
    regex_patterns: { headline_like: "^(\\d+\\s+)[A-Z]" },
  };

  for (const text of [
    "Scientists discover a new species of deep sea fish.",
    "The budget was approved by Congress last Tuesday.",
    "How to make sourdough bread at home",
    "10 habits of highly effective people",
  ]) {
    const result = scoreText(text, rules);
    assert.equal(result.score, 0);
    assert.equal(result.matchedRules.includes("headline_like"), false);
  }
});

await run("headline_like flags capitalized numbered listicles", () => {
  const rules = {
    thresholds,
    weights: { headline_like: 8 },
    regex_patterns: { headline_like: "^(\\d+\\s+)[A-Z]" },
  };

  const result = scoreText("10 Habits of Highly Effective People", rules);
  assert.equal(result.score, 8);
  assert.equal(result.matchedRules.includes("headline_like"), true);
});

await run("headline patterns flag non-numeric clickbait", () => {
  const rules = {
    thresholds,
    weights: {
      headline_why_wrong: 18,
      headline_you_wont_believe: 20,
      headline_what_it_means_for_you: 12,
    },
    regex_patterns: {
      headline_why_wrong: "^[Ww]hy\\s+everything\\s+you\\s+know\\s+about\\s+.+\\s+(?:is|are)\\s+wrong\\b",
      headline_you_wont_believe: "^[Yy]ou\\s+won['’]?t\\s+believe\\b.+",
      headline_what_it_means_for_you: "^[Ww]hat\\s+(?:this|it)\\s+means\\s+for\\s+you\\b.+",
    },
  };

  const cases = [
    ["Why everything you know about hydration is wrong", "headline_why_wrong", 18],
    ["You won't believe what happened after the update", "headline_you_wont_believe", 20],
    ["What this means for you as a borrower", "headline_what_it_means_for_you", 12],
  ];

  for (const [text, expectedRule, expectedScore] of cases) {
    const result = scoreText(text, rules);
    assert.equal(result.score, expectedScore);
    assert.equal(result.matchedRules.includes(expectedRule), true);
  }
});

await run("headline patterns avoid broad false positives", () => {
  const rules = {
    thresholds,
    weights: {
      headline_why_wrong: 18,
      headline_this_is_why: 10,
      headline_heres_what: 10,
    },
    regex_patterns: {
      headline_why_wrong: "^[Ww]hy\\s+everything\\s+you\\s+know\\s+about\\s+.+\\s+(?:is|are)\\s+wrong\\b",
      headline_this_is_why: "^[Tt]his\\s+is\\s+why\\s+(?:you\\b|your\\b|everyone\\b|nobody\\b|the\\s+(?:internet|world|media)\\b).+",
      headline_heres_what: "^[Hh]ere(?:['’])?[Ss]\\s+what\\s+(?:happens|you\\s+(?:need|should)\\s+know|nobody\\s+tells\\s+you|to\\s+know)\\b.+",
    },
  };

  for (const text of [
    "Why everything we know about climate models is still evolving",
    "This is why the merger failed after two quarters",
    "Here's what happened at the city council meeting",
  ]) {
    const result = scoreText(text, rules);
    assert.equal(result.score, 0);
    assert.deepEqual(result.matchedRules, []);
  }
});

await run("title_fragment does not score publisher names", () => {
  const rules = {
    thresholds,
    weights: { title_fragment: 6 },
  };

  for (const publisher of ["BBC News", "Reuters", "The Guardian", "Science Daily"]) {
    const result = scoreContentCard(
      {
        title: "ordinary sentence with lowercase words.",
        excerpt: "another normal excerpt with lowercase words.",
        publisher,
      },
      rules,
    );
    assert.equal(result.score, 0);
    assert.equal(result.matchedRules.includes("title_fragment"), false);
  }
});

if (process.exitCode) {
  console.error("Some tests failed");
} else {
  console.log("All tests passed");
}
