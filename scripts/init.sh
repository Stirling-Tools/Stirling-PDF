#!/bin/bash

# Copy the original tesseract-ocr files to the volume directory without overwriting existing files
echo "Copying original files without overwriting existing files"
mkdir -p /usr/share/tesseract-ocr
cp -rn /usr/share/tesseract-ocr-original/* /usr/share/tesseract-ocr

if [ -d /usr/share/tesseract-ocr/4.00/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/4.00/tessdata/* /usr/share/tessdata || true;
fi

if [ -d /usr/share/tesseract-ocr/5/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/5/tessdata/* /usr/share/tessdata || true;
fi

# Check if TESSERACT_LANGS environment variable is set and is not empty
if [[ -n "$TESSERACT_LANGS" ]]; then
  # Convert comma-separated values to a space-separated list
  LANGS=$(echo $TESSERACT_LANGS | tr ',' ' ')

  # Install each language pack
  for LANG in $LANGS; do
    apt-get install -y "tesseract-ocr-$LANG"
  done
fi

/scripts/download-security-jar.sh

# Run the main command
exec "$@"
