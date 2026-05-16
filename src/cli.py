"""Command line entry point for Slop-Scrubber."""

from __future__ import annotations

import argparse
import json
from importlib import resources
from pathlib import Path
from typing import Sequence

from .core.scorer import load_rules, score_content_card, score_text


def _default_rules() -> dict:
    cwd_rules = Path("config/rules.json")
    if cwd_rules.exists():
        return load_rules(cwd_rules)
    with resources.files("src").joinpath("default_rules.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def _rules_from_args(path: str | None) -> dict:
    if path:
        return load_rules(path)
    return _default_rules()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="slop-scrubber")
    subparsers = parser.add_subparsers(dest="command", required=True)

    score = subparsers.add_parser("score", help="score a text blob or content card")
    score.add_argument("--rules", help="path to a rules.json file")
    score.add_argument("--text", help="raw text to score")
    score.add_argument("--title", help="card title")
    score.add_argument("--excerpt", default="", help="card excerpt")
    score.add_argument("--publisher", default="", help="card publisher")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    rules = _rules_from_args(args.rules)

    if args.command == "score":
        if args.text:
            result = score_text(args.text, rules)
        elif args.title:
            result = score_content_card(
                {"title": args.title, "excerpt": args.excerpt, "publisher": args.publisher},
                rules,
            )
        else:
            parser.error("score requires --text or --title")

        print(json.dumps({
            "score": result.score,
            "bucket": result.bucket,
            "matched_rules": result.matched_rules,
            "breakdown": result.breakdown,
        }, sort_keys=True))
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
