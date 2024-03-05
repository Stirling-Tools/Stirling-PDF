#!/bin/sh

echo "Setting permissions and ownership for necessary directories..."
chown -R stirlingpdfuser:stirlingpdfgroup /logs /scripts /usr/share/fonts/opentype/noto /usr/share/tessdata /configs /customFiles
chmod -R 755 /logs /scripts /usr/share/fonts/opentype/noto /usr/share/tessdata /configs /customFiles
if [[ "$INSTALL_BOOK_AND_ADVANCED_HTML_OPS" == "true" ]]; then
  apk add --no-cache calibre@testing
fi


/scripts/download-security-jar.sh

# Run the main command
exec su-exec stirlingpdfuser "$@"