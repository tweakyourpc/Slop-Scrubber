"""Structural token filters for metadata and sponsored labels."""

from __future__ import annotations


AD_LAYOUT_TOKENS = (
    "AmazonSponsored",
    "WalmartSponsored",
    "PocketSponsored",
    "SponsoredContent",
    "PromotedContent",
    "NativeAd",
)

SPONSORED_SENTINELS = (
    "paid partner content",
    "partner content",
    "brandvoice",
    "paid program",
    "brand publisher",
    "brandstudio",
    "presented by",
    "advertiser content",
    "paid content",
    "native ad",
    "paid post",
    "from our sponsors",
    "from our partners",
    "brought to you by",
    "in association with",
    "suggested post",
    "suggested for you",
    "around the web",
    "you may like",
    "sponsored",
    "promoted",
)


def match_ad_layout_token(text: str) -> str | None:
    """Return the first exact layout token found in raw UI text."""
    normalized = " ".join(text.split())
    for token in AD_LAYOUT_TOKENS:
        if token in normalized:
            return token
    return None


def match_sponsored_sentinel(text: str, sentinel_words: list[str] | None = None) -> str | None:
    """Return the first sentinel phrase found in lower-cased text."""
    lowered = text.lower()
    candidates = list(dict.fromkeys(
        str(token).lower() for token in (*SPONSORED_SENTINELS, *(sentinel_words or []))
    ))
    for token in candidates:
        if token and token in lowered:
            return token
    return None
