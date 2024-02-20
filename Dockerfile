# Main stage
FROM alpine:3.19.1

# JDK for app
RUN echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/main" | tee -a /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/community" | tee -a /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" | tee -a /etc/apk/repositories && \
    apk add --no-cache \
        ca-certificates \
        tzdata \
        tini \
        bash \
        curl \
        openjdk17-jre \
# Doc conversion
        libreoffice@testing \
# OCR MY PDF (unpaper for descew and other advanced featues)
        ocrmypdf \
        tesseract-ocr-data-eng \
# CV
        py3-opencv \
# python3/pip
        python3 && \
    wget https://bootstrap.pypa.io/get-pip.py -qO - | python3 - --break-system-packages --no-cache-dir --upgrade && \
# uno unoconv and HTML
    pip install --break-system-packages --no-cache-dir --upgrade unoconv WeasyPrint


ARG VERSION_TAG

# Set Environment Variables
ENV DOCKER_ENABLE_SECURITY=false \
    HOME=/home/stirlingpdfuser \
    VERSION_TAG=$VERSION_TAG \
    JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -XX:MaxRAMPercentage=75"
#    PUID=1000 \
#    PGID=1000 \
#    UMASK=022 \

# Copy necessary files
COPY scripts /scripts
COPY pipeline /pipeline
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto
COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto
COPY build/libs/*.jar app.jar

# Create user and group
##RUN groupadd -g $PGID stirlingpdfgroup && \
##    useradd -u $PUID -g stirlingpdfgroup -s /bin/sh stirlingpdfuser && \
##    mkdir -p $HOME && chown stirlingpdfuser:stirlingpdfgroup $HOME && \
# Set up necessary directories and permissions
RUN mkdir -p  /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders && \
##&& \
##    chown -R stirlingpdfuser:stirlingpdfgroup /scripts /usr/share/fonts/opentype/noto /usr/share/tesseract-ocr /configs /customFiles && \
##    chown -R stirlingpdfuser:stirlingpdfgroup /usr/share/tesseract-ocr-original && \
# Set font cache and permissions
    fc-cache -f -v && \
    chmod +x /scripts/*
##    chown stirlingpdfuser:stirlingpdfgroup /app.jar && \
##    chmod +x /scripts/init.sh

EXPOSE 8080

# location for the additional tesseract OCR language files
VOLUME /languages

# Set user and run command
##USER stirlingpdfuser
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD ["java", "-Dfile.encoding=UTF-8", "-jar", "/app.jar"]
