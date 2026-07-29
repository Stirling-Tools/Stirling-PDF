#!/usr/bin/env bash
# Run the Storybook Vitest scan in batches and emit one JSON report per batch
# into .a11y-scan/, plus a manifest of every story file the run was supposed to
# cover and a log of the raw output. Consumed by a11y-check.mjs, which fails if
# any manifest entry produced no results. Run from frontend/.
#
#   a11y-scan.sh                 scan every story
#   a11y-scan.sh <file> [file…]  scan only these story files
#
# Batching keeps each browser session small: a single run over the whole story
# set holds one Chromium context open for the entire scan, so one crash in it
# costs every story after that point.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

OUT=".a11y-scan"
rm -rf "$OUT"
mkdir -p "$OUT"
MANIFEST="$OUT/manifest.txt"
LOG="$OUT/scan.log"

if [ "$#" -gt 0 ]; then
  # Explicit list (the pull-request path passes just the stories a branch
  # touched). Anything that no longer exists is dropped, so a deleted story
  # doesn't fail the manifest check.
  for f in "$@"; do [ -f "$f" ] && printf '%s\n' "$f"; done | sort -u >"$MANIFEST"
else
  # Tracked story files plus any not yet committed, so a new story can be
  # checked before it is added to the index.
  {
    git ls-files 'editor/src/**/*.stories.ts' 'editor/src/**/*.stories.tsx'
    git ls-files --others --exclude-standard 'editor/src/**/*.stories.ts' \
      'editor/src/**/*.stories.tsx'
  } | sort -u >"$MANIFEST"
fi

mapfile -t FILES <"$MANIFEST"
TOTAL=${#FILES[@]}
if [ "$TOTAL" -eq 0 ]; then
  if [ "$#" -gt 0 ]; then
    echo "a11y-scan: no existing story files in the given list — nothing to scan"
    exit 0
  fi
  echo "a11y-scan: no story files found — check the glob" >&2
  exit 2
fi

CHUNK=20
NB=$(((TOTAL + CHUNK - 1) / CHUNK))
echo "a11y-scan: $TOTAL story files, $NB batches of $CHUNK"

failed=()
i=0
ci=0
while [ "$i" -lt "$TOTAL" ]; do
  ci=$((ci + 1))
  batch=("${FILES[@]:i:CHUNK}")
  i=$((i + CHUNK))
  out="$OUT/chunk-$ci.json"
  filters=()
  for f in "${batch[@]}"; do filters+=("${f%.tsx}"); done
  # The scan exits non-zero whenever a story has a violation — expected here, so
  # the report is what matters, not the status. Output is teed to the log so a red
  # CI run still has the offending selectors and help text to work from.
  #
  # A batch is retried once when it produced no report, or when its report
  # contains crash-class failures (failures with no axe rule in them). A one-off
  # infrastructure death — the browser page dropping, a Vite dep re-optimize
  # reloading mid-run — passes on the retry; a story that genuinely cannot
  # render fails both attempts and is reported.
  for attempt in 1 2; do
    timeout 300 npx vitest run --config .storybook/vitest.config.ts \
      --reporter=json --outputFile="$out" "${filters[@]}" >>"$LOG" 2>&1
    if [ ! -s "$out" ]; then
      echo "a11y-scan: batch $ci produced no report (attempt $attempt)" >&2
      continue
    fi
    if [ "$attempt" = 1 ]; then
      crashes=$(node .storybook/a11y-crash-count.mjs "$out" 2>/dev/null || echo "?")
      if [ "$crashes" != "0" ]; then
        echo "a11y-scan: batch $ci has $crashes crash-class failure(s) — retrying once" >&2
        rm -f "$out"
        continue
      fi
    fi
    break
  done
  if [ -s "$out" ]; then
    echo "  batch $ci/$NB done"
  else
    failed+=("$ci")
    echo "  batch $ci/$NB FAILED — no report" >&2
  fi
done

echo "a11y-scan: $(ls "$OUT"/chunk-*.json 2>/dev/null | wc -l)/$NB batches produced reports"
if [ ${#failed[@]} -gt 0 ]; then
  echo "a11y-scan: ${#failed[@]} batch(es) produced no report: ${failed[*]}" >&2
  echo "a11y-scan: see $LOG. Not reporting on a partial scan." >&2
  exit 2
fi
