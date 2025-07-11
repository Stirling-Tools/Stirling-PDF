# Monolith Dockerfile - Frontend + Backend in same container
# Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Main stage - Backend with frontend files
FROM alpine:3.22.0@sha256:8a1f59ffb675680d47db6337b49d22281a139e9d709335b492be023728e11715

# Copy necessary files
COPY scripts /scripts
COPY pipeline /pipeline
COPY stirling-pdf/src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
COPY stirling-pdf/build/libs/*.jar app.jar

# Copy built frontend files
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

ARG VERSION_TAG

LABEL org.opencontainers.image.title="Stirling-PDF Monolith"
LABEL org.opencontainers.image.description="Single container with both frontend and backend for Stirling-PDF"
LABEL org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Stirling-Tools"
LABEL org.opencontainers.image.url="https://www.stirlingpdf.com"
LABEL org.opencontainers.image.documentation="https://docs.stirlingpdf.com"
LABEL maintainer="Stirling-Tools"
LABEL org.opencontainers.image.authors="Stirling-Tools"
LABEL org.opencontainers.image.version="${VERSION_TAG}"
LABEL org.opencontainers.image.keywords="PDF, manipulation, monolith, single-container"

# Set Environment Variables
ENV DISABLE_ADDITIONAL_FEATURES=true \
    VERSION_TAG=$VERSION_TAG \
    JAVA_BASE_OPTS="-XX:+UnlockExperimentalVMOptions -XX:MaxRAMPercentage=75 -XX:InitiatingHeapOccupancyPercent=20 -XX:+G1PeriodicGCInvokesConcurrent -XX:G1PeriodicGCInterval=10000 -XX:+UseStringDeduplication -XX:G1PeriodicGCSystemLoadThreshold=70" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022 \
    PYTHONPATH=/usr/lib/libreoffice/program:/opt/venv/lib/python3.12/site-packages \
    UNO_PATH=/usr/lib/libreoffice/program \
    URE_BOOTSTRAP=file:///usr/lib/libreoffice/program/fundamentalrc \
    PATH=$PATH:/opt/venv/bin \
    STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf \
    TEMP=/tmp/stirling-pdf \
    TMP=/tmp/stirling-pdf

# Install nginx and all dependencies
RUN echo "@main https://dl-cdn.alpinelinux.org/alpine/edge/main" | tee -a /etc/apk/repositories && \
    echo "@community https://dl-cdn.alpinelinux.org/alpine/edge/community" | tee -a /etc/apk/repositories && \
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
    nginx \
    # Doc conversion
    gcompat \
    libc6-compat \
    libreoffice \
    # pdftohtml
    poppler-utils \
    # OCR MY PDF (unpaper for descew and other advanced features)
    tesseract-ocr-data-eng \
    tesseract-ocr-data-chi_sim \
	tesseract-ocr-data-deu \
	tesseract-ocr-data-fra \
	tesseract-ocr-data-por \
    # CV
    py3-opencv \
    python3 \
    py3-pip \
    py3-pillow@testing \
    py3-pdf2image@testing && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip setuptools && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade unoserver weasyprint && \
    ln -s /usr/lib/libreoffice/program/uno.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program/unohelper.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program /opt/venv/lib/python3.12/site-packages/LibreOffice && \
    mv /usr/share/tessdata /usr/share/tessdata-original && \
    mkdir -p $HOME /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders /tmp/stirling-pdf && \
    fc-cache -f -v && \
    chmod +x /scripts/* && \
    chmod +x /scripts/init.sh && \
    # User permissions
    addgroup -S stirlingpdfgroup && adduser -S stirlingpdfuser -G stirlingpdfgroup && \
    chown -R stirlingpdfuser:stirlingpdfgroup $HOME /scripts /usr/share/fonts/opentype/noto /configs /customFiles /pipeline /tmp/stirling-pdf && \
    chown stirlingpdfuser:stirlingpdfgroup /app.jar && \
    chown -R stirlingpdfuser:stirlingpdfgroup /usr/share/nginx/html

# Copy nginx configuration for monolith
COPY docker/monolith/nginx-monolith.conf /etc/nginx/nginx.conf

# Copy startup script
COPY docker/monolith/start-monolith.sh /start-monolith.sh
RUN chmod +x /start-monolith.sh

# Expose both ports
EXPOSE 80 8080

# Set user and run command
ENTRYPOINT ["tini", "--"]
CMD ["/start-monolith.sh"]