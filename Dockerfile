# Build jbig2enc in a separate stage
FROM frooodle/stirling-pdf-base:beta4

ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG

ENV ENABLE_SECURITY=false

ARG ALPHA=false
ENV ALPHA=$ALPHA


# Create scripts folder and copy local scripts
RUN mkdir /scripts
COPY ./scripts/* /scripts/

#Install fonts
RUN mkdir /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
RUN fc-cache -f -v

# Depending on the ENABLE_SECURITY flag, download the correct JAR
COPY build/libs/*.jar app-temp.jar
RUN if [ "$ALPHA" = "true" ]; then \
        mv app-temp.jar app.jar; \
    elif [ "$ENABLE_SECURITY" = "true" ]; then \
        wget -O app.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-with-login-$VERSION_TAG.jar; \
        rm -f app-temp.jar; \
    else \
        wget -O app.jar https://github.com/Frooodle/Stirling-PDF/releases/download/$VERSION_TAG/Stirling-PDF-$VERSION_TAG.jar; \
        rm -f app-temp.jar; \
    fi
    
# Expose the application port
EXPOSE 8080

# Set environment variables
ENV APP_HOME_NAME="Stirling PDF"

# Run the application
RUN chmod +x /scripts/init.sh
ENTRYPOINT ["/scripts/init.sh"]
CMD ["java", "-jar", "/app.jar"]
