#!/usr/bin/env bash
# Fails (exit 1) if anything under the Stirling PDF User License is in the tree:
# a path from pss/pruned-paths.txt, an upstream workflow, or any tracked file
# carrying that license's text. Run in CI on every push/PR and by pss-sync.sh.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

failed=0

while IFS= read -r path || [ -n "$path" ]; do
  case "$path" in ''|'#'*) continue ;; esac
  if [ -e "$path" ]; then
    echo "::error::proprietary path present: $path"
    failed=1
  fi
done < pss/pruned-paths.txt

if [ -d .github/workflows ]; then
  while IFS= read -r wf; do
    echo "::error::upstream workflow present (run scripts/pss-prune.sh): $wf"
    failed=1
  done < <(find .github/workflows -maxdepth 1 -type f ! -name 'pss-*')
fi

# The license title is the reliable marker: every proprietary module ships a
# LICENSE file headed with it, including modules upstream adds after this fork.
while IFS= read -r file; do
  echo "::error::file under the Stirling PDF User License: $file"
  failed=1
done < <(git ls-files -z | xargs -0 grep -l -I "Stirling PDF User License" -- 2>/dev/null |
  grep -v -x -e 'scripts/pss-license-guard.sh' -e 'pss/README.md' || true)

if [ "$failed" -ne 0 ]; then
  echo "License guard failed: proprietary Stirling PDF code must not be in the PSS build."
  exit 1
fi
echo "License guard passed: MIT core only."
