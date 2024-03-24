echo "Running Stirling PDF with DOCKER_ENABLE_SECURITY=${DOCKER_ENABLE_SECURITY} and VERSION_TAG=${VERSION_TAG}"
# Check for DOCKER_ENABLE_SECURITY and download the appropriate JAR if required
if [ "$DOCKER_ENABLE_SECURITY" = "true" ] && [ "$VERSION_TAG" != "alpha" ]; then
    if [ ! -f app-security.jar ]; then
    	echo "Trying to download from: https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v$VERSION_TAG/Stirling-PDF-with-login.jar"
        curl -L -o app-security.jar https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v$VERSION_TAG/Stirling-PDF-with-login.jar

        # If the first download attempt failed, try with the 'v' prefix
        if [ $? -ne 0 ]; then
            echo "Trying to download from: https://github.com/Stirling-Tools/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar"
        	curl -L -o app-security.jar https://github.com/Stirling-Tools/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login.jar
        fi

        if [ $? -eq 0 ]; then  # checks if curl was successful
            rm -f app.jar
            ln -s app-security.jar app.jar
            chown stirlingpdfuser:stirlingpdfgroup app.jar || true
            chmod 755 app.jar || true
        fi
    fi
fi
