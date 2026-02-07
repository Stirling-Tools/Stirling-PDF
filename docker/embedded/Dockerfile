# Stirling-PDF Dockerfile - Full version with embedded frontend
# Single JAR contains both frontend and backend

# Stage 1: Build application with embedded frontend
FROM gradle:8.14-jdk21@sha256:051d9a116793bdc5175a3f97a545718b750489eee85a7da20913c8a53f722a72 AS build

# Install Node.js and npm for frontend build
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm --version \
    && node --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy gradle files for dependency resolution
COPY build.gradle .
COPY settings.gradle .
COPY gradlew .
COPY gradle gradle/
COPY app/core/build.gradle core/.
COPY app/common/build.gradle common/.
COPY app/proprietary/build.gradle proprietary/.
RUN ./gradlew build -x spotlessApply -x spotlessCheck -x test -x sonarqube || return 0

# Set working directory
WORKDIR /app

# Copy entire project
COPY . .

# Build JAR with embedded frontend (includes security features controlled at runtime)
RUN DISABLE_ADDITIONAL_FEATURES=false \
    ./gradlew clean build -PbuildWithFrontend=true -x spotlessApply -x spotlessCheck -x test -x sonarqube

# Stage 2: Runtime image based on Debian stable-slim
# Contains Java runtime + LibreOffice + Calibre + all PDF tools
FROM debian:stable-slim@sha256:4448d44b91bf4a13cb1b4e02d9d5f87ed40621d6e33f0ae7b6ddf71d57e29364

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

ENV TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata

# Install core runtime dependencies + tools required by Stirling-PDF features
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata tini bash fontconfig \
    openjdk-21-jre-headless \
    ffmpeg poppler-utils ocrmypdf imagemagick fontforge ghostscript \
    fonts-dejavu \
    fonts-liberation fonts-liberation2 \
    fonts-crosextra-caladea fonts-crosextra-carlito \
    fonts-linuxlibertine \
    fonts-noto-core fonts-noto-cjk fonts-noto-mono fonts-noto-ui-core \
    fonts-noto-color-emoji \
    ttf-wqy-zenhei \
    fonts-arphic-ukai fonts-arphic-uming \
    python3 python3-venv python3-uno \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
    tesseract-ocr-por tesseract-ocr-chi-sim \
    libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    gosu unpaper qpdf \
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
    && apt-get purge -y xz-utils gpgv xdg-utils \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    . /etc/os-release; \
    echo "deb http://deb.debian.org/debian ${VERSION_CODENAME}-backports main" > /etc/apt/sources.list.d/backports.list; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t ${VERSION_CODENAME}-backports \
        libreoffice libreoffice-java-common; \
    rm -rf /var/lib/apt/lists/*; \
    libreoffice --version

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
COPY --from=build --chown=stirlingpdfuser:stirlingpdfgroup /app/app/core/build/libs/*.jar /app.jar
COPY --from=build --chown=stirlingpdfuser:stirlingpdfgroup /app/build/libs/restart-helper.jar /restart-helper.jar
COPY scripts/ /scripts/
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Optional version tag (can be passed at build time)
ARG VERSION_TAG

# Metadata labels
LABEL org.opencontainers.image.title="Stirling-PDF"
LABEL org.opencontainers.image.description="Stirling-PDF with embedded frontend - Full version with Calibre, LibreOffice, Tesseract, OCRmyPDF, and more"
LABEL org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Stirling-Tools"
LABEL org.opencontainers.image.url="https://www.stirlingpdf.com"
LABEL org.opencontainers.image.documentation="https://docs.stirlingpdf.com"
LABEL maintainer="Stirling-Tools"
LABEL org.opencontainers.image.authors="Stirling-Tools"
LABEL org.opencontainers.image.version="${VERSION_TAG}"
LABEL org.opencontainers.image.keywords="PDF, manipulation, API, Spring Boot, React"

# ==============================================================================
# Runtime environment variables
# ==============================================================================
ENV VERSION_TAG=$VERSION_TAG \
    JAVA_BASE_OPTS="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:+UnlockExperimentalVMOptions -XX:MaxRAMPercentage=75 -XX:InitiatingHeapOccupancyPercent=20 -XX:+G1PeriodicGCInvokesConcurrent -XX:G1PeriodicGCInterval=10000 -XX:+UseStringDeduplication -XX:G1PeriodicGCSystemLoadThreshold=70 -Djava.awt.headless=true" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=${PUID} \
    PGID=${PGID} \
    UMASK=022 \
    UNO_PATH=/usr/lib/libreoffice/program \
    LIBREOFFICE_BIN_PATH=/usr/lib/libreoffice/program/soffice.bin \
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
ARG UNOSERVER_VERSION=3.6
RUN python3 -m venv /opt/unoserver-venv --system-site-packages \
    && /opt/unoserver-venv/bin/pip install --no-cache-dir "unoserver==${UNOSERVER_VERSION}"

# Make unoserver tools available in main venv PATH
RUN ln -sf /opt/unoserver-venv/bin/unoconvert /opt/venv/bin/unoconvert \
    && ln -sf /opt/unoserver-venv/bin/unoserver /opt/venv/bin/unoserver

# Extend PATH to include both virtual environments
ENV PATH="/opt/venv/bin:/opt/unoserver-venv/bin:${PATH}"

# ==============================================================================
# Final permissions, directories and font cache
# ==============================================================================
RUN set -eux; \
    chmod +x /scripts/*; \
    mkdir -p /configs /configs/heap_dumps /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders /tmp/stirling-pdf; \
    chown -R stirlingpdfuser:stirlingpdfgroup \
    /home/stirlingpdfuser /configs /logs /customFiles /pipeline /tmp/stirling-pdf \
    /app.jar /restart-helper.jar /usr/share/fonts/truetype /scripts; \
    chmod -R 755 /tmp/stirling-pdf

# Rebuild font cache
RUN fc-cache -f -v

# Force Qt/WebEngine to run headlessly (required for Calibre in Docker)
ENV QT_QPA_PLATFORM=offscreen \
    QTWEBENGINE_CHROMIUM_FLAGS="--disable-gpu --disable-dev-shm-usage"

# Expose web UI port
EXPOSE 8080/tcp

STOPSIGNAL SIGTERM

# Use tini as init (handles signals and zombies correctly)
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]

# CMD is empty – actual start command is defined in init.sh
CMD []
