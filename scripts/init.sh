#!/bin/bash

# Copy the original tesseract-ocr files to the volume directory without overwriting existing files
echo "Copying original files without overwriting existing files"
mkdir -p /usr/share/tesseract-ocr
cp -rn /usr/share/tesseract-ocr-original/* /usr/share/tesseract-ocr

# Check if TESSERACT_LANGS environment variable is set and is not empty
if [[ -n "$TESSERACT_LANGS" ]]; then
  # Convert comma-separated values to a space-separated list
  LANGS=$(echo $TESSERACT_LANGS | tr ',' ' ')

  # Install each language pack
  for LANG in $LANGS; do
    apt-get install -y "tesseract-ocr-$LANG"
  done
fi

# Check for DOCKER_ENABLE_SECURITY and download the appropriate JAR if required
if [ "$DOCKER_ENABLE_SECURITY" = "true" ] && [ "$VERSION_TAG" != "alpha" ]; then
    if [ ! -f app-security.jar ]; then
        echo "Downloading from: https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar"
        curl -L -o app-security.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar
        if [ $? -eq 0 ]; then  # checks if curl was successful
            rm -f app.jar
            ln -s app-security.jar app.jar
        fi
    fi
fi


# Run the main command
exec "$@"