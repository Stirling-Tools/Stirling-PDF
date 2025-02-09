# Main stage
FROM alpine:3.21.2@sha256:56fa17d2a7e7f168a043a2712e63aed1f8543aeafdcee47c58dcffe38ed51099 AS base

# Enable testing repositories
RUN echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

# Install Packages
RUN apk upgrade --no-cache -a && \
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
        gcompat \
        libc6-compat \
        libreoffice \
# pdftohtml
        poppler-utils \
# OCR MY PDF (unpaper for descew and other advanced features)
        tesseract-ocr-data-eng \
# CV
        py3-opencv \
# python3/pip
        python3 \
        py3-pip

# uno unoconv and HTML
RUN pip install --break-system-packages --no-cache-dir --upgrade unoconv WeasyPrint pdf2image pillow

RUN [ -d /usr/share/tessdata ] && mv /usr/share/tessdata /usr/share/tessdata-original || true && \
    mkdir -p /home/stirlingpdfuser /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders

# Update font-cache
RUN fc-cache -f -v

# Create user and groups set accessrights and default directories
RUN addgroup -S stirlingpdfgroup && adduser -S stirlingpdfuser -G stirlingpdfgroup && \
    chown -R stirlingpdfuser:stirlingpdfgroup /home/stirlingpdfuser /configs /customFiles /pipeline

# Copy base image into final image
FROM base AS final

ARG VERSION_TAG

# Open Container Initiative Labels
LABEL org.opencontainers.image.title="Stirling-PDF" \
      org.opencontainers.image.description="A powerful locally hosted web-based PDF manipulation tool supporting 50+ operations including merging, splitting, conversion, OCR, watermarking, and more." \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools" \
      org.opencontainers.image.version="${VERSION_TAG}" \
      org.opencontainers.image.keywords="PDF, manipulation, merge, split, convert, OCR, watermark"

# Set environment variables
ENV DOCKER_ENABLE_SECURITY=false \
    VERSION_TAG=${VERSION_TAG} \
    JAVA_TOOL_OPTIONS="-XX:+UnlockExperimentalVMOptions \
-XX:MaxRAMPercentage=75 \
-XX:InitiatingHeapOccupancyPercent=20 \
-XX:+G1PeriodicGCInvokesConcurrent \
-XX:G1PeriodicGCInterval=10000 \
-XX:+UseStringDeduplication \
-XX:G1PeriodicGCSystemLoadThreshold=70" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022

# Copy necessary files
COPY scripts /scripts
COPY pipeline /pipeline
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
# COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
COPY build/libs/*.jar /app.jar

# Customize rights (make scripts executable, set ownership)
RUN chmod +x /scripts/* && \
    chmod +x /scripts/init.sh && \
    chown -R stirlingpdfuser:stirlingpdfgroup /scripts /usr/share/fonts/opentype/noto && \
    chown stirlingpdfuser:stirlingpdfgroup /app.jar

EXPOSE 8080/tcp

ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD ["java", "-Dfile.encoding=UTF-8", "-jar", "/app.jar"]
