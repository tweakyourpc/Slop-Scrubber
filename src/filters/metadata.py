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
    "forbes councils",
    "forbes business council",
    "community voices",
    "brand publisher",
    "brandstudio",
    "brand studio",
    "brand studios",
    "forbes insights",
    "cnn digital studios",
    "atlantic re:think",
    "t brand studio",
    "wsj. custom studios",
    "quartz creative",
    "time edge",
    "nyt advertising",
    "wp brandstudio",
    "condé nast spire",
    "conde nast spire",
    "hearst made",
    "meredith xcelerate",
    "dotdash meredith performance marketing",
    "vox creative",
    "vice virtue",
    "refinery29 lifestyle studio",
    "buzzfeed commerce",
    "presented by",
    "advertiser content",
    "paid advertisement",
    "advertisement",
    "paid content",
    "native ad",
    "paid post",
    "from our sponsors",
    "from our partners",
    "brought to you by",
    "powered by",
    "in association with",
    "outbrain engage",
    "taboola feed",
    "revcontent",
    "mgid",
    "nativo",
    "triplelift",
    "sharethrough",
    "zemanta",
    "content.ad",
    "zergnet",
    "ads by",
    "ad by",
    "via taboola",
    "via outbrain",
    "via revcontent",
    "as an amazon associate",
    "through our links",
    "via our links",
    "may earn a commission",
    "may receive compensation",
    "affiliate link",
    "affiliate disclosure",
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
