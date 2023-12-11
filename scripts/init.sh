#!/bin/bash

# Copy the original tesseract-ocr files to the volume directory without overwriting existing files
echo "Copying original files without overwriting existing files"
mkdir -p /usr/share/tesseract-ocr
cp -rn /usr/share/tesseract-ocr-original/* /usr/share/tesseract-ocr

if [ -d /usr/share/tesseract-ocr/4.00/tessdata ]; then 
	cp -r /usr/share/tesseract-ocr/4.00/tessdata/* /usr/share/tesseract-ocr/5/tessdata/ || true; 
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

echo "Running Stirling PDF with DOCKER_ENABLE_SECURITY=${DOCKER_ENABLE_SECURITY} and VERSION_TAG=${VERSION_TAG}"
# Check for DOCKER_ENABLE_SECURITY and download the appropriate JAR if required
if [ "$DOCKER_ENABLE_SECURITY" = "true" ] && [ "$VERSION_TAG" != "alpha" ]; then
    if [ ! -f app-security.jar ]; then
    	echo "Trying to download from: https://github.com/Frooodle/Stirling-PDF/releases/download/v$VERSION_TAG/Stirling-PDF-with-login.jar"
        curl -L -o app-security.jar https://github.com/Frooodle/Stirling-PDF/releases/download/v$VERSION_TAG/Stirling-PDF-with-login.jar
       
        # If the first download attempt failed, try with the 'v' prefix
        if [ $? -ne 0 ]; then
            echo "Trying to download from: https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar"
        	curl -L -o app-security.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar
        fi

        if [ $? -eq 0 ]; then  # checks if curl was successful
            rm -f app.jar
            ln -s app-security.jar app.jar
        fi
    fi
fi


# Run the main command
exec "$@"