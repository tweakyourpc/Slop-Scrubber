"""Check Python and JavaScript scorer parity."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "config" / "rules.json"
SCORER_PATH = ROOT / "src" / "extension" / "scorer.js"

sys.path.insert(0, str(ROOT))

from src.core.scorer import score_content_card  # noqa: E402


FIXTURES = [
    {
        "name": "clean human card",
        "input": {
            "title": "Scientists discover a new species of deep sea fish.",
            "excerpt": "The discovery was confirmed after a survey last Tuesday.",
            "publisher": "Science Daily",
        },
        "expected_bucket": "Human",
        "expected_score": 0,
    },
    {
        "name": "sponsored layout token",
        "input": {
            "title": "Popular Today",
            "excerpt": "Sponsored deal inside",
            "publisher": "AmazonSponsored",
        },
        "expected_bucket": "High Probability Slop (Block)",
    },
    {
        "name": "numbered listicle title",
        "input": {
            "title": "10 Habits of Highly Effective People",
            "excerpt": "",
            "publisher": "Example",
        },
    },
    {
        "name": "brandvoice label",
        "input": {
            "title": "Forbes BrandVoice | Paid Program",
            "excerpt": "",
            "publisher": "Forbes",
        },
        "expected_bucket": "Suspect (Highlight)",
        "expected_rules": ["sentinel:brandvoice"],
    },
    {
        "name": "em dash heading style",
        "input": {
            "title": "Quick Guide — Get Started",
            "excerpt": "",
            "publisher": "Docs",
        },
    },
    {
        "name": "typography noise",
        "input": {
            "title": "Buy now!!!",
            "excerpt": "",
            "publisher": "Example",
        },
    },
    {
        "name": "custom sentinel word",
        "input": {
            "title": "House Promo",
            "excerpt": "A local feature",
            "publisher": "Example",
        },
        "sentinel_words": ["house promo"],
    },
    {
        "name": "non-numeric clickbait title",
        "input": {
            "title": "You won't believe what happened after the update",
            "excerpt": "",
            "publisher": "Example",
        },
        "expected_bucket": "Human",
        "expected_rules": ["headline_you_wont_believe"],
    },
    {
        "name": "parenthetical dash",
        "input": {
            "title": "The policy — which is still under review — changed today",
            "excerpt": "",
            "publisher": "Reuters",
        },
        "expected_bucket": "Human",
        "expected_rules": ["dash_parenthetical"],
    },
    {
        "name": "serial dash chain",
        "input": {
            "title": "Plan — Build — Ship",
            "excerpt": "",
            "publisher": "Example",
        },
        "expected_bucket": "Human",
        "expected_rules": ["dash_serial"],
    },
    {
        "name": "comma candidate dash",
        "input": {
            "title": "She left — but not before finishing",
            "excerpt": "",
            "publisher": "Example",
        },
        "expected_bucket": "Human",
        "expected_rules": ["dash_comma_candidate"],
    },
    {
        "name": "multi-field card - title and excerpt both score",
        "input": {
            "title": "10 Habits of Highly Effective People",
            "excerpt": "Quick Guide — Get Started",
            "publisher": "Example",
        },
        "expected_bucket": "Suspect (Highlight)",
        "expected_rules": ["headline_like", "title_fragment", "dash_heading_style"],
    },
    {
        "name": "numbered listicle with lowercase title",
        "input": {
            "title": "10 habits of highly effective people",
            "excerpt": "",
            "publisher": "Example",
        },
        "expected_bucket": "Human",
        "expected_score": 0,
    },
]


def _load_rules() -> dict:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def _python_result(card: dict, rules: dict) -> dict:
    result = score_content_card(card, rules)
    return {
        "score": result.score,
        "bucket": result.bucket,
        "matched_rules": result.matched_rules,
    }


def _js_result(card: dict, rules: dict) -> dict:
    script = """
import { pathToFileURL } from 'node:url';

const { scoreContentCard } = await import(pathToFileURL(process.argv[1]).href);
const card = JSON.parse(process.argv[2]);
const rules = JSON.parse(process.argv[3]);
const result = scoreContentCard(card, rules);
console.log(JSON.stringify({
  score: result.score,
  bucket: result.bucket,
  matched_rules: result.matchedRules
}));
"""
    completed = subprocess.run(
        [
            "node",
            "--input-type=module",
            "--eval",
            script,
            str(SCORER_PATH),
            json.dumps(card),
            json.dumps(rules),
        ],
        check=True,
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)


def main() -> int:
    base_rules = _load_rules()
    failures: list[str] = []

    for fixture in FIXTURES:
        rules = dict(base_rules)
        if "sentinel_words" in fixture:
            rules["sentinel_words"] = fixture["sentinel_words"]

        py_result = _python_result(fixture["input"], rules)
        js_result = _js_result(fixture["input"], rules)

        if py_result != js_result:
            failures.append(
                f"{fixture['name']}: python={py_result} js={js_result}"
            )
            continue

        expected_bucket = fixture.get("expected_bucket")
        if expected_bucket is not None and py_result["bucket"] != expected_bucket:
            failures.append(
                f"{fixture['name']}: expected bucket {expected_bucket}, got {py_result['bucket']}"
            )
            continue

        expected_score = fixture.get("expected_score")
        if expected_score is not None and py_result["score"] != expected_score:
            failures.append(
                f"{fixture['name']}: expected score {expected_score}, got {py_result['score']}"
            )
            continue

        expected_rules = fixture.get("expected_rules", [])
        missing_rules = [
            rule for rule in expected_rules if rule not in py_result["matched_rules"]
        ]
        if missing_rules:
            failures.append(
                f"{fixture['name']}: missing expected rules {missing_rules}, got {py_result['matched_rules']}"
            )
            continue

        print(f"ok  {fixture['name']} -> {py_result['score']} {py_result['bucket']}")

    if failures:
        print("Parity check failed:", file=sys.stderr)
        for failure in failures:
            print(f"FAIL  {failure}", file=sys.stderr)
        return 1

    print(f"All {len(FIXTURES)} fixture pairs match")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
