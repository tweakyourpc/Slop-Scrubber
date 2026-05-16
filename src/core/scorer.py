"""Compute a deterministic Slop Score Index using local heuristics."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..filters.metadata import match_ad_layout_token, match_sponsored_sentinel
from ..filters.typography import has_typography_noise
from .parser import extract_card_strings, normalize_content_card


EM_DASH = "\u2014"
LIST_MARKER_RE = re.compile(r"^(?P<lead>\s*(?:[-*+]\s+|\d+\.\s+))(?P<body>.+)$")
SERIAL_SPLIT_RE = re.compile(r"\s*—\s*")
TRANSITION_PREFIXES = (
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
)
PARENTHETICAL_PREFIXES = (
    "as ",
    "which ",
    "who ",
    "whose ",
    "where ",
    "when ",
    "while ",
    "with ",
    "without ",
)
COLON_CUE_RE = re.compile(
    r"\b(is|are|was|were|means|meant|remains|remained|looks|looked|sounds|sounded|feels|felt|goal|result|plan|rule)\b",
    re.IGNORECASE,
)
ACTION_PREFIXES = (
    "by ",
    "just ",
    "paste ",
    "review ",
    "run ",
    "set up ",
    "to ",
    "use ",
)
SHORT_LABEL_TERMS = frozenset(
    {
        "guide",
        "logic",
        "priority",
        "reference",
        "sheet",
        "status",
        "tab",
        "tiers",
        "values",
    }
)

DEFAULT_THRESHOLDS = {
    "human": 25,
    "suspect": 60,
}


@dataclass(frozen=True)
class ScoreBreakdown:
    score: int
    bucket: str
    matched_rules: list[str]

@dataclass(frozen=True)
class ScoreResult:
    score: int
    bucket: str
    matched_rules: list[str]
    breakdown: dict[str, int]


def load_rules(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _word_count(text: str) -> int:
    return len(text.split())


def _looks_parenthetical(middle: str) -> bool:
    lowered = middle.strip().lower()
    return (
        2 <= _word_count(middle) <= 14
        and not middle.endswith((".", "!", "?"))
        and any(lowered.startswith(prefix) for prefix in PARENTHETICAL_PREFIXES)
    )


def _looks_descriptor(label: str) -> bool:
    if _word_count(label) > 6:
        return False
    lowered = f" {label.lower()} "
    return not any(token in lowered for token in (" is ", " are ", " was ", " were ", " has ", " have "))


def _should_use_comma(right: str) -> bool:
    lowered = right.strip().lower()
    return any(lowered.startswith(prefix) for prefix in TRANSITION_PREFIXES)


def _should_use_colon(left: str, right: str) -> bool:
    right_lower = right.strip().lower()
    if "=" in right and 1 <= _word_count(left) <= 5:
        return True
    if "=" in left and 1 <= _word_count(right) <= 4:
        return True
    if any(right_lower.startswith(prefix) for prefix in ACTION_PREFIXES):
        return bool(COLON_CUE_RE.search(left))
    if right_lower.startswith(("for example", "namely", "specifically")):
        return True
    return False


def _is_title_fragment(text: str) -> bool:
    words = [word for word in re.split(r"\s+", text.strip()) if word]
    if not words or len(words) > 8:
        return False
    for word in words:
        stripped = word.strip("()[]{}:;,.'\"")
        if not stripped:
            continue
        if stripped[0].isdigit():
            continue
        if stripped[0].isupper():
            continue
        if stripped.lower() in {"and", "of", "the", "for", "in", "to", "&"}:
            continue
        return False
    return True


def _looks_heading_style(left: str, right: str, line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped != line:
        return False
    if stripped.endswith((".", "!", "?", ":", ";")):
        return False
    if "\t" in stripped or stripped.startswith(("-", "*", "+")):
        return False
    if left.lower().startswith("step ") and 1 <= _word_count(right) <= 10:
        return True
    if _is_title_fragment(left) and _is_title_fragment(right):
        return True
    left_words = left.split()
    if 1 <= len(left_words) <= 5 and left_words[-1].lower() in SHORT_LABEL_TERMS:
        return True
    return False


def _score_line(
    line: str,
    weights: dict[str, int],
    *,
    allow_title_fragment: bool = True,
) -> tuple[int, list[str], dict[str, int]]:
    score = 0
    matches: list[str] = []
    breakdown: dict[str, int] = {}
    count = line.count(EM_DASH)

    if count == 0:
        if not allow_title_fragment:
            return score, matches, breakdown
        if _is_title_fragment(line):
            penalty = int(weights.get("title_fragment", 0))
            if penalty:
                score += penalty
                matches.append("title_fragment")
                breakdown["title_fragment"] = penalty
        return score, matches, breakdown

    parts = [part.strip() for part in SERIAL_SPLIT_RE.split(line)]
    if len(parts) == 3 and _looks_parenthetical(parts[1]):
        penalty = int(weights.get("parenthetical_dash", 0))
        score += penalty
        matches.append("dash_parenthetical")
        breakdown["dash_parenthetical"] = penalty
        return score, matches, breakdown

    if len(parts) >= 3 and not any(not part for part in parts):
        if all(_word_count(part) <= 10 for part in parts[:-1]):
            penalty = int(weights.get("serial_dash", 0)) + max(0, len(parts) - 3) * int(
                weights.get("serial_dash_step", 0)
            )
            score += penalty
            matches.append("dash_serial")
            breakdown["dash_serial"] = penalty
            return score, matches, breakdown

    if count == 1:
        list_match = LIST_MARKER_RE.match(line)
        if list_match is not None:
            body = list_match.group("body")
            if body.count(EM_DASH) == 1:
                label, detail = [part.strip() for part in body.split(EM_DASH, 1)]
                if _looks_descriptor(label):
                    penalty = int(weights.get("list_descriptor_dash", 0))
                    score += penalty
                    matches.append("dash_list_descriptor")
                    breakdown["dash_list_descriptor"] = penalty
                    return score, matches, breakdown

        left, right = [part.strip() for part in line.split(EM_DASH, 1)]
        if _looks_heading_style(left, right, line):
            penalty = int(weights.get("heading_style_dash", 0))
            score += penalty
            matches.append("dash_heading_style")
            breakdown["dash_heading_style"] = penalty
            return score, matches, breakdown
        if _should_use_colon(left, right):
            penalty = int(weights.get("colon_candidate_dash", 0))
            score += penalty
            matches.append("dash_colon_candidate")
            breakdown["dash_colon_candidate"] = penalty
            return score, matches, breakdown
        if _should_use_comma(right):
            penalty = int(weights.get("comma_candidate_dash", 0))
            score += penalty
            matches.append("dash_comma_candidate")
            breakdown["dash_comma_candidate"] = penalty
            return score, matches, breakdown

        penalty = int(weights.get("single_dash_fallback", 0))
        score += penalty
        matches.append("dash_fallback")
        breakdown["dash_fallback"] = penalty
        return score, matches, breakdown

    penalty = int(weights.get("multi_dash_fallback", 0)) + max(0, count - 2) * int(weights.get("multi_dash_step", 0))
    score += penalty
    matches.append("dash_multi_fallback")
    breakdown["dash_multi_fallback"] = penalty
    return score, matches, breakdown


def _score_single_field(
    text: str,
    rules: dict,
    field: str,
) -> tuple[int, list[str], dict[str, int]]:
    weights = rules.get("weights", {})
    headline_like_pattern = rules.get("regex_patterns", {}).get("headline_like")
    score = 0
    matches: list[str] = []
    breakdown: dict[str, int] = {}

    if not text:
        return score, matches, breakdown

    ad_token = match_ad_layout_token(text)
    if ad_token is not None:
        penalty = int(weights.get("exact_ad_layout_token", 100))
        score += penalty
        matches.append(f"layout:{ad_token}")
        breakdown[f"layout:{ad_token}"] = penalty

    sentinel = match_sponsored_sentinel(text, rules.get("sentinel_words", []))
    if sentinel is not None:
        penalty = int(weights.get("sponsored_sentinel", 35))
        score += penalty
        matches.append(f"sentinel:{sentinel}")
        breakdown[f"sentinel:{sentinel}"] = penalty

    if has_typography_noise(text):
        penalty = int(weights.get("typography_noise", 0))
        if penalty:
            score += penalty
            matches.append("typography_noise")
            breakdown["typography_noise"] = breakdown.get("typography_noise", 0) + penalty

    if headline_like_pattern is not None:
        stripped = text.strip().strip("\"'“”‘’()[]{}")
        if stripped and re.search(headline_like_pattern, stripped):
            penalty = int(weights.get("headline_like", 0))
            if penalty:
                score += penalty
                matches.append("headline_like")
                breakdown["headline_like"] = breakdown.get("headline_like", 0) + penalty

    line_score, line_matches, line_breakdown = _score_line(
        text,
        weights,
        allow_title_fragment=field != "publisher",
    )
    score += line_score
    matches.extend(line_matches)
    for key, value in line_breakdown.items():
        breakdown[key] = breakdown.get(key, 0) + value

    return score, matches, breakdown


def _score_text_fields(fields: list[tuple[str, str]], rules: dict) -> tuple[ScoreBreakdown, dict[str, int]]:
    score = 0
    matches: list[str] = []
    breakdown: dict[str, int] = {}

    for field, text in fields:
        field_score, field_matches, field_breakdown = _score_single_field(text, rules, field)
        score += field_score
        matches.extend(field_matches)
        for key, value in field_breakdown.items():
            breakdown[key] = breakdown.get(key, 0) + value

    score = max(0, min(100, score))
    thresholds = rules.get("thresholds", DEFAULT_THRESHOLDS)
    human = int(thresholds.get("human", DEFAULT_THRESHOLDS["human"]))
    suspect = int(thresholds.get("suspect", DEFAULT_THRESHOLDS["suspect"]))
    if score < human:
        bucket = "Human"
    elif score < suspect:
        bucket = "Suspect (Highlight)"
    else:
        bucket = "High Probability Slop (Block)"
    return ScoreBreakdown(score=score, bucket=bucket, matched_rules=matches), breakdown


def score_text(text: str, rules: dict | None = None) -> ScoreResult:
    """Score a raw text blob."""
    rules = rules or {}
    score_breakdown, breakdown = _score_text_fields([("text", text)], rules)
    return ScoreResult(
        score=score_breakdown.score,
        bucket=score_breakdown.bucket,
        matched_rules=score_breakdown.matched_rules,
        breakdown=breakdown,
    )


def score_content_card(card: Any, rules: dict | None = None) -> ScoreResult:
    """Score a single content card deterministically."""
    rules = rules or {}
    normalized = normalize_content_card(card)
    fields = [
        ("title", normalized.title),
        ("excerpt", normalized.excerpt),
        ("publisher", normalized.publisher),
    ]
    if not any(text for _, text in fields):
        fields = [("text", text) for text in extract_card_strings(normalized)]
    score_breakdown, breakdown = _score_text_fields(fields, rules)
    return ScoreResult(
        score=score_breakdown.score,
        bucket=score_breakdown.bucket,
        matched_rules=score_breakdown.matched_rules,
        breakdown=breakdown,
    )
