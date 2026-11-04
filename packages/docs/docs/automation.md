---
title: Validate photometry in CI
description: Fail a GitHub Actions check when IES or EULUMDAT files have errors or strict validation warnings.
---

# Validate photometry in CI

Use `ies validate` to reject malformed files before publishing a luminaire catalog. This example assumes your repository contains at least one `.ies` or `.ldt` file under `lights/`.

Save the following as `.github/workflows/photometry.yml`:

```yaml
name: Validate photometry
on: [push, pull_request]
permissions:
  contents: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm install -g @ies-tools/cli@1.2.0
      - name: Validate every photometry file
        shell: bash
        run: |
          set -euo pipefail
          mapfile -d '' files < <(find lights -type f \( -iname '*.ies' -o -iname '*.ldt' \) -print0)
          if (( ${#files[@]} == 0 )); then
            echo 'No photometry files found in lights/' >&2
            exit 1
          fi
          failed=0
          for file in "${files[@]}"; do
            ies validate "$file" --strict || failed=1
          done
          exit "$failed"
```

Every file is checked, including names containing spaces, and any failure makes the job fail. Pin the CLI version so validation changes arrive through a deliberate upgrade. Remove `--strict` if metadata warnings should remain advisory; malformed numeric data still fails.

To try this locally, use the [quick-start sample](./quick-start.md). A valid sample exits 0; a file with its `TILT=NONE` line removed fails. Use `--json` for stable diagnostic codes and machine-readable results. The [CLI reference](./cli-reference/ies.md) describes all flags.

Validation does not create a browser or require a GPU. It checks file structure and supported metadata rules; it does not certify the manufacturer's measurements. Files with Type A/B coordinates can be validated even when the 3D viewer cannot render them.
