# Main stage
FROM alpine:3.21.2@sha256:56fa17d2a7e7f168a043a2712e63aed1f8543aeafdcee47c58dcffe38ed51099

# Copy necessary files
COPY scripts /scripts
COPY pipeline /pipeline
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
#COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
COPY build/libs/*.jar app.jar

ARG VERSION_TAG

LABEL org.opencontainers.image.title="Stirling-PDF"
LABEL org.opencontainers.image.description="A powerful locally hosted web-based PDF manipulation tool supporting 50+ operations including merging, splitting, conversion, OCR, watermarking, and more."
LABEL org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Stirling-Tools"
LABEL org.opencontainers.image.url="https://www.stirlingpdf.com"
LABEL org.opencontainers.image.documentation="https://docs.stirlingpdf.com"
LABEL maintainer="Stirling-Tools"
LABEL org.opencontainers.image.authors="Stirling-Tools"
LABEL org.opencontainers.image.version="${VERSION_TAG}"
LABEL org.opencontainers.image.keywords="PDF, manipulation, merge, split, convert, OCR, watermark"

# Set Environment Variables
ENV DOCKER_ENABLE_SECURITY=false \
    VERSION_TAG=$VERSION_TAG \
    JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -XX:MaxRAMPercentage=75" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022


# JDK for app
RUN echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/main" | tee -a /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/community" | tee -a /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" | tee -a /etc/apk/repositories && \
    apk upgrade --no-cache -a && \
    apk add --no-cache \
        ca-certificates \
        tzdata \
        tini \
        bash \
        curl \
        qpdf \
        shadow \
        su-exec \
        openssl \
        openssl-dev \
        openjdk21-jre \
# Doc conversion
        libreoffice \
# pdftohtml
        poppler-utils \
# OCR MY PDF (unpaper for descew and other advanced features)
        tesseract-ocr-data-eng \
# CV
        py3-opencv \
# python3/pip
        python3 \
        py3-pip && \
# uno unoconv and HTML
    pip install --break-system-packages --no-cache-dir --upgrade unoconv WeasyPrint pdf2image pillow && \
    mv /usr/share/tessdata /usr/share/tessdata-original && \
    mkdir -p $HOME /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders && \
    fc-cache -f -v && \
    chmod +x /scripts/* && \
    chmod +x /scripts/init.sh && \
# User permissions
    addgroup -S stirlingpdfgroup && adduser -S stirlingpdfuser -G stirlingpdfgroup && \
    chown -R stirlingpdfuser:stirlingpdfgroup $HOME /scripts /usr/share/fonts/opentype/noto /configs /customFiles /pipeline && \
    chown stirlingpdfuser:stirlingpdfgroup /app.jar

EXPOSE 8080/tcp

# Set user and run command
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD ["java", "-Dfile.encoding=UTF-8", "-jar", "/app.jar"]
