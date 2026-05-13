# Stirling-PDF Base Image
# Pre-built tools: Calibre, Ghostscript, QPDF, ImageMagick, Python venv with AI/OCR packages
# This image is reused by Dockerfile and Dockerfile.fat to avoid rebuilding tools on every app release

ARG TARGETPLATFORM

# Stage 1: Build and strip Calibre
FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b AS calibre-build
ARG TARGETPLATFORM
ARG CALIBRE_VERSION=9.4.0
ARG CALIBRE_STRIP_WEBENGINE=false

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils libnss3 libfontconfig1 \
      libgl1 libegl1 libdbus-1-3 libasound2t64 libxcomposite1 \
      libxrandr2 libxkbcommon0 libxi6 libxtst6 libopengl0 \
      poppler-utils; \
    rm -rf /var/lib/apt/lists/*; \
    \
    case "$(uname -m)" in \
      x86_64)  CALIBRE_ARCH="x86_64" ;; \
      aarch64) CALIBRE_ARCH="arm64" ;; \
      *)       echo "Unsupported arch: $(uname -m)"; exit 1 ;; \
    esac; \
    \
    for attempt in 1 2 3; do \
      echo "Downloading Calibre (attempt $attempt/3)..."; \
      if curl -fsSL --max-time 300 --retry 3 --retry-delay 5 --retry-max-time 900 \
        "https://download.calibre-ebook.com/${CALIBRE_VERSION}/calibre-${CALIBRE_VERSION}-${CALIBRE_ARCH}.txz" \
        -o /tmp/calibre.txz; then \
        break; \
      fi; \
      if [ $attempt -lt 3 ]; then sleep 10; fi; \
    done; \
    mkdir -p /opt/calibre; \
    tar xJf /tmp/calibre.txz -C /opt/calibre; \
    rm /tmp/calibre.txz; \
    \
    # We only need Qt6 WebEngine (Chromium) for ebook->PDF output.
    # PDF INPUT now uses the pdftohtml engine (poppler), not Qt.
    rm -f  /opt/calibre/lib/libQt6Designer* \
           /opt/calibre/lib/libQt6Multimedia* \
           /opt/calibre/lib/libQt6SpatialAudio.so.* \
           /opt/calibre/lib/libQt6NetworkAuth.so.* \
           /opt/calibre/lib/libQt6Concurrent.so.* \
           /opt/calibre/lib/libQt6OpenGLWidgets.so.* \
           /opt/calibre/lib/libQt6QuickWidgets.so.* \
           /opt/calibre/lib/libQt6Svg.so.* \
           /opt/calibre/lib/libQt6SvgWidgets.so.* \
           /opt/calibre/lib/libQt6Pdf*.so.* \
           /opt/calibre/lib/libQt6ShaderTools.so.* \
           /opt/calibre/lib/libQt6SerialPort.so.* \
           /opt/calibre/lib/libQt6Sensors.so.* \
           /opt/calibre/lib/libQt6Test.so.* \
           /opt/calibre/lib/libQt6Sql.so.* \
           /opt/calibre/lib/libQt6RemoteObjects.so.* \
           /opt/calibre/lib/libQt6Help.so.* \
           /opt/calibre/lib/libQt6VirtualKeyboard.so.* \
           /opt/calibre/lib/libQt6WaylandClient.so.* \
           /opt/calibre/lib/libQt6WaylandCompositor.so.* \
           /opt/calibre/lib/libQt6Bluetooth.so.* \
           /opt/calibre/lib/libQt6Nfc.so.* \
           /opt/calibre/lib/libQt6Charts.so.* \
           /opt/calibre/lib/libQt6DataVisualization.so.* \
           /opt/calibre/lib/libQt6Scxml.so.* \
           /opt/calibre/lib/libQt6StateMachine.so.* \
           /opt/calibre/lib/libQt6TextToSpeech.so.* \
           /opt/calibre/lib/libQt63D*.so.* \
           /opt/calibre/lib/libavcodec.so.* \
           /opt/calibre/lib/libavfilter.so.* \
           /opt/calibre/lib/libavformat.so.* \
           /opt/calibre/lib/libavutil.so.* \
           /opt/calibre/lib/libavdevice.so.* \
           /opt/calibre/lib/libpostproc.so.* \
           /opt/calibre/lib/libswresample.so.* \
           /opt/calibre/lib/libswscale.so.* \
           /opt/calibre/lib/libspeex.so.* \
           /opt/calibre/lib/libFLAC.so.* \
           /opt/calibre/lib/libopus.so.* \
           /opt/calibre/lib/libvorbis*.so.* \
           /opt/calibre/lib/libasyncns.so.* \
           /opt/calibre/lib/libspeechd.so.* \
           /opt/calibre/lib/libespeak-ng.so.* \
           /opt/calibre/lib/libonnxruntime.so.* \
           /opt/calibre/lib/libgio-2.0.so.* \
           /opt/calibre/lib/libzstd.so.* \
           /opt/calibre/lib/libhunspell-1.7.so.* \
           /opt/calibre/lib/libbrotlienc.so.* \
           /opt/calibre/lib/libbrotlicommon.so.* \
           /opt/calibre/lib/libbrotlidec.so.* \
           /opt/calibre/lib/libstemmer.so.* \
           /opt/calibre/lib/libmtp.so.* \
           /opt/calibre/lib/libncursesw.so.* \
           /opt/calibre/lib/libchm.so.* \
           /opt/calibre/lib/libgcrypt.so.* \
           /opt/calibre/lib/libgpg-error.so.* \
           /opt/calibre/lib/libicuio.so.* \
           /opt/calibre/lib/libreadline.so.* \
           /opt/calibre/lib/libusb-1.0.so.* \
           /opt/calibre/lib/libpulse*.so.* \
           /opt/calibre/lib/libsndfile.so.* \
           /opt/calibre/lib/libmpv.so.* \
           /opt/calibre/lib/libass.so.* \
           /opt/calibre/lib/librubberband.so.* \
           /opt/calibre/lib/libsamplerate.so.*; \
    rm -rf /opt/calibre/lib/qt6/plugins/platformthemes \
           /opt/calibre/lib/qt6/plugins/multimedia \
           /opt/calibre/lib/qt6/plugins/designer \
           /opt/calibre/lib/qt6/plugins/virtualkeyboard \
           /opt/calibre/lib/qt6/plugins/wayland* \
           /opt/calibre/lib/qt6/plugins/texttospeech \
           /opt/calibre/lib/qt6/plugins/position \
           /opt/calibre/lib/qt6/plugins/sensors \
           /opt/calibre/lib/qt6/plugins/sqldrivers \
           /opt/calibre/lib/qt6/plugins/canbus \
           /opt/calibre/lib/qt6/plugins/sceneparsers \
           /opt/calibre/lib/qt6/plugins/renderers \
           /opt/calibre/lib/qt6/plugins/geometryloaders \
           /opt/calibre/lib/qt6/plugins/generic \
           /opt/calibre/lib/qt6/plugins/qmltooling \
           /opt/calibre/lib/qt6/libexec/QtWebEngineProcess.bak; \
    rm -rf /opt/calibre/plugins/sqldrivers \
           /opt/calibre/plugins/multimedia \
           /opt/calibre/plugins/wayland-shell-integration \
           /opt/calibre/plugins/wayland-graphics-integration-client \
           /opt/calibre/plugins/wayland-decoration-client \
           /opt/calibre/plugins/texttospeech \
           /opt/calibre/plugins/platformthemes \
           /opt/calibre/plugins/platforminputcontexts \
           /opt/calibre/plugins/egldeviceintegrations \
           /opt/calibre/plugins/iconengines; \
    \
    # Remove GUI executables but keep ebook-convert, ebook-meta, and calibre-parallel.
    rm -f  /opt/calibre/calibre \
           /opt/calibre/calibre-server \
           /opt/calibre/calibre-smtp \
           /opt/calibre/calibre-debug \
           /opt/calibre/calibre-customize \
           /opt/calibre/calibredb \
           /opt/calibre/ebook-viewer \
           /opt/calibre/ebook-edit \
           /opt/calibre/ebook-polish \
           /opt/calibre/ebook-device \
           /opt/calibre/fetch-ebook-metadata \
           /opt/calibre/lrf2lrs \
           /opt/calibre/lrs2lrf \
           /opt/calibre/markdown-calibre \
           /opt/calibre/web2disk; \
    \
    # Remove Python modules not needed for conversion.
    rm -rf /opt/calibre/lib/calibre/gui2 \
           /opt/calibre/lib/calibre/devices \
           /opt/calibre/lib/calibre/library \
           /opt/calibre/lib/calibre/db \
           /opt/calibre/lib/calibre/srv \
           /opt/calibre/lib/calibre/spell \
           /opt/calibre/lib/calibre/live \
           /opt/calibre/lib/calibre/utils/piper \
           /opt/calibre/lib/calibre/utils/certgen.so \
           /opt/calibre/lib/calibre/utils/https \
           /opt/calibre/lib/calibre/utils/mdns; \
    \
    # Remove resources not needed for CLI conversion.
    rm -rf /opt/calibre/resources/images \
           /opt/calibre/resources/icons \
           /opt/calibre/resources/icons.rcc \
           /opt/calibre/resources/content-server \
           /opt/calibre/resources/editor* \
           /opt/calibre/resources/viewer \
           /opt/calibre/resources/viewer.js \
           /opt/calibre/resources/viewer.html \
           /opt/calibre/resources/recipes \
           /opt/calibre/resources/dictionaries \
           /opt/calibre/resources/hyphenation \
           /opt/calibre/resources/catalog \
           /opt/calibre/resources/calibre-mimetypes.xml \
           /opt/calibre/resources/changelog.json \
           /opt/calibre/resources/user-agent-data.json \
           /opt/calibre/resources/builtin_recipes.zip \
           /opt/calibre/resources/builtin_recipes.xml \
           /opt/calibre/resources/stylelint-bundle.min.js \
           /opt/calibre/resources/stylelint.js \
           /opt/calibre/resources/rapydscript \
           /opt/calibre/resources/quick_start \
           /opt/calibre/resources/piper-voices.json \
           /opt/calibre/resources/images.qrc \
           /opt/calibre/resources/mozilla-ca-certs.pem \
           /opt/calibre/resources/ebook-convert-complete.calibre_msgpack \
           /opt/calibre/resources/mathjax \
           /opt/calibre/resources/common-english-words.txt \
           /opt/calibre/resources/calibre-portable.sh \
           /opt/calibre/resources/calibre-portable.bat \
           /opt/calibre/resources/metadata_sqlite.sql \
           /opt/calibre/resources/notes_sqlite.sql \
           /opt/calibre/resources/fts_sqlite.sql \
           /opt/calibre/resources/fts_triggers.sql \
           /opt/calibre/resources/jacket \
           /opt/calibre/resources/editor-functions.json \
           /opt/calibre/resources/calibre-ebook-root-CA.crt \
           /opt/calibre/resources/csscolorparser.js \
           /opt/calibre/resources/lookup.js \
           /opt/calibre/resources/pdf-mathjax-loader.js \
           /opt/calibre/resources/scraper.js \
           /opt/calibre/resources/toc.js \
           /opt/calibre/resources/user-manual-translation-stats.json \
           /opt/calibre/resources/pin-template.svg \
           /opt/calibre/resources/scripts.calibre_msgpack \
           /opt/calibre/resources/fonts \
           /opt/calibre/resources/qtwebengine_devtools_resources.pak \
           /opt/calibre/lib/calibre/ebooks/docx/images \
           /opt/calibre/share \
           /opt/calibre/man; \
    \
    # Remove translations and localization while keeping required libraries.
    # Keep iso639.calibre_msgpack (required)
    # Keep only en-US.pak from qtwebengine_locales (required for WebEngine)
    rm -rf /opt/calibre/lib/qt6/translations; \
    find /opt/calibre/translations -mindepth 1 -maxdepth 1 ! -name 'qtwebengine_locales' -exec rm -rf {} +; \
    find /opt/calibre/translations/qtwebengine_locales -type f ! -name 'en-US.pak' -delete 2>/dev/null || true; \
    if [ -d /opt/calibre/resources/localization ]; then \
      rm -rf /opt/calibre/resources/localization/locales.zip \
             /opt/calibre/resources/localization/stats.calibre_msgpack \
             /opt/calibre/resources/localization/website-languages.txt; \
      find /opt/calibre/resources/localization -mindepth 1 -maxdepth 1 ! -name 'iso639.calibre_msgpack' -exec rm -rf {} +; \
    fi; \
    \
    # Strip debug symbols from calibre extension modules.
    # Exclude Qt6 libs: libQt6WebEngineCore and friends embed Chromium V8 JIT code
    # and internal resource blobs that strip corrupts, causing segfaults at render time.
    find /opt/calibre/lib -name '*.so*' \
      ! -name 'libQt6*' \
      -exec strip --strip-unneeded {} + 2>/dev/null || true; \
    \
    # Remove Python bytecode caches.
    find /opt/calibre -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true; \
    find /opt/calibre -name '*.pyc' -delete 2>/dev/null || true; \
    \
    # Verify conversion still works
    # NOTE: txt->epub used intentionally NOT txt->pdf.
    # Calibre 7+ uses WebEngine (Chromium) for PDF output, which requires kernel
    # capabilities unavailable in Docker RUN steps and segfaults under QEMU.
    # epub output exercises the same Python/plugin stack without touching WebEngine.
    /opt/calibre/ebook-convert --version; \
    echo "Hello" > /tmp/test.txt; \
    /opt/calibre/ebook-convert /tmp/test.txt /tmp/test.epub; \
    rm -f /tmp/test.txt /tmp/test.epub; \
    \
    # Verify pdftohtml (poppler) is available for the pdftohtml PDF engine.
    pdftohtml -v >/dev/null 2>&1 && echo "pdftohtml OK" || { echo "ERROR: pdftohtml not found"; exit 1; }; \
    echo "=== Calibre stripped successfully ==="

# Optional: strip Chromium/WebEngine (~80 MB savings) when PDF output via Calibre is not needed.
# Build with --build-arg CALIBRE_STRIP_WEBENGINE=true to enable.
RUN if [ "${CALIBRE_STRIP_WEBENGINE}" = "true" ]; then \
      echo "Stripping Calibre WebEngine (Chromium), PDF output via Calibre will be disabled"; \
      rm -rf /opt/calibre/lib/qt6/libexec/QtWebEngineProcess \
             /opt/calibre/lib/qt6/resources \
             /opt/calibre/lib/libQt6WebEngine*.so.* \
             /opt/calibre/lib/libQt6Quick*.so.* \
             /opt/calibre/lib/libQt6Qml*.so.* \
             /opt/calibre/translations/qtwebengine_locales 2>/dev/null || true; \
      echo "WebEngine stripped, Calibre PDF output disabled"; \
    else \
      echo "CALIBRE_STRIP_WEBENGINE=false, keeping WebEngine for PDF output"; \
    fi


# Stage 2: Build Ghostscript from source
FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b AS gs-build
ARG TARGETPLATFORM
ARG GS_VERSION=10.06.0

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/tmp/gs-build,id=gs-build-${TARGETPLATFORM:-local} \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates libfontconfig1-dev && rm -rf /var/lib/apt/lists/* && \
    GS_TAG="gs$(printf '%s' "${GS_VERSION}" | tr -d '.')" && \
    cd /tmp/gs-build && \
    rm -rf ghostscript-* && \
    (test -d "ghostscript-${GS_VERSION}" || curl -fsSL --max-time 300 --retry 3 --retry-delay 5 "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/${GS_TAG}/ghostscript-${GS_VERSION}.tar.gz" | tar xz) && \
    cd "ghostscript-${GS_VERSION}" && \
    ./configure \
      --prefix=/usr/local \
      --without-x \
      --disable-cups \
      --disable-gtk && \
    make -j"$(nproc)" && \
    make install && \
    cd ..


# Stage 3: Build PDF Tools (QPDF and ImageMagick 7)
FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b AS pdf-tools-build
ARG TARGETPLATFORM
ARG QPDF_VERSION=12.3.2
ARG IM_VERSION=7.1.2-13

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/tmp/pdf-tools-build,id=pdf-tools-${TARGETPLATFORM:-local} \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake libssl-dev libjpeg-dev zlib1g-dev curl ca-certificates pkg-config \
      libpng-dev libtiff-dev libwebp-dev libxml2-dev libfreetype6-dev liblcms2-dev libzip-dev liblqr-1-0-dev \
      libltdl-dev libtool && rm -rf /var/lib/apt/lists/* && \
    cd /tmp/pdf-tools-build && \
    rm -rf qpdf-* ImageMagick-* && \
    # Build QPDF
    (test -d "qpdf-${QPDF_VERSION}" || curl -fsSL --max-time 300 --retry 3 --retry-delay 5 "https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}.tar.gz" | tar xz) && \
    cd "qpdf-${QPDF_VERSION}" && \
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DALLOW_CRYPTO_OPENSSL=ON -DDEFAULT_CRYPTO=openssl && \
    cmake --build build --parallel "$(nproc)" && \
    cmake --install build --strip && \
    cd .. && \
    # Build ImageMagick 7
    (test -d "ImageMagick-${IM_VERSION}" || curl -fsSL --max-time 300 --retry 3 --retry-delay 5 "https://github.com/ImageMagick/ImageMagick/archive/refs/tags/${IM_VERSION}.tar.gz" | tar xz) && \
    cd "ImageMagick-${IM_VERSION}" && \
    ./configure --prefix=/usr/local --with-modules --with-perl=no --with-magick-plus-plus=no --with-quantum-depth=16 --disable-static --enable-shared && \
    make -j"$(nproc)" && \
    make install-strip && \
    # Enable PDF/PS/EPS in policy
    sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /usr/local/etc/ImageMagick-7/policy.xml && \
    sed -i 's/rights="none" pattern="PS"/rights="read|write" pattern="PS"/' /usr/local/etc/ImageMagick-7/policy.xml && \
    sed -i 's/rights="none" pattern="EPS"/rights="read|write" pattern="EPS"/' /usr/local/etc/ImageMagick-7/policy.xml && \
    cd .. && \
    ldconfig /usr/local/lib

# Stage ImageMagick outputs into a single directory so runtime can import them with one COPY
# (reduces 4 separate COPY layers to 1 independent --link layer).
RUN mkdir -p /magick-export/usr/bin \
             /magick-export/usr/local/lib \
             /magick-export/usr/local/etc && \
    cp /usr/local/bin/magick /magick-export/usr/bin/ && \
    cp -a /usr/local/lib/libMagick*.so* /magick-export/usr/local/lib/ && \
    cp -a /usr/local/lib/ImageMagick-7* /magick-export/usr/local/lib/ && \
    cp -a /usr/local/etc/ImageMagick-7  /magick-export/usr/local/etc/


# Stage 4: Build Python venv
FROM ubuntu:noble@sha256:c4a8d5503dfb2a3eb8ab5f807da5bc69a85730fb49b5cfca2330194ebcc41c7b AS python-venv-build
ARG TARGETPLATFORM
ARG UNOSERVER_VERSION=3.6

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv ca-certificates binutils && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /opt/venv --system-site-packages && \
    /opt/venv/bin/pip install --no-cache-dir --prefer-binary --only-binary=:all: \
      weasyprint pdf2image opencv-python-headless ocrmypdf \
      cryptography \
      "unoserver==${UNOSERVER_VERSION}" && \
    find /opt/venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true && \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info && \
    find /opt/venv -name '*.so' -exec strip --strip-unneeded {} + 2>/dev/null || true


# Final runtime image - the actual base image
FROM eclipse-temurin:25-jre-noble@sha256:b27ca47660a8fa837e47a8533b9b1a3a430295cf29ca28d91af4fd121572dc29 AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata

ARG UNOSERVER_VERSION=3.6

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    apt-get update; \
    # Add LibreOffice Fresh PPA for latest version (26.2.x)
    apt-get install -y --no-install-recommends software-properties-common; \
    add-apt-repository -y ppa:libreoffice/ppa; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      # Core tools
      ca-certificates tzdata tini bash fontconfig curl \
      # ffmpeg disabled due to raised CVEs
      # ffmpeg \
      poppler-utils fontforge \
      unpaper pngquant \
      # Fonts: full coverage for standard + fat variants
      fonts-dejavu \
      fonts-liberation2 \
      fonts-crosextra-caladea fonts-crosextra-carlito \
      fonts-noto-core fonts-noto-mono fonts-noto-extra \
      fonts-noto-cjk poppler-data \
      fonts-freefont-ttf fonts-terminus \
      # Python runtime & UNO bridge
      python3 python3-uno python3-packaging \
      # OCR
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
      tesseract-ocr-por tesseract-ocr-chi-sim \
      # Tesseract OSD for orientation detection
      tesseract-ocr-osd \
      # Graphics / AWT headless
      libcairo2 libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
      libfreetype6 libfontconfig1 libx11-6 libxt6 libxext6 libxrender1 \
      libxtst6 libxi6 libxinerama1 libxkbcommon0 libsm6 libice6 \
      # Qt/EGL for Calibre CLI
      libegl1 libgl1 libopengl0 libdbus-1-3 libglib2.0-0 libnss3 \
      libasound2t64 libxcomposite1 libxrandr2 \
      # Virtual framebuffer (required for headless LibreOffice Impress/Draw)
      xvfb x11-utils coreutils \
      libreoffice-writer-nogui libreoffice-calc-nogui \
      libreoffice-impress-nogui libreoffice-draw-nogui \
      libreoffice-base-nogui libreoffice-java-common \
    ; \
    \
    # Verify and fix LibreOffice
    libreoffice --version; \
    soffice --version 2>/dev/null || true; \
    # Rebuild UNO bridge type database
    /usr/lib/libreoffice/program/soffice.bin --headless --convert-to pdf /dev/null 2>/dev/null || true; \
    # Force font cache rebuild
    fc-cache -f -v 2>&1 | awk 'NR <= 20'; \
    \
    # Cleanup stage.
    \
    # Remove PPA helper, no longer needed after apt-get update
    apt-get remove --purge -y software-properties-common || true; \
    apt-get autoremove --purge -y || true; \
    rm -rf /var/lib/apt/lists/*; \
    \
    # Docs / man / info / icons / themes / GUI assets (headless server)
    rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* \
           /usr/share/lintian/* /usr/share/linda/* \
           /usr/share/icons/* /usr/share/themes/* \
           /usr/share/javascript/* \
           /usr/share/gtk-3.0/* \
           /usr/share/fontforge/pixmaps \
           /usr/share/fontforge/osx \
           /usr/share/fontforge/cidmap \
           /usr/share/fontforge/prefs \
           /usr/share/liblangtag/* \
           /usr/share/tcltk/* \
           /usr/share/python-wheels/* \
           /usr/share/glib-2.0/schemas/* \
           /usr/share/mime/* \
           /usr/share/xml/iso-codes \
           /usr/share/GConf \
           /usr/share/bash-completion \
           /usr/share/zsh \
           /usr/share/libmysofa \
           /usr/share/alsa \
           /usr/share/iso-codes \
           /usr/share/perl5 \
           /usr/share/libthai \
           /usr/share/libexttextcat \
           /usr/share/openal \
           /usr/share/gcc; \
    \
    find /usr/share/locale -mindepth 1 -maxdepth 1 -type d \
      ! -name 'en*' -exec rm -rf {} + 2>/dev/null || true; \
    rm -rf /usr/share/i18n/locales /usr/share/i18n/charmaps; \
    \
    rm -rf /usr/lib/libreoffice/share/gallery \
           /usr/lib/libreoffice/share/template \
           /usr/lib/libreoffice/share/wizards \
           /usr/lib/libreoffice/share/autotext \
           /usr/lib/libreoffice/help \
           /usr/lib/libreoffice/share/config/images_*.zip \
           /usr/lib/libreoffice/share/basic \
           /usr/lib/libreoffice/share/Scripts \
           /usr/lib/libreoffice/share/autocorr \
           /usr/lib/libreoffice/share/classification \
           /usr/lib/libreoffice/share/wordbook \
           /usr/lib/libreoffice/share/fingerprint \
           /usr/lib/libreoffice/share/xdg \
           /usr/lib/libreoffice/share/numbertext \
           /usr/lib/libreoffice/share/shell \
           /usr/lib/libreoffice/share/palette \
           /usr/lib/libreoffice/share/theme_definitions \
           /usr/lib/libreoffice/share/xslt \
           /usr/lib/libreoffice/share/labels \
           /usr/lib/libreoffice/share/dtd \
           /usr/lib/libreoffice/share/tipoftheday \
           /usr/lib/libreoffice/share/toolbarmode \
           /usr/lib/libreoffice/share/psprint \
           /usr/lib/libreoffice/CREDITS.fodt \
           /usr/lib/libreoffice/LICENSE.html; \
    \
    # Remove unused LO extensions (GUI-only; not needed for document conversion)
    rm -rf /usr/lib/libreoffice/share/extensions/wiki-publisher \
           /usr/lib/libreoffice/share/extensions/nlpsolver \
           /usr/lib/libreoffice/share/extensions/dict-* 2>/dev/null || true; \
    # Remove LO database components (LO Base; not needed for Writer/Calc/Impress conversion)
    rm -rf /usr/lib/libreoffice/program/libdba* \
           /usr/lib/libreoffice/program/libdbahsql* \
           /usr/lib/libreoffice/program/libdbu* \
           /usr/lib/libreoffice/program/libreport* 2>/dev/null || true; \
    \
    rm -rf /usr/lib/python3.12/test \
           /usr/lib/python3.12/idlelib \
           /usr/lib/python3.12/tkinter \
           /usr/lib/python3.12/lib2to3 \
           /usr/lib/python3.12/pydoc_data; \
    \
    rm -rf /usr/lib/python3/dist-packages/scipy \
           /usr/lib/python3/dist-packages/sympy \
           /usr/lib/python3/dist-packages/mpmath; \
    \
    rm -rf \
      /usr/lib/python3/dist-packages/cffi \
      /usr/lib/python3/dist-packages/cffi-*.dist-info \
      /usr/lib/python3/dist-packages/_cffi_backend*.so \
      /usr/lib/python3/dist-packages/_cffi_backend*.cpython*.so \
      2>/dev/null || true; \
    \
    # Strip debug symbols from ALL shared libraries
    find /usr/lib -name '*.so*' -type f \
        -not -path '*/jvm/*' \
        -not -path '*/libreoffice/*' \
        -exec strip --strip-unneeded {} + 2>/dev/null || true; \
    \
    # Remove GPU backends not needed for headless operation.
    MULTIARCH_LIBDIR=$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null \
      || find /usr/lib -maxdepth 1 -type d -name '*-linux-gnu' | head -1); \
    rm -f \
      "${MULTIARCH_LIBDIR}"/libLLVM*.so* \
      "${MULTIARCH_LIBDIR}"/libgallium*.so* \
      2>/dev/null || true; \
    \
    find /usr/lib/python3* -type d -name __pycache__ \
        -exec rm -rf {} + 2>/dev/null || true; \
    find /usr/lib/python3* \( -name '*.pyc' -o -name '*.pyi' \) \
        -delete 2>/dev/null || true; \
    \
    rm -rf /usr/share/bug /usr/share/lintian /usr/share/linda \
           /var/lib/dpkg/info/*.list \
           /var/lib/dpkg/info/*.md5sums \
           /var/lib/dpkg/info/*.conffiles \
           /var/lib/dpkg/info/*.postinst \
           /var/lib/dpkg/info/*.preinst \
           /var/lib/dpkg/info/*.prerm \
           /var/lib/dpkg/info/*.postrm \
           /var/lib/dpkg/info/*.triggers \
           /var/lib/dpkg/info/*.shlibs \
           /var/lib/dpkg/info/*.symbols \
           /var/lib/dpkg/info/*.templates \
           /var/log/dpkg.log /var/log/apt/* \
           /usr/local/share/ghostscript/*/doc \
           /usr/local/share/ghostscript/*/examples \
           /usr/share/ImageMagick-*/doc \
           /usr/share/ImageMagick-*/www; \
    \
    # Tesseract training configs (not needed for OCR, but keep configs/ for hocr/txt output)
    rm -rf /usr/share/tesseract-ocr/*/tessdata/tessconfigs; \
    \
    # Noto fonts: keep Regular weight only (~370MB savings)
    find /usr/share/fonts/truetype/noto -type f \
        ! -name '*Regular*' -delete 2>/dev/null || true; \
    find /usr/share/fonts/opentype -type f \
        ! -name '*Regular*' -delete 2>/dev/null || true; \
    # DejaVu: keep Regular and Bold only
    find /usr/share/fonts/truetype -name '*DejaVu*' \
        ! -name '*-Regular*' ! -name '*-Bold*' ! -name '*Bold.ttf' \
        ! -name 'DejaVuSans.ttf' ! -name 'DejaVuSerif.ttf' ! -name 'DejaVuSansMono.ttf' \
        -type f -delete 2>/dev/null || true; \
    # Remove empty font directories after cleanup
    find /usr/share/fonts -type d -empty -delete 2>/dev/null || true; \
    \
    # gconv: keep only essential charset conversion modules
    GCONV_DIR=$(find /usr/lib -type d -name gconv 2>/dev/null | head -1); \
    if [ -n "$GCONV_DIR" ] && [ -d "$GCONV_DIR" ]; then \
      mkdir -p /tmp/gconv-keep; \
      for mod in UTF-8.so UTF-16.so UTF-32.so UTF-7.so \
                 ISO8859-1.so ISO8859-15.so ISO8859-2.so ISO8859-9.so \
                 UNICODE.so CP1252.so CP1251.so CP1250.so \
                 EUC-JP.so EUC-KR.so EUC-CN.so \
                 SHIFT_JIS.so GB18030.so BIG5.so \
                 gconv-modules gconv-modules.d gconv-modules.cache; do \
        [ -e "$GCONV_DIR/$mod" ] && \
          cp -a "$GCONV_DIR/$mod" /tmp/gconv-keep/ 2>/dev/null || true; \
      done; \
      rm -rf "$GCONV_DIR"/*; \
      cp -a /tmp/gconv-keep/* "$GCONV_DIR/" 2>/dev/null || true; \
      rm -rf /tmp/gconv-keep; \
    fi; \
    \
    # Misc caches
    rm -rf /var/cache/fontconfig/* /tmp/*

# External tool layers, all use --link for independent layer caching and parallel pulls.
COPY --link --from=calibre-build   /opt/calibre           /opt/calibre
COPY --link --from=pdf-tools-build /usr/local/bin/qpdf    /usr/bin/qpdf
# ImageMagick: 4 layers collapsed to 1 via the magick-export staging dir in pdf-tools-build
COPY --link --from=pdf-tools-build /magick-export/        /
COPY --link --from=gs-build        /usr/local/bin/gs                /usr/local/bin/gs
COPY --link --from=gs-build        /usr/local/share/ghostscript     /usr/local/share/ghostscript
# Python venv pre-built (no pip install at runtime, no build tools needed)
COPY --link --from=python-venv-build /opt/venv /opt/venv

RUN ldconfig /usr/local/lib && \
    PYTHONDONTWRITEBYTECODE=1 \
      /opt/venv/bin/python -c "import cffi; print('cffi OK:', cffi.__version__)" && \
    PYTHONDONTWRITEBYTECODE=1 \
      /opt/venv/bin/python -c "import cv2; print('OpenCV', cv2.__version__)" && \
    PYTHONDONTWRITEBYTECODE=1 \
      /opt/venv/bin/python -c "import ocrmypdf; print('ocrmypdf OK')" && \
    find /opt/venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Non-root user
ARG PUID=1000
ARG PGID=1000

RUN set -eux; \
    if ! getent group stirlingpdfgroup >/dev/null 2>&1; then \
      groupadd -g "${PGID}" stirlingpdfgroup 2>/dev/null \
        || groupadd stirlingpdfgroup; \
    fi; \
    if ! id -u stirlingpdfuser >/dev/null 2>&1; then \
      useradd -m -u "${PUID}" -g stirlingpdfgroup \
        -d /home/stirlingpdfuser -s /bin/bash stirlingpdfuser 2>/dev/null \
        || useradd -m -g stirlingpdfgroup \
          -d /home/stirlingpdfuser -s /bin/bash stirlingpdfuser; \
    fi

# Application directories
RUN set -eux; \
    mkdir -p /configs /configs/cache /configs/heap_dumps /logs /customFiles \
             /pipeline/watchedFolders /pipeline/finishedFolders \
             /tmp/stirling-pdf/heap_dumps; \
    chown -R stirlingpdfuser:stirlingpdfgroup \
      /home/stirlingpdfuser /configs /logs /customFiles /pipeline \
      /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf/heap_dumps

# Tool symlinks
RUN set -eux; \
    ln -sf /opt/calibre/ebook-convert /usr/bin/ebook-convert; \
    ln -sf /opt/venv/bin/unoconvert /usr/local/bin/unoconvert; \
    ln -sf /opt/venv/bin/unoserver  /usr/local/bin/unoserver; \
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    ln -sf /opt/venv/bin/weasyprint /usr/local/bin/weasyprint; \
    ln -sf /opt/venv/bin/unoping    /usr/local/bin/unoping; \
    fc-cache -f

# Metadata labels - base image
LABEL org.opencontainers.image.title="Stirling-PDF Base" \
      org.opencontainers.image.description="Pre-built base image with Calibre, Ghostscript, QPDF, ImageMagick, LibreOffice, OCRmyPDF and dependencies" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools"
