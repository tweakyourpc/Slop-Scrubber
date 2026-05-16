from src.core.scorer import score_content_card, score_text


def test_score_content_card_flags_sponsored_layout_tokens() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"exact_ad_layout_token": 100, "sponsored_sentinel": 35},
    }

    result = score_content_card(
        {"title": "Popular Today", "excerpt": "Sponsored deal inside", "publisher": "AmazonSponsored"},
        rules,
    )

    assert result.score == 100
    assert result.bucket == "High Probability Slop (Block)"
    assert "layout:AmazonSponsored" in result.matched_rules


def test_score_text_uses_exact_dash_heuristics() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {
            "title_fragment": 6,
            "comma_candidate_dash": 10,
            "single_dash_fallback": 10,
        },
    }

    result = score_text("10 Hacks Every Microsoft Outlook User Should Know", rules)

    assert result.score >= 6
    assert result.bucket in {"Human", "Suspect (Highlight)", "High Probability Slop (Block)"}


def test_score_content_card_promotes_listicle_style_to_suspect() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {
            "title_fragment": 6,
            "headline_like": 8,
            "comma_candidate_dash": 10,
            "typography_noise": 8,
            "exact_ad_layout_token": 100,
            "sponsored_sentinel": 35,
        },
        "regex_patterns": {"headline_like": r"^(\d+\s+)[A-Z]"},
    }

    result = score_content_card(
        {
            "title": "10 Hacks Every Microsoft Outlook User Should Know — and why it matters....",
            "excerpt": "",
            "publisher": "Lifehacker",
        },
        rules,
    )

    assert result.score >= 25
    assert result.bucket == "Suspect (Highlight)"


def test_headline_like_ignores_normal_sentences() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"headline_like": 8},
        "regex_patterns": {"headline_like": r"^(\d+\s+)[A-Z]"},
    }

    for text in (
        "Scientists discover a new species of deep sea fish.",
        "The budget was approved by Congress last Tuesday.",
        "How to make sourdough bread at home",
    ):
        result = score_text(text, rules)
        assert result.score == 0
        assert "headline_like" not in result.matched_rules


def test_headline_like_flags_numbered_listicle() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"headline_like": 8},
        "regex_patterns": {"headline_like": r"^(\d+\s+)[A-Z]"},
    }

    result = score_text("10 Habits of Highly Effective People", rules)
    assert result.score == 8
    assert "headline_like" in result.matched_rules


def test_title_fragment_does_not_score_publisher_names() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"title_fragment": 6},
    }

    for publisher in ("BBC News", "Reuters", "The Guardian", "Science Daily"):
        result = score_content_card(
            {
                "title": "ordinary sentence with lowercase words.",
                "excerpt": "another normal excerpt with lowercase words.",
                "publisher": publisher,
            },
            rules,
        )
        assert result.score == 0
        assert "title_fragment" not in result.matched_rules
