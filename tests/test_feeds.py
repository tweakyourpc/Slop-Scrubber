from src.core.scorer import load_rules, score_text
from src.filters.typography import has_typography_noise


def test_score_text_honors_custom_sentinel_words() -> None:
    rules = {
        "sentinel_words": ["house promo"],
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"sponsored_sentinel": 35},
    }
    result = score_text("House Promo: a local feature", rules)
    assert result.score == 35
    assert "sentinel:house promo" in result.matched_rules


def test_score_text_flags_typography_noise() -> None:
    rules = {
        "thresholds": {"human": 25, "suspect": 60},
        "weights": {"typography_noise": 8},
    }
    result = score_text("ordinary sentence!!!....", rules)
    assert result.score == 8
    assert "typography_noise" in result.matched_rules


def test_typography_noise_does_not_flag_em_dash() -> None:
    assert not has_typography_noise("Quick Guide — Get Started")
    assert has_typography_noise("Buy now!!!")
    assert has_typography_noise("Wait....")


def test_rules_version_is_current() -> None:
    assert load_rules("config/rules.json")["version"] == 4
