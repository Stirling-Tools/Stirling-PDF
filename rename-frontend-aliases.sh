#!/usr/bin/env bash
#
# rename-frontend-aliases.sh
#
# Companion to restructure-frontend.sh, meant for its OWN PR after the structural
# move has landed. restructure-frontend.sh does all the file/folder/label renames but
# deliberately leaves the import-alias TOKENS alone (re-pointing them at the new
# folders instead), so the structural move stays a near-pure set of renames and the
# thousands of `@app/*` / `@portal/*` importers are untouched. This pass renames the
# tokens:
#
#   @app     ->  @editor
#   @portal  ->  @processor        (incl. @portal-proprietary / @portal-saas)
#
# Expects the restructured layout (frontend/src/editor exists) with the @app/@portal
# aliases still in place. Run from the repo root, then `task frontend:check:all`.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FE="frontend"

log() { printf '  %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preconditions: structural move done, alias tokens not yet renamed.
# ---------------------------------------------------------------------------
[ -d "$FE/src/editor" ] || die "$FE/src/editor not found - run restructure-frontend.sh first."
git grep -qE '@app/|@portal[/"-]' -- "$FE" \
  || die "no @app//@portal alias references found - already renamed?"

# @app -> @editor, @portal -> @processor across every frontend source/config file.
# \b after @app leaves the Tailwind @apply directive alone; \b after @portal turns
# @portal-proprietary / @portal-saas into @processor-* too.
ALIAS_FILES=()
while IFS= read -r f; do ALIAS_FILES+=("$f"); done < <(
  git ls-files "$FE" | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs|json|css|md|html)$'
)
perl -pi -e 's{\@app\b}{\@editor}g; s{\@portal\b}{\@processor}g;' "${ALIAS_FILES[@]}"
log "renamed @app->@editor, @portal->@processor in ${#ALIAS_FILES[@]} files"

# Formatter, so format:check passes (guarded + non-fatal).
if command -v task >/dev/null 2>&1; then
  if task frontend:format >/dev/null 2>&1; then
    log "ran task frontend:format"
  else
    log "WARNING: 'task frontend:format' failed - run it manually before committing"
  fi
else
  log "NOTE: 'task' not on PATH - run 'task frontend:format' before committing"
fi

# ---------------------------------------------------------------------------
echo ""
echo "== Sanity: @app/@portal alias references left? (expect none) =="
git grep -nE '@app/|@portal[/"-]' -- "$FE" || echo "  none"
