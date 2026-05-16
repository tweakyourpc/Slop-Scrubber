from src.filters.metadata import match_ad_layout_token


def test_match_ad_layout_token_requires_contiguous_token() -> None:
    assert match_ad_layout_token("AmazonSponsored") == "AmazonSponsored"
    assert match_ad_layout_token("Amazon is Sponsored") is None
