#!/usr/bin/env bash
#
# restructure-frontend-external-refs.sh
#
# COMPANION to restructure-frontend.sh. Rewrites references to the frontend layout
# in files OUTSIDE frontend/ (Taskfiles, .github/workflows, gradle, docker, docs,
# translation scripts). Kept separate from the re-runnable frontend script so it
# can land in its own commit (these files rarely change and are unlikely to
# conflict as the source branch evolves).
#
# Run from the repo root, after (or together with) restructure-frontend.sh.
# Safe to run before or after the frontend move - it only edits non-frontend files.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

log() { printf '  %s\n' "$*"; }

# Files anywhere in the repo (outside frontend/) that hardcode 'frontend/editor'.
# The two frontend Taskfiles are handled separately below (they also use bare
# 'editor/' relative paths because they run with dir: frontend).
EXTERNAL=()
while IFS= read -r f; do
  case "$f" in
    frontend/*) ;;  # handled by restructure-frontend.sh
    .taskfiles/frontend.yml|.taskfiles/desktop.yml) ;;  # handled below (Group X + Y)
    restructure-frontend.sh|restructure-frontend-external-refs.sh) ;;  # never rewrite the conversion scripts themselves
    *) EXTERNAL+=("$f") ;;
  esac
done < <(git grep -lF "frontend/editor" 2>/dev/null || true)

# Group X: full 'frontend/editor/...' path rewrites (unambiguous).
groupX() {
  perl -pi -e '
    s{frontend/editor/src/portal-saas}{frontend/src/processor/saas}g;
    s{frontend/editor/src/portal}{frontend/src/processor/proprietary}g;
    s{frontend/editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{frontend/src/editor/$1}g;
    s{frontend/editor/src\b}{frontend/src}g;
    s{frontend/editor/(public|dist|scripts|src-tauri)\b}{frontend/$1}g;
    s{frontend/editor/}{frontend/}g;
    s{frontend/editor\b}{frontend}g;
  ' "$@"
}

if [ "${#EXTERNAL[@]}" -gt 0 ]; then
  groupX "${EXTERNAL[@]}"
  log "rewrote frontend/editor paths in ${#EXTERNAL[@]} external files"
  printf '    %s\n' "${EXTERNAL[@]}"
fi

# Group Y: the two frontend Taskfiles run with `dir: frontend`, so they address the
# vite root as the bare subdir `editor` (positional `vite editor`, `dir: editor`,
# `editor/src/...`). After promotion the vite root IS frontend/ (their dir), so the
# `editor` segment is dropped and a `dir: editor` override is removed entirely (the
# task then inherits the include's `dir: frontend`) rather than becoming `dir: .`.
# Apply Group X first for any full 'frontend/editor/...' paths, then the relatives.
TASKFILES=(.taskfiles/frontend.yml .taskfiles/desktop.yml)
groupX "${TASKFILES[@]}"
perl -pi -e '
  s{dir: editor/src-tauri\b}{dir: src-tauri}g;
  $_ = "" if /^\s*dir: editor\s*$/;   # drop the override -> inherit dir: frontend
  s{npx vite build editor\b}{npx vite build}g;
  s{npx vite editor\b}{npx vite}g;
  s{--root editor\b}{--root .}g;
  s{editor/src/portal-saas}{src/processor/saas}g;
  s{editor/src/portal}{src/processor/proprietary}g;
  s{editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{src/editor/$1}g;
  s{editor/src\b}{src}g;
  s{editor/(scripts|public|src-tauri|dist)\b}{$1}g;
  s{editor/\.env}{.env}g;
' "${TASKFILES[@]}"
log "rewrote editor/ relatives + vite positionals + dir overrides in Taskfiles"

echo ""
echo "== Sanity: any 'frontend/editor' left repo-wide? (expect 0) =="
git grep -nF "frontend/editor" 2>/dev/null | grep -v "^frontend/editor/" || echo "  none"
echo "== 'dir: editor' or 'vite editor'/'--root editor' left in Taskfiles? =="
grep -nE "dir: editor\b|vite (build )?editor\b|--root editor\b" "${TASKFILES[@]}" || echo "  none"

echo ""
echo "== Fix rules =="
# These edits touch Python (and other) files; run the repo formatter so
# pre-commit's ruff-format check passes. Guarded + non-fatal.
if command -v task >/dev/null 2>&1; then
  if task pre-commit:fix >/dev/null 2>&1; then
    echo "  ran task pre-commit:fix"
  else
    echo "  WARNING: 'task pre-commit:fix' failed - run it manually before committing"
  fi
else
  echo "  NOTE: 'task' not on PATH - run 'task pre-commit:fix' before committing"
fi
