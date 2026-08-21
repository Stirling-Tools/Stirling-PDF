#!/bin/bash
# Unit tests for scripts/resolve-version-tag.sh (issue #3460).
#
# Container managers such as Portainer and Synology carry the previous container's
# environment across an image update. A VERSION_TAG left behind that way used to win
# over the version baked into the new image, so the app kept reporting - and, on the
# images that still downloaded a per-version jar, kept running - the old release.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="${REPO_ROOT}/scripts/resolve-version-tag.sh"

failures=0

run_case() {
  local name="$1" baked="$2" env_value="$3" expected="$4"
  local tmp actual
  tmp="$(mktemp -d)"

  if [ "$baked" != "<none>" ]; then
    printf '%s\n' "$baked" > "${tmp}/stirling_version"
  fi

  actual="$(
    set +u
    export STIRLING_VERSION_FILE="${tmp}/stirling_version"
    if [ "$env_value" != "<unset>" ]; then
      export VERSION_TAG="$env_value"
    else
      unset VERSION_TAG
    fi
    # shellcheck source=/dev/null
    . "$HELPER"
    resolve_version_tag 2>/dev/null
    printf '%s' "${VERSION_TAG:-<unset>}"
  )"

  rm -rf "$tmp"

  if [ "$actual" = "$expected" ]; then
    printf 'ok   - %s\n' "$name"
  else
    printf 'FAIL - %s (expected %s, got %s)\n' "$name" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

if [ ! -r "$HELPER" ]; then
  printf 'FAIL - %s is missing\n' "$HELPER"
  exit 1
fi

run_case "baked version wins over a stale environment value" "2.14.3" "0.44.0" "2.14.3"
run_case "baked version is used when nothing is in the environment" "2.14.3" "<unset>" "2.14.3"
run_case "matching environment value is kept" "2.14.3" "2.14.3" "2.14.3"
run_case "environment value is honoured when the image has no version file" "<none>" "0.44.0" "0.44.0"
run_case "empty version file does not blank out the environment value" "" "0.44.0" "0.44.0"
run_case "no version anywhere leaves VERSION_TAG unset" "<none>" "<unset>" "<unset>"

if [ "$failures" -gt 0 ]; then
  printf '\n%d test(s) failed\n' "$failures"
  exit 1
fi
printf '\nall tests passed\n'
