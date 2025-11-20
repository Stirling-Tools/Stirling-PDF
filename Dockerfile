# ==============================================================================
# Multi-stage Dockerfile for Stirling-PDF – image with everything included
# Includes: LibreOffice, Calibre, Tesseract, OCRmyPDF, unoserver, WeasyPrint, etc.
# ==============================================================================

# ========================================
# STAGE 1: Runtime image based on Debian stable-slim
# Contains Java runtime + LibreOffice + Calibre + all PDF tools
# ========================================
FROM debian:stable-slim@sha256:7cb087f19bcc175b96fbe4c2aef42ed00733a659581a80f6ebccfd8fe3185a3d

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive

ENV TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata

# Install core runtime dependencies + tools required by Stirling-PDF features
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata tini bash fontconfig \
    openjdk-21-jre-headless \
    ffmpeg poppler-utils ocrmypdf \
    libreoffice-nogui libreoffice-java-common \
    python3 python3-venv python3-uno \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
    tesseract-ocr-por tesseract-ocr-chi-sim \
    libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    gosu unpaper \
    # AWT headless support (required for some Java graphics operations)
    libfreetype6 libfontconfig1 libx11-6 libxt6 libxext6 libxrender1 libxtst6 libxi6 \
    libxinerama1 libxkbcommon0 libxkbfile1 libsm6 libice6 \
    # Qt WebEngine dependencies for Calibre
    libegl1 libopengl0 libgl1 libxdamage1 libxfixes3 libxshmfence1 libdrm2 libgbm1 \
    libxkbcommon-x11-0 libxrandr2 libxcomposite1 libnss3 libx11-xcb1 \
    libxcb-cursor0 libdbus-1-3 libglib2.0-0 \
    # Virtual framebuffer (required for headless LibreOffice)
    xvfb x11-utils coreutils \
    # Temporary packages only needed for Calibre installer
    xz-utils gpgv curl xdg-utils \
    \
    # Install Calibre from official installer script
    && curl -fsSL https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin \
    \
    # Clean up installer-only packages
    && apt-get purge -y xz-utils gpgv curl xdg-utils \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Make ebook-convert available in PATH
RUN ln -sf /opt/calibre/ebook-convert /usr/bin/ebook-convert \
    && /opt/calibre/ebook-convert --version

# ==============================================================================
# Create non-root user (stirlingpdfuser) with configurable UID/GID
# ==============================================================================
ARG PUID=1000
ARG PGID=1000

RUN set -eux; \
    # Create group if it doesn't exist
    if ! getent group stirlingpdfgroup >/dev/null 2>&1; then \
    if getent group "${PGID}" >/dev/null 2>&1; then \
    groupadd -o -g "${PGID}" stirlingpdfgroup; \
    else \
    groupadd -g "${PGID}" stirlingpdfgroup; \
    fi; \
    fi; \
    # Create user if it doesn't exist, avoid UID conflicts
    if ! id -u stirlingpdfuser >/dev/null 2>&1; then \
    if getent passwd | awk -F: -v id="${PUID}" '$3==id{found=1} END{exit !found}'; then \
    echo "UID ${PUID} already in use – creating stirlingpdfuser with automatic UID"; \
    useradd -m -g stirlingpdfgroup -d /home/stirlingpdfuser -s /bin/bash stirlingpdfuser; \
    else \
    useradd -m -u "${PUID}" -g stirlingpdfgroup -d /home/stirlingpdfuser -s /bin/bash stirlingpdfuser; \
    fi; \
    fi

# Compatibility alias for older entrypoint scripts expecting su-exec
RUN ln -sf /usr/sbin/gosu /usr/local/bin/su-exec

# Copy application files from build stage
COPY scripts/ /scripts/
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/
COPY app/core/build/libs/*.jar app.jar

# Optional version tag (can be passed at build time)
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

# ==============================================================================
# Runtime environment variables
# ==============================================================================
ENV DISABLE_ADDITIONAL_FEATURES=true \
    JAVA_BASE_OPTS="-XX:+UnlockExperimentalVMOptions -XX:MaxRAMPercentage=75 -XX:InitiatingHeapOccupancyPercent=20 \
    -XX:+G1PeriodicGCInvokesConcurrent -XX:G1PeriodicGCInterval=10000 \
    -XX:+UseStringDeduplication -XX:G1PeriodicGCSystemLoadThreshold=70 \
    -Djava.awt.headless=true" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=${PUID} \
    PGID=${PGID} \
    UMASK=022 \
    UNO_PATH=/usr/lib/libreoffice/program \
    STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf \
    TEMP=/tmp/stirling-pdf \
    TMP=/tmp/stirling-pdf

# ==============================================================================
# Python virtual environment for additional Python tools (WeasyPrint, OpenCV, etc.)
# ==============================================================================
RUN python3 -m venv /opt/venv --system-site-packages \
    && /opt/venv/bin/pip install --no-cache-dir weasyprint pdf2image opencv-python-headless \
    && /opt/venv/bin/python -c "import cv2; print('OpenCV version:', cv2.__version__)"

# Separate venv for unoserver (keeps it isolated)
RUN python3 -m venv /opt/unoserver-venv --system-site-packages \
    && /opt/unoserver-venv/bin/pip install --no-cache-dir unoserver

# Make unoserver tools available in main venv PATH
RUN ln -sf /opt/unoserver-venv/bin/unoconvert /opt/venv/bin/unoconvert \
    && ln -sf /opt/unoserver-venv/bin/unoserver /opt/venv/bin/unoserver

# Extend PATH to include both virtual environments
ENV PATH="/opt/venv/bin:/opt/unoserver-venv/bin:${PATH}"

# Symlink Tesseract language data to expected location
# RUN set -eux; \
#     if [ -d /usr/share/tesseract-ocr/5/tessdata ]; then \
#       TESS_PATH=/usr/share/tesseract-ocr/5/tessdata; \
#     else \
#       TESS_PATH="$(find /usr/share/tesseract-ocr -type d -name tessdata | head -1 || true)"; \
#     fi; \
#     [ -n "$TESS_PATH" ] || { echo "ERROR: tessdata directory not found!" >&2; exit 1; }; \
#     rm -f /usr/share/tessdata || true; \
#     ln -s "$TESS_PATH" /usr/share/tessdata; \
#     echo "Linked tessdata: $TESS_PATH → /usr/share/tessdata"

# ==============================================================================
# Final permissions, directories and font cache
# ==============================================================================
RUN set -eux; \
    chmod +x /scripts/*; \
    mkdir -p /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders /tmp/stirling-pdf; \
    chown -R stirlingpdfuser:stirlingpdfgroup \
    /home/stirlingpdfuser /configs /logs /customFiles /pipeline /tmp/stirling-pdf \
    /app.jar /usr/share/fonts/truetype /scripts; \
    chmod -R 755 /tmp/stirling-pdf

# Rebuild font cache
RUN fc-cache -f -v

# Force Qt/WebEngine to run headlessly (required for Calibre in Docker)
ENV QT_QPA_PLATFORM=offscreen \
    QTWEBENGINE_CHROMIUM_FLAGS="--disable-gpu --disable-dev-shm-usage"

# Expose web UI port
EXPOSE 8080/tcp

# Use tini as init (handles signals and zombies correctly)
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]

# CMD is empty – actual start command is defined in init.sh
CMD []
