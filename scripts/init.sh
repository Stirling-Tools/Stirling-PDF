#!/bin/bash

# Copy the original tesseract-ocr files to the volume directory without overwriting existing files
echo "Copying original files without overwriting existing files"
mkdir -p /usr/share/tesseract-ocr
cp -rn /usr/share/tesseract-ocr-original/* /usr/share/tesseract-ocr

# Run the main command
exec "$@"