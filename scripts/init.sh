#!/bin/bash

# Add custom language files via soft links to prevent loosing required existing files
for lang_file in /languages/*.traineddata; do
  ln -sf "$lang_file" /usr/share/tessdata/
done

# Check if TESSERACT_LANGS environment variable is set and is not empty
if [[ -n "$TESSERACT_LANGS" ]]; then
  # Convert comma-separated values to space separated list of "tesseract-ocr-$value"
  PKGS=$(echo ,$TESSERACT_LANGS | sed 's/,/ tesseract-ocr-/g')
  apt-get install -y "$PKGS"
fi

/scripts/download-security-jar.sh

# Run the main command
exec "$@"
