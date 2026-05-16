"""Build a self-contained Chrome extension directory."""

from __future__ import annotations

import shutil
import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "extension"
RULES = ROOT / "config" / "rules.json"
OUTPUT = ROOT / "dist" / "extension"
EXCLUDED_NAMES = {"package.json", "__init__.py"}
EXCLUDED_PARTS = {"__pycache__"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}


def _should_copy(source: Path) -> bool:
    if not source.is_file():
        return False
    if source.name in EXCLUDED_NAMES or source.suffix in EXCLUDED_SUFFIXES:
        return False
    return not any(part in EXCLUDED_PARTS for part in source.parts)


def _copy_tree() -> list[Path]:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)

    copied: list[Path] = []
    for source in SOURCE.rglob("*"):
        if not _should_copy(source):
            continue
        relative = source.relative_to(SOURCE)
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied.append(target)
    return copied


def _write_rules(copied: list[Path]) -> None:
    target = OUTPUT / "config" / "rules.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(RULES, target)
    copied.append(target)


def _copy_plan() -> list[tuple[Path, Path]]:
    planned: list[tuple[Path, Path]] = []
    for source in SOURCE.rglob("*"):
        if not _should_copy(source):
            continue
        relative = source.relative_to(SOURCE)
        planned.append((source, OUTPUT / relative))
    planned.append((RULES, OUTPUT / "config" / "rules.json"))
    return planned


def _check_staleness() -> int:
    if not OUTPUT.exists():
        print(f"{OUTPUT.relative_to(ROOT)} does not exist; run python scripts/build_extension.py", flush=True)
        return 1

    stale: list[Path] = []
    missing: list[Path] = []
    for source, target in _copy_plan():
        if not target.exists():
            missing.append(target)
            continue
        if source.stat().st_mtime > target.stat().st_mtime:
            stale.append(source)

    if missing or stale:
        for path in missing:
            print(f"missing: {path.relative_to(ROOT)}")
        for path in stale:
            print(f"stale: {path.relative_to(ROOT)}")
        return 1

    print("dist/extension/ is up to date")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="check for staleness without rebuilding")
    args = parser.parse_args()

    if args.check:
        return _check_staleness()

    copied = _copy_tree()
    _write_rules(copied)

    print(f"Built extension at {OUTPUT}")
    print(f"Copied {len(copied)} files")
    for path in sorted(copied):
        print(path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
