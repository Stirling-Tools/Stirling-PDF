#!/usr/bin/env bash
# Run the Storybook Vitest scan in small sequential batches and emit one JSON
# report per batch into .a11y-scan/. Batching avoids the browser-mode dep
# optimizer reloading mid-run (which drops workers and corrupts a single big
# run). Consumed by a11y-check.mjs. Run from frontend/.
set -u
cd "$(dirname "$0")/.." || exit 1

OUT=".a11y-scan"
rm -rf "$OUT"
mkdir -p "$OUT"

mapfile -t FILES < <(git ls-files 'editor/src/**/*.stories.tsx')
echo "a11y-scan: ${#FILES[@]} story files"

CHUNK=20
i=0
ci=0
while [ "$i" -lt "${#FILES[@]}" ]; do
  ci=$((ci + 1))
  batch=("${FILES[@]:i:CHUNK}")
  i=$((i + CHUNK))
  filters=()
  for f in "${batch[@]}"; do filters+=("${f%.tsx}"); done
  # The scan exits non-zero on a11y violations — that's expected; the report is
  # still written. Retry once if a batch produces no JSON (transient reload).
  timeout 200 npx vitest run --config .storybook/vitest.config.ts \
    --reporter=json --outputFile="$OUT/chunk-$ci.json" "${filters[@]}" >/dev/null 2>&1 || true
  if [ ! -s "$OUT/chunk-$ci.json" ]; then
    timeout 200 npx vitest run --config .storybook/vitest.config.ts \
      --reporter=json --outputFile="$OUT/chunk-$ci.json" "${filters[@]}" >/dev/null 2>&1 || true
  fi
  echo "  batch $ci/$(((${#FILES[@]} + CHUNK - 1) / CHUNK)) done"
done
echo "a11y-scan: complete ($(ls "$OUT"/chunk-*.json 2>/dev/null | wc -l) batches)"
