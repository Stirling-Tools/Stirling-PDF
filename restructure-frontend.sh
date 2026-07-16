#!/usr/bin/env bash
#
# restructure-frontend.sh
#
# Re-runnable conversion of the frontend to the editor/processor layout.
#
#   frontend/editor/            ->  frontend/                 (vite + npm root promoted up)
#   frontend/editor/src/<layer> ->  frontend/src/editor/<layer>
#   frontend/editor/src/portal      ->  frontend/src/processor/proprietary
#   frontend/editor/src/portal-saas ->  frontend/src/processor/saas
#
#   alias @app     -> @editor
#   alias @portal  -> @processor   (incl. @portal-proprietary -> @processor-proprietary)
#
# SCOPE: frontend/ ONLY. References outside frontend/ (Taskfiles, .github/workflows,
# build.gradle, .dockerignore, docs) are handled separately by
# restructure-frontend-external-refs.sh so they can land in their own commit.
#
# This script is NOT idempotent: it expects the OLD layout as input. To re-run after
# the source branch has changed, reset the frontend tree to the old layout first, e.g.
#     git checkout -- frontend && git clean -fd frontend
# (or reset/recreate the branch), then run this again from the repo root.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FE="frontend"
ED="$FE/editor"

log()  { printf '  %s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preconditions: old layout present, new layout absent.
# ---------------------------------------------------------------------------
[ -d "$ED/src/core" ]      || die "$ED/src/core not found - is the tree in the old layout / are you at the repo root?"
[ ! -d "$FE/src/editor" ]  || die "$FE/src/editor already exists - tree looks already-converted. Reset it first (see header)."

# git mv wrapper that creates the destination parent first.
gmv() {
  local src="$1" dst="$2"
  [ -e "$src" ] || die "expected to move '$src' but it does not exist"
  mkdir -p "$(dirname "$dst")"
  git mv "$src" "$dst"
}

# ===========================================================================
step "Phase 1: promote frontend/editor/ to the frontend/ vite root"
# ===========================================================================

# Root-level files (committed only; *.local overrides are untracked - handled below).
# tsconfig.portal.vite.json is renamed to match the @processor alias.
gmv "$ED/tsconfig.portal.vite.json" "$FE/tsconfig.processor.vite.json"
for f in \
  index.html vite.config.ts vitest.config.ts playwright.config.ts \
  postcss.config.js tailwind.config.js vite-env.d.ts DeveloperGuide.md \
  tsconfig.json tsconfig.core.vite.json tsconfig.proprietary.vite.json \
  tsconfig.desktop.vite.json tsconfig.saas.vite.json tsconfig.prototypes.vite.json \
  .env .env.desktop .env.proprietary .env.saas
do
  gmv "$ED/$f" "$FE/$f"
done
log "moved root config/env files"

gmv "$ED/public"    "$FE/public"
gmv "$ED/src-tauri" "$FE/src-tauri"
log "moved public/ and src-tauri/"

# Merge editor/scripts/* into the existing frontend/scripts/ (no filename overlap).
for entry in "$ED"/scripts/*; do
  gmv "$entry" "$FE/scripts/$(basename "$entry")"
done
log "merged editor/scripts into frontend/scripts"

# ===========================================================================
step "Phase 2: split src into editor/ and processor/"
# ===========================================================================

for layer in core proprietary desktop saas cloud prototypes; do
  gmv "$ED/src/$layer" "$FE/src/editor/$layer"
done
log "moved editor layers -> src/editor/*"

gmv "$ED/src/portal"      "$FE/src/processor/proprietary"
gmv "$ED/src/portal-saas" "$FE/src/processor/saas"
log "moved portal -> processor/proprietary, portal-saas -> processor/saas"

for f in index.tsx global.d.ts logo.svg output.css; do
  gmv "$ED/src/$f" "$FE/src/$f"
done
gmv "$ED/src/assets" "$FE/src/assets"
log "moved shared entry files -> src/*"

# ---------------------------------------------------------------------------
# Leftover frontend/editor/: only untracked artifacts should remain. Preserve
# local env overrides by lifting them up; drop regenerable build artifacts.
# ---------------------------------------------------------------------------
for f in .env.local .env.desktop.local .env.saas.local; do
  if [ -f "$ED/$f" ] && [ ! -e "$FE/$f" ]; then
    mv "$ED/$f" "$FE/$f"
    log "lifted untracked $f up to frontend/"
  fi
done
# Everything tracked has moved (set -e would have aborted otherwise); only empty
# dirs and untracked artifacts (node_modules, dist, .DS_Store) remain.
rm -rf "$ED"
log "removed leftover frontend/editor/"

# ===========================================================================
step "Phase 3: rewrite aliases and paths"
# ===========================================================================

# --- 3a. Alias rename across all tracked source + storybook + root configs ---
# \b after @app avoids clobbering the Tailwind @apply directive in .css files.
# \b after @portal turns @portal-proprietary into @processor-proprietary too.
ALIAS_RE='s{\@app\b}{\@editor}g; s{\@portal\b}{\@processor}g;'
ALIAS_FILES=()
while IFS= read -r f; do ALIAS_FILES+=("$f"); done < <(
  git ls-files "$FE/src" "$FE/.storybook" \
    | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs|json|css|md|html)$'
)
ALIAS_FILES+=(
  "$FE/tsconfig.json" "$FE/tsconfig.core.vite.json" "$FE/tsconfig.proprietary.vite.json"
  "$FE/tsconfig.desktop.vite.json" "$FE/tsconfig.saas.vite.json"
  "$FE/tsconfig.prototypes.vite.json" "$FE/tsconfig.processor.vite.json"
  "$FE/vite.config.ts" "$FE/vitest.config.ts" "$FE/playwright.config.ts"
)
perl -pi -e "$ALIAS_RE" "${ALIAS_FILES[@]}"
log "renamed @app->@editor, @portal->@processor in ${#ALIAS_FILES[@]} files"

# --- 3b. Root configs at frontend/ : src/<x> path segments ---
# These live at the vite root, so src/ stays and the layer/domain is inserted.
perl -pi -e '
  s{\bsrc/portal-saas\b}{src/processor/saas}g;
  s{\bsrc/portal\b}{src/processor/proprietary}g;
  s{\bsrc/(core|proprietary|desktop|saas|cloud|prototypes)\b}{src/editor/$1}g;
  s{tsconfig\.portal\.vite\.json}{tsconfig.processor.vite.json}g;
' \
  "$FE/tsconfig.json" "$FE/tsconfig.core.vite.json" "$FE/tsconfig.proprietary.vite.json" \
  "$FE/tsconfig.desktop.vite.json" "$FE/tsconfig.saas.vite.json" \
  "$FE/tsconfig.prototypes.vite.json" "$FE/tsconfig.processor.vite.json" \
  "$FE/vite.config.ts" "$FE/vitest.config.ts" "$FE/playwright.config.ts"
# Cosmetic: vitest project label.
perl -pi -e 's{name: "portal"}{name: "processor"}g;' "$FE/vitest.config.ts"
# vite.config viteStaticCopy walked '../node_modules' from the old editor/ root;
# node_modules now sits alongside vite.config at the frontend/ root.
perl -pi -e 's{\.\./node_modules/}{node_modules/}g;' "$FE/vite.config.ts"
log "rewrote src/ paths in root configs"

# --- 3c. Per-layer / processor tsconfigs (moved down into src/) ---
# The vite root moved up one level, so up-refs to it gain a '../'; refs that
# stayed within the moved subtree (e.g. ../core/setupTests.ts, '.') are unchanged.
LAYER_TSCONFIGS=()
while IFS= read -r f; do LAYER_TSCONFIGS+=("$f"); done < <(
  git ls-files "$FE/src" | grep -E '/(editor|processor)/[^/]+/tsconfig\.json$'
)
if [ "${#LAYER_TSCONFIGS[@]}" -gt 0 ]; then
  perl -pi -e '
    s{\.\./\.\./tsconfig\.json}{../../../tsconfig.json}g;   # extends: base moved up
    s{\.\./\.\./src/portal-saas}{../../processor/saas}g;
    s{\.\./\.\./src/portal}{../../processor/proprietary}g;
    s{\.\./\.\./src/(core|proprietary|desktop|saas|cloud|prototypes)}{../../editor/$1}g;
    s{"\.\./portal-saas"}{"../../processor/saas"}g;         # saas layer include
    s{\.\./global\.d\.ts}{../../global.d.ts}g;
    s{\.\./\*\.(js|ts|tsx)}{../../*.$1}g;
  ' "${LAYER_TSCONFIGS[@]}"
  log "fixed relative paths in ${#LAYER_TSCONFIGS[@]} layer tsconfigs"
fi

# --- 3d. Storybook configs (stay at frontend/.storybook/, ref the new tree) ---
STORY=("$FE/.storybook/main.ts" "$FE/.storybook/tsconfig.json")
perl -pi -e '
  s{\.\./editor/src/portal-saas}{../src/processor/saas}g;
  s{\.\./editor/src/portal}{../src/processor/proprietary}g;
  s{\.\./editor/src/\*\*}{../src/**}g;                     # stories glob spans both domains now
  s{\.\./editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{../src/editor/$1}g;
  s{\.\./editor/public}{../public}g;
  s{\.\./editor/tsconfig\.}{../tsconfig.}g;
  s{\.\./editor/}{../}g;
  s{\beditor/src/portal\b}{src/processor/proprietary}g;    # prose in comments
  s{\beditor/src/}{src/editor/}g;                          # prose in comments
' "${STORY[@]}"
log "rewrote storybook paths"

# --- 3e. package.json (stays at frontend/, encodes the old editor/ nesting) ---
perl -pi -e '
  s{cd editor && }{}g;
  s{"editor/public"}{"public"}g;
' "$FE/package.json"
log "fixed package.json (cd editor, msw workerDirectory)"

# --- 3f. Non-alias paths (imports AND runtime path.join/resolve strings) that ---
# escape a layer to reach the shared src-root (assets/) or the vite-root
# (scripts/, public/). Every moved file sits exactly one level deeper relative to
# those roots, so each such '../'-run needs +1. tsc and vite-tsconfig-paths can't
# see runtime path strings, so only tests exercise these - hence they must be
# handled explicitly. Also drops the hardcoded 'editor/' from the two absolute
# path literals in translationAudit.ts (front("editor/src"|"editor/public/...")).
SRC_FILES=()
while IFS= read -r f; do SRC_FILES+=("$f"); done < <(
  git ls-files "$FE/src" | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs)$'
)
perl -pi -e '
  s{((?:\.\./)+)(assets/(?:material-symbols|3rdPartyLicenses))}{../$1$2}g;
  s{((?:\.\./)+)(scripts/)}{../$1$2}g;
  s{((?:\.\./)+)(public)\b}{../$1$2}g;
  s{(["\x27])editor/public/}{${1}public/}g;
  s{(["\x27])editor/src(["\x27])}{${1}src$2}g;
' "${SRC_FILES[@]}"
# Two runtime root-walks that compute a path by ../-count (no keyword to anchor
# on): env.test walks to the vite root (frontend/, which moved up one level -> +1),
# and seed.spec hardcodes src/core relative to process.cwd(). Unique constructs.
perl -pi -e '
  s{join\(fileURLToPath\(import\.meta\.url\), "\.\./\.\./\.\."\)}{join(fileURLToPath(import.meta.url), "../../../..")}g;
  s{join\(process\.cwd\(\), "src", "core", "tests"}{join(process.cwd(), "src", "editor", "core", "tests"}g;
' "${SRC_FILES[@]}"
log "fixed escaping relative paths + hardcoded root-path literals (assets/scripts/public)"

# --- 3g. Cross-domain relative imports: processor code reaching the editor's ---
# saas/proprietary portal-bridge layers (.../saas/portal/, .../proprietary/portal/).
# processor and the editor layers are no longer siblings, so these need +1 '../'
# and an inserted 'editor/'. The '/portal/' segment disambiguates the editor
# bridge from the processor's own saas layer (which has no portal/ subdir).
PROC_FILES=()
while IFS= read -r f; do PROC_FILES+=("$f"); done < <(
  git ls-files "$FE/src/processor" | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs)$'
)
if [ "${#PROC_FILES[@]}" -gt 0 ]; then
  perl -pi -e 's{((?:\.\./)+)(saas|proprietary)/portal/}{../${1}editor/${2}/portal/}g;' "${PROC_FILES[@]}"
  log "fixed cross-domain processor->editor bridge imports"
fi

# --- 3h. eslint.config.mjs (stays at frontend/): path globs + alias mentions ---
# Order matters: portal/layer-specific paths before the broad 'editor/src/**'.
perl -pi -e '
  s{editor/src/portal-saas}{src/processor/saas}g;
  s{editor/src/portal}{src/processor/proprietary}g;
  s{editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{src/editor/$1}g;
  s{editor/src/\*\*}{src/**}g;                                  # app-code scope now spans both domains
  s{\beditor/src\b}{src}g;                                      # any remaining prose
  s{\beditor/scripts\b}{scripts}g;
  s{\beditor/\*\.config\b}{*.config}g;
  s{\beditor/(dist|public|src-tauri|playwright-report|test-results)\b}{$1}g;
  s{frontend/editor/DeveloperGuide\.md}{frontend/DeveloperGuide.md}g;
  s{\@app\b}{\@editor}g;
  s{\@portal\b}{\@processor}g;
' "$FE/eslint.config.mjs"
log "rewrote eslint.config.mjs globs and aliases"

# --- 3i. Helper scripts, ignore files, and docs moved but not yet rewritten. ---
# find-unused-css.mjs and generate-licenses.js carry logic (ROOTS array, walk-up
# depth), so they're excluded here and fixed bespoke below.
SCRIPT_DOC_FILES=()
while IFS= read -r f; do SCRIPT_DOC_FILES+=("$f"); done < <(
  git ls-files "$FE/scripts" "$FE/.gitignore" "$FE/.prettierignore" "$FE/README.md" "$FE/DeveloperGuide.md" \
    | grep -vE 'scripts/(find-unused-css\.mjs|generate-licenses\.js)$'
)
if [ "${#SCRIPT_DOC_FILES[@]}" -gt 0 ]; then
  perl -pi -e '
    s{editor/src/portal-saas}{src/processor/saas}g;
    s{editor/src/portal}{src/processor/proprietary}g;
    s{editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{src/editor/$1}g;
    s{\beditor/src-tauri\b}{src-tauri}g;
    s{\beditor/src\b}{src}g;
    s{\beditor/scripts\b}{scripts}g;
    s{\beditor/(dist|public|playwright-report|test-results)\b}{$1}g;
    s{frontend/editor/}{frontend/}g;
    # Bare frontend-root-relative layer paths (e.g. og generators join ROOT with
    # "src/core/..."). Runs after the editor/src/ rules so it cannot double-hit
    # an already-produced "src/editor/<layer>".
    s{\bsrc/portal-saas/}{src/processor/saas/}g;
    s{\bsrc/portal/}{src/processor/proprietary/}g;
    s{\bsrc/(core|proprietary|desktop|saas|cloud|prototypes)/}{src/editor/$1/}g;
    s{\@app\b}{\@editor}g;
    s{\@portal\b}{\@processor}g;
  ' "${SCRIPT_DOC_FILES[@]}"
fi
# Bespoke logic fixes (depth + hardcoded root list), not just path tokens:
perl -pi -e '
  s{path\.join\(import\.meta\.dirname, "\.\.", "\.\.", "package\.json"\)}{path.join(import.meta.dirname, "..", "package.json")}g;
  s{walk up two levels}{walk up one level}g;
  s{frontend/editor/scripts/}{frontend/scripts/}g;
' "$FE/scripts/generate-licenses.js"
perl -pi -e '
  s{const ROOTS = \["editor/src", "shared", "portal/src"\];}{const ROOTS = ["src"];}g;
  s{f\.replace\("editor/src/", ""\)\.replace\("portal/src/", "portal/"\)}{f.replace("src/", "")}g;
' "$FE/scripts/find-unused-css.mjs"
log "rewrote helper scripts, ignore files, and docs"

# --- 3j. Mop-up: residual 'frontend/editor/...' AND bare 'editor/<path>' strings ---
# anywhere in the frontend tree - comments, nested READMEs, and generated-file
# headers (e.g. toolApiTypes.ts "Generated by editor/scripts/...") the targeted
# passes above didn't cover. Both forms are unambiguous old-vite-root references
# in this tree (new paths are 'src/editor/...', never 'editor/src...'), so a
# blanket rewrite is safe. Bare rules run after the frontend/editor ones and are
# ordered layer-first so they can't double-hit an already-produced 'src/editor/*'.
MOP_FILES=()
while IFS= read -r f; do MOP_FILES+=("$f"); done < <(
  git ls-files "$FE" | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs|json|md|css|ya?ml|html|sh|toml)$'
)
if [ "${#MOP_FILES[@]}" -gt 0 ]; then
  perl -pi -e '
    s{frontend/editor/src/portal-saas}{frontend/src/processor/saas}g;
    s{frontend/editor/src/portal}{frontend/src/processor/proprietary}g;
    s{frontend/editor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{frontend/src/editor/$1}g;
    s{frontend/editor/src\b}{frontend/src}g;
    s{frontend/editor/(public|dist|scripts|src-tauri)\b}{frontend/$1}g;
    s{frontend/editor/}{frontend/}g;
    s{frontend/editor\b}{frontend}g;
    s{\beditor/src/portal-saas\b}{src/processor/saas}g;
    s{\beditor/src/portal\b}{src/processor/proprietary}g;
    s{\beditor/src/(core|proprietary|desktop|saas|cloud|prototypes)}{src/editor/$1}g;
    s{\beditor/src\b}{src}g;
    s{\beditor/(scripts|public|dist|src-tauri)\b}{$1}g;
  ' "${MOP_FILES[@]}"
fi
# Playwright's cwd moves from frontend/editor/ up to frontend/ (one level
# shallower), so this repo-root walk via process.cwd() needs one fewer '..'.
# Multi-line construct, anchored on .test-state so only this call matches.
perl -0777 -pi -e 's{process\.cwd\(\),(\s*)"\.\.",(\s*)"\.\.",(\s*)"\.test-state"}{process.cwd(),$1"..",$3".test-state"}g;' \
  "$FE/src/editor/core/tests/helpers/test-base.ts"
log "mopped up residual frontend/editor comment/doc paths + playwright coverage cwd walk"

# ===========================================================================
step "Phase 4: delete dead code"
# ===========================================================================
# frontend/shared: orphaned @shared barrel pointing at files that don't exist.
if git ls-files --error-unmatch "$FE/shared" >/dev/null 2>&1; then
  git rm -r --quiet "$FE/shared"
  log "git rm frontend/shared (dead @shared barrel)"
fi
# frontend/portal: not tracked, just a stray node_modules.
if [ -d "$FE/portal" ] && ! git ls-files --error-unmatch "$FE/portal" >/dev/null 2>&1; then
  rm -rf "$FE/portal"
  log "rm -rf frontend/portal (untracked stray)"
fi

# ===========================================================================
step "Phase 5: run project fix rules (format)"
# ===========================================================================
# Structural rewrites can leave files that aren't prettier-clean; run the project
# formatter so frontend:check's format:check passes. Guarded + non-fatal.
if command -v task >/dev/null 2>&1; then
  if task frontend:format >/dev/null 2>&1; then
    log "ran task frontend:format"
  else
    log "WARNING: 'task frontend:format' failed - run it manually before committing"
  fi
else
  log "NOTE: 'task' not on PATH - run 'task frontend:format' before committing"
fi

# ===========================================================================
step "Done. Sanity checks"
# ===========================================================================
stale_app=$(git ls-files "$FE/src" | grep -E '\.(ts|tsx|js|jsx|mjs|mts|cjs)$' | xargs grep -lE '@app/|@portal[/"-]' 2>/dev/null || true)
if [ -n "$stale_app" ]; then
  log "WARNING: files still referencing @app//@portal:"
  printf '%s\n' "$stale_app" | sed 's/^/    /'
else
  log "no stale @app//@portal import references remain"
fi
log "new tree:"
{ ls -d "$FE"/src/editor/*/ "$FE"/src/processor/*/ 2>/dev/null; } | sed 's/^/    /'
