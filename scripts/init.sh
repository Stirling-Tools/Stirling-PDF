#!/bin/bash

# Copy the original tesseract-ocr files to the volume directory without overwriting existing files
echo "Copying original files without overwriting existing files"
mkdir -p /usr/share/tessdata
cp -rn /usr/share/tessdata-original/* /usr/share/tessdata

if [ -d /usr/share/tesseract-ocr/4.00/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/4.00/tessdata/* /usr/share/tessdata || true;
fi

if [ -d /usr/share/tesseract-ocr/5/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/5/tessdata/* /usr/share/tessdata || true;
fi

# Update the user and group IDs as per environment variables
if [ ! -z "$PUID" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
    usermod -o -u "$PUID" stirlingpdfuser
fi

if [ ! -z "$PGID" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
    groupmod -o -g "$PGID" stirlingpdfgroup
fi
umask "$UMASK"

echo "Setting permissions and ownership for necessary directories..."
chown -R stirlingpdfuser:stirlingpdfgroup $HOME /logs /scripts /usr/share/fonts/opentype/noto /usr/share/tessdata /configs /customFiles /pipeline /app.jar
chmod -R 755 /logs /scripts /usr/share/fonts/opentype/noto /usr/share/tessdata /configs /customFiles /pipeline /app.jar




# Check if TESSERACT_LANGS environment variable is set and is not empty
if [[ -n "$TESSERACT_LANGS" ]]; then
  # Convert comma-separated values to a space-separated list
  LANGS=$(echo $TESSERACT_LANGS | tr ',' ' ')
  pattern='^[a-zA-Z]{2,4}(_[a-zA-Z]{2,4})?$'
  # Install each language pack
  for LANG in $LANGS; do
     if [[ $LANG =~ $pattern ]]; then
      apk add --no-cache "tesseract-ocr-data-$LANG"
     else
      echo "Skipping invalid language code"
     fi
  done
fi

if [[ "$INSTALL_BOOK_AND_ADVANCED_HTML_OPS" == "true" ]]; then
  apk add --no-cache calibre@testing
fi



/scripts/download-security-jar.sh

# Run the main command and switch to stirling user for rest of run
exec su-exec stirlingpdfuser "$@"