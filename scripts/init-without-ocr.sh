#!/bin/bash

export JAVA_TOOL_OPTIONS="${JAVA_BASE_OPTS} ${JAVA_CUSTOM_OPTS}"
echo "running with JAVA_TOOL_OPTIONS ${JAVA_BASE_OPTS} ${JAVA_CUSTOM_OPTS}"

# Update the user and group IDs as per environment variables
if [ ! -z "$PUID" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
    usermod -o -u "$PUID" stirlingpdfuser || true
fi


if [ ! -z "$PGID" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
    groupmod -o -g "$PGID" stirlingpdfgroup || true
fi
umask "$UMASK" || true

if [[ "$INSTALL_BOOK_AND_ADVANCED_HTML_OPS" == "true" && "$FAT_DOCKER" != "true" ]]; then
  echo "issue with calibre in current version, feature currently disabled on Stirling-PDF"
  #apk add --no-cache calibre@testing
fi

if [[ "$FAT_DOCKER" != "true" ]]; then
  /scripts/download-security-jar.sh	
fi

if [[ -n "$LANGS" ]]; then
  /scripts/installFonts.sh $LANGS
fi

echo "Setting permissions and ownership for necessary directories..."
# Attempt to change ownership of directories and files
if chown -R stirlingpdfuser:stirlingpdfgroup $HOME /logs /scripts /usr/share/fonts/opentype/noto /configs /customFiles /pipeline /app.jar; then
	chmod -R 755 /logs /scripts /usr/share/fonts/opentype/noto /configs /customFiles /pipeline /app.jar || true
    # If chown succeeds, execute the command as stirlingpdfuser
    exec su-exec stirlingpdfuser "$@"
else
    # If chown fails, execute the command without changing the user context
    echo "[WARN] Chown failed, running as host user"
    exec "$@"
fi
