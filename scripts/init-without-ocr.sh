#!/bin/bash

# Update the user and group IDs as per environment variables
if [ ! -z "$PUID" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
    usermod -o -u "$PUID" stirlingpdfuser || true
fi


if [ ! -z "$PGID" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
    groupmod -o -g "$PGID" stirlingpdfgroup || true
fi
umask "$UMASK" || true

if [[ "$INSTALL_BOOK_AND_ADVANCED_HTML_OPS" == "true" ]]; then
  apk add --no-cache calibre@testing
fi

/scripts/download-security-jar.sh

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
