#!/usr/bin/env bash
# Deletes every path in pss/pruned-paths.txt and every upstream GitHub workflow
# (anything in .github/workflows not named pss-*), staging the deletions in git.
# Idempotent: paths that are already gone are skipped.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

while IFS= read -r path || [ -n "$path" ]; do
  case "$path" in ''|'#'*) continue ;; esac
  if [ -e "$path" ] || git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    git rm -r -q --ignore-unmatch -- "$path"
    rm -rf -- "$path"
    echo "pruned: $path"
  fi
done < pss/pruned-paths.txt

# Upstream workflows build the proprietary/SaaS flavors and need upstream secrets.
if [ -d .github/workflows ]; then
  find .github/workflows -maxdepth 1 -type f ! -name 'pss-*' -print0 |
    while IFS= read -r -d '' wf; do
      git rm -q --ignore-unmatch -- "$wf"
      rm -f -- "$wf"
      echo "pruned: $wf"
    done
fi
