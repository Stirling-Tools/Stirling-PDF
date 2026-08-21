#!/bin/bash
# Resolve the version of the image that is actually running.
#
# The version baked into the image at build time wins over VERSION_TAG from the
# environment. Container managers (Portainer, Synology, and friends) carry the previous
# container's environment across an image update, so a VERSION_TAG left behind there
# used to mask the release that was really pulled - see issue #3460. The environment is
# only consulted when the image has no version file, which keeps dev and source builds
# working.
STIRLING_VERSION_FILE="${STIRLING_VERSION_FILE:-/etc/stirling_version}"

resolve_version_tag() {
  local baked=""
  if [ -r "${STIRLING_VERSION_FILE}" ]; then
    baked="$(tr -d '\r\n' < "${STIRLING_VERSION_FILE}")"
  fi

  if [ -n "$baked" ]; then
    if [ -n "${VERSION_TAG:-}" ] && [ "${VERSION_TAG}" != "$baked" ]; then
      printf '%s\n' \
        "[init][warn] Ignoring VERSION_TAG=${VERSION_TAG} from the environment; this image is ${baked}." \
        "[init][warn] Remove VERSION_TAG from your container configuration - it is set by the image." >&2
    fi
    VERSION_TAG="$baked"
    export VERSION_TAG
  elif [ -n "${VERSION_TAG:-}" ]; then
    export VERSION_TAG
  fi
}
