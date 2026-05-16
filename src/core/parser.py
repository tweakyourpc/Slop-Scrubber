"""Extract raw text candidates from incoming DOM-like objects."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Mapping


CARD_FIELDS = ("title", "excerpt", "publisher")


@dataclass(frozen=True)
class ContentCard:
    title: str = ""
    excerpt: str = ""
    publisher: str = ""


def extract_strings(payload: Any) -> list[str]:
    """Return a flat list of strings found in nested payloads.

    This is intentionally permissive so it can handle DOM snapshots, dicts,
    lists, and plain text without needing browser-specific types.
    """
    result: list[str] = []

    def walk(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, str):
            text = value.strip()
            if text:
                result.append(text)
            return
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
            return
        if isinstance(value, Iterable):
            for item in value:
                walk(item)
            return

    walk(payload)
    return result


def extract_card_strings(card: Any) -> list[str]:
    """Extract the canonical fields from a single content card."""
    if isinstance(card, Mapping):
        values = []
        for field in CARD_FIELDS:
            value = card.get(field, "")
            if isinstance(value, str):
                text = value.strip()
                if text:
                    values.append(text)
        if values:
            return values
    if isinstance(card, ContentCard):
        values = [card.title.strip(), card.excerpt.strip(), card.publisher.strip()]
        return [value for value in values if value]
    return extract_strings(card)


def normalize_content_card(card: Any) -> ContentCard:
    """Coerce a card-like payload into a stable content-card shape."""
    if isinstance(card, Mapping):
        return ContentCard(
            title=str(card.get("title", "")).strip(),
            excerpt=str(card.get("excerpt", "")).strip(),
            publisher=str(card.get("publisher", "")).strip(),
        )

    strings = extract_strings(card)
    padded = (strings + ["", "", ""])[:3]
    return ContentCard(title=padded[0], excerpt=padded[1], publisher=padded[2])
