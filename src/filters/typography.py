"""Typography heuristics inspired by prose hygiene."""

from __future__ import annotations

import re


def has_typography_noise(text: str) -> bool:
    checks = (
        r"[!?]{3,}",
        r"\.{4,}",
    )
    return any(re.search(pattern, text) for pattern in checks)
