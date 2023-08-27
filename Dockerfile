# Build jbig2enc in a separate stage
FROM frooodle/stirling-pdf-base:beta4

ARG ENABLE_SECURITY_DEFAULT=false
ENV ENABLE_SECURITY=$ENABLE_SECURITY_DEFAULT

ARG VERSION_TAG=v0.12.2

# Create scripts folder and copy local scripts
RUN mkdir /scripts
COPY ./scripts/* /scripts/

#Install fonts
RUN mkdir /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
RUN fc-cache -f -v

# Depending on the ENABLE_SECURITY flag, download the correct JAR
RUN if [ "$ENABLE_SECURITY" = "true" ]; then \
    wget -O app.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login-$VERSION_TAG.jar; \
    else \
    wget -O app.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-$VERSION_TAG.jar; \
    fi

# Expose the application port
EXPOSE 8080

# Set environment variables
ENV APP_HOME_NAME="Stirling PDF"

# Run the application
RUN chmod +x /scripts/init.sh
ENTRYPOINT ["/scripts/init.sh"]
CMD ["java", "-jar", "/app.jar"]
