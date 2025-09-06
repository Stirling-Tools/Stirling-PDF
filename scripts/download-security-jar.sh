echo "Running Stirling PDF with DISABLE_ADDITIONAL_FEATURES=${DISABLE_ADDITIONAL_FEATURES} and VERSION_TAG=${VERSION_TAG}"
# Check for DISABLE_ADDITIONAL_FEATURES and download the appropriate JAR if required
if [ "$VERSION_TAG" != "alpha" ] && [ "$VERSION_TAG" != "ALPHA" ]; then
    if [ "$DISABLE_ADDITIONAL_FEATURES" = "false" ] || [ "$DISABLE_ADDITIONAL_FEATURES" = "FALSE" ] || [ "$DOCKER_ENABLE_SECURITY" = "true" ] || [ "$DOCKER_ENABLE_SECURITY" = "TRUE" ]; then
        if [ ! -f app-security.jar ]; then
            echo "Trying to download from: https://files.stirlingpdf.com/v$VERSION_TAG/Stirling-PDF-with-login.jar"
            curl -L -o app-security.jar https://files.stirlingpdf.com/v$VERSION_TAG/Stirling-PDF-with-login.jar

            # If the first download attempt failed, try without the 'v' prefix
            if [ $? -ne 0 ]; then
                echo "Trying to download from: https://files.stirlingpdf.com/$VERSION_TAG/Stirling-PDF-with-login.jar"
                curl -L -o app-security.jar https://files.stirlingpdf.com/$VERSION_TAG/Stirling-PDF-with-login.jar
            fi

            if [ $? -eq 0 ]; then  # checks if curl was successful
                rm -f app.jar
                ln -s app-security.jar app.jar
                chown stirlingpdfuser:stirlingpdfgroup app.jar || true
                chmod 755 app.jar || true
            fi
        fi
    fi
fi
