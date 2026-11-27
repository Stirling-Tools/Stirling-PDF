#!/usr/bin/env bash
# Brings upstream Stirling PDF changes into a PSS branch without the proprietary code.
#
# Usage: scripts/pss-sync.sh [source-branch]   (default: main)
#   1. On GitHub, press "Sync fork" on main only (never on pss/main).
#   2. On a new branch off pss/main, run this script.
#   3. Review, commit, push and open a PR into pss/main; CI re-runs the guard.
set -euo pipefail

source_branch="${1:-main}"
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; commit or stash first." >&2
  exit 1
fi

git fetch origin "$source_branch"

# A merge conflict here is expected for upstream edits to pruned files
# (modify/delete); pruning below resolves those by keeping them deleted.
git merge --no-commit --no-ff "origin/$source_branch" || true

scripts/pss-prune.sh

unresolved="$(git diff --name-only --diff-filter=U)"
if [ -n "$unresolved" ]; then
  echo "Conflicts outside the pruned paths need resolving by hand:"
  echo "$unresolved"
  exit 1
fi

scripts/pss-license-guard.sh

echo "Merge staged and clean. Review with 'git diff --cached', then:"
echo "  git commit -m \"Sync upstream $source_branch into PSS\""
