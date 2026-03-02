# Stirling-PDF - Full version (embedded frontend)

FROM ubuntu:noble AS calibre-build

ARG CALIBRE_VERSION=9.3.1

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
    curl -fsSL \
      "https://download.calibre-ebook.com/${CALIBRE_VERSION}/calibre-${CALIBRE_VERSION}-${CALIBRE_ARCH}.txz" \
      -o /tmp/calibre.txz; \
    mkdir -p /opt/calibre; \
    tar xJf /tmp/calibre.txz -C /opt/calibre; \
    rm /tmp/calibre.txz; \
    \
    # We only need Qt6 WebEngine (Chromium) for ebook→PDF output.
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
    # ── Verify conversion still works ──
    # NOTE: txt→epub used intentionally NOT txt→pdf.
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


# Build the Java application and frontend.
FROM gradle:9.3.1-jdk25 AS app-build

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && update-ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# JDK 25+: --add-exports is no longer accepted via JAVA_TOOL_OPTIONS; use JDK_JAVA_OPTIONS instead
ENV JDK_JAVA_OPTIONS="--add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED"

WORKDIR /app

COPY build.gradle settings.gradle gradlew ./
COPY gradle/                               gradle/
COPY app/core/build.gradle                  app/core/
COPY app/common/build.gradle                app/common/
COPY app/proprietary/build.gradle           app/proprietary/

# Use system gradle instead of gradlew to avoid SSL issues downloading gradle distribution on emulated arm64
RUN --mount=type=cache,target=/home/gradle/.gradle/caches \
    --mount=type=cache,target=/home/gradle/.gradle/wrapper \
    gradle dependencies --no-daemon || true

COPY . .

RUN --mount=type=cache,target=/home/gradle/.gradle/caches \
    --mount=type=cache,target=/home/gradle/.gradle/wrapper \
    --mount=type=cache,target=/root/.npm,sharing=locked \
    DISABLE_ADDITIONAL_FEATURES=false \
    gradle clean build \
      -PbuildWithFrontend=true \
      -x spotlessApply -x spotlessCheck -x test -x sonarqube \
      --no-daemon

# Extract Spring Boot Layers.
FROM eclipse-temurin:25-jre-noble AS jar-extract
WORKDIR /tmp
COPY --from=app-build /app/app/core/build/libs/*.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --destination /layers


# Build Ghostscript 10.06.0 from source in an isolated stage (avoids library conflicts).
FROM ubuntu:noble AS gs-build
ARG GS_VERSION=10.06.0
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/tmp/gs-build,id=gs-build-${TARGETPLATFORM:-local} \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates libfontconfig1-dev && rm -rf /var/lib/apt/lists/* && \
    GS_TAG="gs$(printf '%s' "${GS_VERSION}" | tr -d '.')" && \
    cd /tmp/gs-build && \
    rm -rf ghostscript-* && \
    (test -d "ghostscript-${GS_VERSION}" || curl -fsSL "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/${GS_TAG}/ghostscript-${GS_VERSION}.tar.gz" | tar xz) && \
    cd "ghostscript-${GS_VERSION}" && \
    ./configure \
      --prefix=/usr/local \
      --without-x \
      --disable-cups \
      --disable-gtk && \
    make -j"$(nproc)" && \
    make install && \
    cd ..


# Build PDF Tools (QPDF and ImageMagick 7).
FROM ubuntu:noble AS pdf-tools-build
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
    (test -d "qpdf-${QPDF_VERSION}" || curl -fsSL "https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}.tar.gz" | tar xz) && \
    cd "qpdf-${QPDF_VERSION}" && \
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DALLOW_CRYPTO_OPENSSL=ON -DDEFAULT_CRYPTO=openssl && \
    cmake --build build --parallel "$(nproc)" && \
    cmake --install build --strip && \
    cd .. && \
    # Build ImageMagick 7
    (test -d "ImageMagick-${IM_VERSION}" || curl -fsSL "https://github.com/ImageMagick/ImageMagick/archive/refs/tags/${IM_VERSION}.tar.gz" | tar xz) && \
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


# Final runtime image.
FROM eclipse-temurin:25-jre-noble AS runtime

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
      ffmpeg poppler-utils fontforge \
      gosu unpaper \
      # Fonts: full CJK coverage retained
      fonts-dejavu \
      fonts-liberation2 \
      fonts-crosextra-caladea fonts-crosextra-carlito \
      fonts-noto-core fonts-noto-mono fonts-noto-extra \
      fonts-noto-cjk poppler-data \
      # We install these via apt to avoid downloading "fat wheels" from pip
      # python3-full replaced with minimal set
      python3 python3-dev python3-venv python3-uno \
      # Python dependencies via pip to avoid conflicts, so we don't install them here
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
      libreoffice-java-common \
    ; \
    \
    \
    # Note: We do NOT install numpy/pillow/cv2 here; it uses the system versions
    python3 -m venv /opt/venv --system-site-packages; \
    /opt/venv/bin/pip install --no-cache-dir \
      weasyprint pdf2image opencv-python-headless ocrmypdf \
      cryptography \
      "unoserver==${UNOSERVER_VERSION}"; \
    \
    ln -sf /opt/venv/bin/unoconvert /usr/local/bin/unoconvert; \
    ln -sf /opt/venv/bin/unoserver  /usr/local/bin/unoserver; \
    \
    # Verify and fix LibreOffice
    libreoffice --version; \
    soffice --version 2>/dev/null || true; \
    # Rebuild UNO bridge type database
    /usr/lib/libreoffice/program/soffice.bin --headless --convert-to pdf /dev/null 2>/dev/null || true; \
    # Force font cache rebuild and verify filters are available
    fc-cache -f -v 2>&1 | awk 'NR <= 20'; \
    /opt/venv/bin/python -c "import cv2; print('OpenCV', cv2.__version__)"; \
    /opt/venv/bin/python -c "import ocrmypdf; print('ocrmypdf OK')"; \
    \
    # Cleanup stage.
    \
    # Remove build-only packages no longer needed at runtime.
    apt-get remove --purge -y software-properties-common python3-dev || true; \
    apt-get autoremove --purge -y || true; \
    rm -rf /var/lib/apt/lists/*; \
    \
    # Remove C/C++ headers (no longer needed after pip install)
    rm -rf /usr/include/*; \
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
    find /opt/venv -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true; \
    find /opt/venv \
      \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true; \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info; \
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
    /opt/venv/bin/python -c "import cffi; print('cffi OK:', cffi.__version__)" \
      || { echo 'ERROR: cffi broken after system package cleanup'; exit 1; }; \
    \
    # Strip debug symbols from ALL shared libraries
    find /usr/lib -name '*.so*' -type f \
        -not -path '*/jvm/*' \
        -not -path '*/libreoffice/*' \
        -exec strip --strip-unneeded {} + 2>/dev/null || true; \
    \
    # Preserving ffmpeg codec libs as they are directly linked.
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
           /var/log/dpkg.log /var/log/apt/* \
           /usr/local/share/ghostscript/*/doc \
           /usr/local/share/ghostscript/*/examples \
           /usr/share/ImageMagick-*/doc \
           /usr/share/ImageMagick-*/www; \
    \
    \
    # NEW: Tesseract training configs (not needed for OCR, but keep configs/ for hocr/txt output)
    rm -rf /usr/share/tesseract-ocr/*/tessdata/tessconfigs; \
    \
    # Noto fonts ship 1800+ files in many weights (Bold, Italic, SemiBold, etc.)
    # For PDF processing, Regular weight covers all scripts. Saves ~370MB.
    find /usr/share/fonts/truetype/noto -type f \
        ! -name '*Regular*' -delete 2>/dev/null || true; \
    find /usr/share/fonts/opentype -type f \
        ! -name '*Regular*' -delete 2>/dev/null || true; \
    # DejaVu: keep Regular and Bold only (commonly referenced in PDFs)
    find /usr/share/fonts/truetype -name '*DejaVu*' \
        ! -name '*-Regular*' ! -name '*-Bold*' ! -name '*Bold.ttf' \
        ! -name 'DejaVuSans.ttf' ! -name 'DejaVuSerif.ttf' ! -name 'DejaVuSansMono.ttf' \
        -type f -delete 2>/dev/null || true; \
    # Remove empty font directories after cleanup
    find /usr/share/fonts -type d -empty -delete 2>/dev/null || true; \
    \
    # ── gconv: keep only essential charset conversion modules (~6MB savings) ──
    # PDF processing needs UTF-8, ISO-8859-*, and a few CJK encodings.
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
    # NOTE: flite TTS voice libs (~26MB) are kept because ffmpeg directly links them.
    # Removing them breaks ffmpeg startup. To save these 26MB, ffmpeg would need
    # to be rebuilt without --enable-libflite (not worth the complexity).
    \
    # ── dpkg metadata cleanup (~14MB) ──
    # Not needed at runtime — container won't run apt-get.
    rm -rf /var/lib/dpkg/info/*.list \
           /var/lib/dpkg/info/*.md5sums \
           /var/lib/dpkg/info/*.conffiles \
           /var/lib/dpkg/info/*.postinst \
           /var/lib/dpkg/info/*.preinst \
           /var/lib/dpkg/info/*.prerm \
           /var/lib/dpkg/info/*.postrm \
           /var/lib/dpkg/info/*.triggers \
           /var/lib/dpkg/info/*.shlibs \
           /var/lib/dpkg/info/*.symbols \
           /var/lib/dpkg/info/*.templates; \
    \
    # Misc caches
    rm -rf /var/cache/fontconfig/* /tmp/*

# Calibre and QPDF tools.
COPY --from=calibre-build /opt/calibre /opt/calibre
COPY --from=pdf-tools-build /usr/local/bin/qpdf /usr/bin/qpdf
COPY --from=pdf-tools-build /usr/local/bin/magick /usr/bin/magick
COPY --from=pdf-tools-build /usr/local/lib/libMagick*.so* /usr/local/lib/
# Copy loadable coder/filter modules (required when built with --with-modules)
COPY --from=pdf-tools-build /usr/local/lib/ImageMagick-7* /usr/local/lib/
COPY --from=pdf-tools-build /usr/local/etc/ImageMagick-7 /usr/local/etc/ImageMagick-7
COPY --from=gs-build /usr/local/bin/gs /usr/local/bin/gs
COPY --from=gs-build /usr/local/share/ghostscript /usr/local/share/ghostscript
RUN ldconfig /usr/local/lib

# ---
# Non-root user
# ---
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
    fi; \
    ln -sf /usr/sbin/gosu /usr/local/bin/su-exec

# Application files.
WORKDIR /app
COPY --from=jar-extract --chown=1000:1000 /layers/dependencies/           /app/
COPY --from=jar-extract --chown=1000:1000 /layers/spring-boot-loader/     /app/
COPY --from=jar-extract --chown=1000:1000 /layers/snapshot-dependencies/  /app/
COPY --from=jar-extract --chown=1000:1000 /layers/application/            /app/

COPY --from=app-build --chown=1000:1000 \
     /app/build/libs/restart-helper.jar /restart-helper.jar
COPY --chown=1000:1000 scripts/ /scripts/

# Fonts go to system dir — root ownership is correct (world-readable)
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Permissions and configuration.
RUN set -eux; \
    ln -sf /opt/calibre/ebook-convert /usr/bin/ebook-convert; \
    ln -sf /opt/venv/bin/unoconvert /usr/local/bin/unoconvert; \
    ln -sf /opt/venv/bin/unoserver  /usr/local/bin/unoserver; \
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    ln -sf /opt/venv/bin/weasyprint /usr/local/bin/weasyprint; \
    ln -sf /opt/venv/bin/unoping    /usr/local/bin/unoping; \
    chmod +x /scripts/*; \
    mkdir -p /configs /logs /customFiles \
             /pipeline/watchedFolders /pipeline/finishedFolders \
             /tmp/stirling-pdf/heap_dumps; \
    # Create symlinks to allow app to find these in /app/
    ln -s /logs /app/logs; \
    ln -s /configs /app/configs; \
    ln -s /customFiles /app/customFiles; \
    ln -s /pipeline /app/pipeline; \
    chown -R stirlingpdfuser:stirlingpdfgroup \
      /home/stirlingpdfuser /configs /logs /customFiles /pipeline \
      /tmp/stirling-pdf; \
    chown -h stirlingpdfuser:stirlingpdfgroup /app/logs /app/configs /app/customFiles /app/pipeline; \
    chown stirlingpdfuser:stirlingpdfgroup /app; \
    chmod 750 /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf/heap_dumps; \
    fc-cache -f
    # NOTE: Project Leyden AOT cache is generated in the background on first boot
    # by init-without-ocr.sh. The cache is picked up on subsequent boots for
    # 15-25% faster startup. See: JEP 483 + 514 + 515 (JDK 25).

# Environment variables.
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG \
    STIRLING_JVM_PROFILE="balanced" \
    _JVM_OPTS_BALANCED="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    _JVM_OPTS_PERFORMANCE="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:+AlwaysPreTouch -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=${PUID} \
    PGID=${PGID} \
    UMASK=022 \
    PATH="/opt/venv/bin:${PATH}" \
    UNO_PATH=/usr/lib/libreoffice/program \
    LIBREOFFICE_BIN_PATH=/usr/lib/libreoffice/program/soffice.bin \
    STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf \
    TEMP=/tmp/stirling-pdf \
    TMP=/tmp/stirling-pdf \
    QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu --disable-software-rasterizer" \
    DBUS_SESSION_BUS_ADDRESS=/dev/null

# Metadata labels.
LABEL org.opencontainers.image.title="Stirling-PDF" \
      org.opencontainers.image.description="Full version with Calibre, LibreOffice, Tesseract, OCRmyPDF" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools" \
      org.opencontainers.image.version="${VERSION_TAG}" \
      org.opencontainers.image.keywords="PDF, manipulation, API, Spring Boot, React"

EXPOSE 8080/tcp
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -fs --show-error http://localhost:8080/api/v1/info/status || exit 1

ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD []
