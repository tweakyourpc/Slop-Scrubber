# Contributing

## Python/JS Parity

Slop-Scrubber has two scorer implementations: `src/core/scorer.py` for Python and `src/extension/scorer.js` for the browser extension. Any change that affects scoring output in one implementation must be applied to the other implementation in the same change.

The two scorers must produce identical `score`, `bucket`, and matched-rule output for the same input card and rules file. The `buildRegex` case-sensitivity issue is the kind of parity gap this rule is meant to prevent.

## Verification

Run both unit suites before submitting a change:

```bash
pytest -q && node tests/test_scorer.js
```

Run the parity fixture check before submitting any scorer or rules change:

```bash
python scripts/check_parity.py
```

## Rules And Weights

`config/rules.json` is the source of truth for scoring weights, thresholds, sentinel words, and regex patterns.

`src/default_rules.json` is the packaged fallback for the CLI. It must always be a byte-for-byte copy of `config/rules.json`. Any change to one file must be applied to the other file in the same change.

## Extension Build

Changes to `src/extension/` or `config/rules.json` require rebuilding the generated browser bundle:

```bash
python scripts/build_extension.py
```

Before publishing a GitHub release for non-technical users, package the browser bundle as a zip:

```bash
python scripts/build_extension.py --package
```

This writes `dist/releases/slop-scrubber-extension-v<version>.zip`. Upload that zip to the matching GitHub Release.

Before loading the extension in Chrome, verify the generated bundle is current:

```bash
python scripts/build_extension.py --check
```

`dist/extension/` is generated output. Do not hand-edit files in that directory.

## Dependencies

The Python scorer must remain stdlib-only at runtime. The browser extension must not include external JavaScript packages or a bundler output in the final extension directory.
