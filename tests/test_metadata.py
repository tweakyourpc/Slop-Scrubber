from src.filters.metadata import match_ad_layout_token, match_sponsored_sentinel


def test_match_ad_layout_token_requires_contiguous_token() -> None:
    assert match_ad_layout_token("AmazonSponsored") == "AmazonSponsored"
    assert match_ad_layout_token("Amazon is Sponsored") is None


def test_match_sponsored_sentinel_uses_expanded_native_labels() -> None:
    assert match_sponsored_sentinel("Forbes BrandVoice | Paid Program") == "brandvoice"
    assert match_sponsored_sentinel("Presented by Peacock") == "presented by"
    assert match_sponsored_sentinel("Researchers suggested a new approach") is None
