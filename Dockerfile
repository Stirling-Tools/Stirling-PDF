# Use the base image
FROM frooodle/stirling-pdf-base:version8

ARG VERSION_TAG

# Set Environment Variables
ENV DOCKER_ENABLE_SECURITY=false \
    HOME=/home/stirlingpdfuser \
    VERSION_TAG=$VERSION_TAG \
    JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -XX:MaxRAMPercentage=75"
#    PUID=1000 \
#    PGID=1000 \
#    UMASK=022 \
    

# Create user and group
##RUN groupadd -g $PGID stirlingpdfgroup && \
##    useradd -u $PUID -g stirlingpdfgroup -s /bin/sh stirlingpdfuser && \
##    mkdir -p $HOME && chown stirlingpdfuser:stirlingpdfgroup $HOME

# Set up necessary directories and permissions
RUN mkdir -p /scripts /usr/share/fonts/opentype/noto /usr/share/tesseract-ocr /configs /logs /customFiles /pipeline /pipeline/defaultWebUIConfigs  /pipeline/watchedFolders /pipeline/finishedFolders
##&& \
##    chown -R stirlingpdfuser:stirlingpdfgroup /scripts /usr/share/fonts/opentype/noto /usr/share/tesseract-ocr /configs /customFiles && \
##    chown -R stirlingpdfuser:stirlingpdfgroup /usr/share/tesseract-ocr-original

# Copy necessary files
COPY ./scripts/* /scripts/
COPY ./pipeline/ /pipeline/
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
COPY build/libs/*.jar app.jar

# Set font cache and permissions
RUN fc-cache -f -v && chmod +x /scripts/*

##&& \
##    chown stirlingpdfuser:stirlingpdfgroup /app.jar && \
##    chmod +x /scripts/init.sh

# Expose necessary ports
EXPOSE 8080

# Set user and run command
##USER stirlingpdfuser
ENTRYPOINT ["/scripts/init.sh"]
CMD ["java", "-jar", "/app.jar"]
