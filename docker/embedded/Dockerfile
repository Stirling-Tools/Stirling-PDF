
# ─────────────────────────────────────────────────────────────
# Stirling-PDF – Full version (embedded frontend)
# ─────────────────────────────────────────────────────────────

# ╔═══════════════════════════════════════════════════════════╗
# ║  Stage 1 — Calibre: install, strip, verify                ║
# ╚═══════════════════════════════════════════════════════════╝
FROM ubuntu:noble AS calibre-build

ARG CALIBRE_VERSION=9.2.1

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils libnss3 libfontconfig1 \
      libgl1 libegl1 libdbus-1-3 libasound2t64 libxcomposite1 \
      libxrandr2 libxkbcommon0 libxi6 libxtst6 libopengl0; \
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
    # ── Remove GUI-only / unused shared libraries ──
    # NOTE: Do NOT remove libQt6WebChannel, libQt6Qml*, libQt6Quick,
    #       libQt6Positioning, libQt6OpenGL — all required by WebEngine PDF output
    rm -f  /opt/calibre/lib/libQt6Designer* \
           /opt/calibre/lib/libQt6Multimedia* \
           /opt/calibre/lib/libQt6WaylandClient.so.* \
           /opt/calibre/lib/libQt6SpatialAudio.so.* \
           /opt/calibre/lib/libQt6XcbQpa.so.* \
           /opt/calibre/lib/libQt6NetworkAuth.so.* \
           /opt/calibre/lib/libQt6Concurrent.so.* \
           /opt/calibre/lib/libQt6PrintSupport.so.* \
           /opt/calibre/lib/libQt6Sensors.so.* \
           /opt/calibre/lib/libQt6Sql.so.* \
           /opt/calibre/lib/libQt6TextToSpeech.so.* \
           /opt/calibre/lib/libQt6Xml.so.* \
           /opt/calibre/lib/libQt6WebEngineWidgets.so.* \
           /opt/calibre/lib/libQt6OpenGLWidgets.so.* \
           /opt/calibre/lib/libQt6QuickWidgets.so.* \
           # AV / multimedia (not used for ebook conversion)
           /opt/calibre/lib/libavcodec.so.* \
           /opt/calibre/lib/libavfilter.so.* \
           /opt/calibre/lib/libavformat.so.* \
           /opt/calibre/lib/libavutil.so.* \
           /opt/calibre/lib/libavdevice.so.* \
           /opt/calibre/lib/libpostproc.so.* \
           /opt/calibre/lib/libswresample.so.* \
           /opt/calibre/lib/libswscale.so.* \
           # Audio / speech / TTS
           /opt/calibre/lib/libspeex.so.* \
           /opt/calibre/lib/libFLAC.so.* \
           /opt/calibre/lib/libopus.so.* \
           /opt/calibre/lib/libvorbis*.so.* \
           /opt/calibre/lib/libasyncns.so.* \
           /opt/calibre/lib/libspeechd.so.* \
           /opt/calibre/lib/libespeak-ng.so.* \
           # Other unused libs
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
           /opt/calibre/lib/libusb-1.0.so.*; \
    rm -rf /opt/calibre/lib/qt6/plugins/platformthemes \
           /opt/calibre/lib/qt6/plugins/wayland* \
           /opt/calibre/lib/qt6/plugins/xcbglintegrations \
           /opt/calibre/lib/qt6/plugins/multimedia \
           /opt/calibre/lib/qt6/plugins/designer \
           /opt/calibre/lib/qt6/plugins/qmltooling; \
    \
    # ── Remove GUI executables (keep ebook-convert + ebook-meta + calibre-parallel) ──
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
    # ── Remove Python modules not needed for conversion ──
    rm -rf /opt/calibre/lib/calibre/gui2 \
           /opt/calibre/lib/calibre/devices \
           /opt/calibre/lib/calibre/library \
           /opt/calibre/lib/calibre/db \
           /opt/calibre/lib/calibre/srv \
           /opt/calibre/lib/calibre/spell \
           /opt/calibre/lib/calibre/live; \
    \
    # ── Remove resources not needed for CLI conversion ──
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
           /opt/calibre/lib/calibre/ebooks/docx/images \
           /opt/calibre/share \
           /opt/calibre/man; \
    \
    # ── CHANGED: remove translations + localization (LANG=C.UTF-8) ──
    # Keep iso639.calibre_msgpack (required)
    # Keep qtwebengine_locales (required for WebEngine)
    rm -rf /opt/calibre/lib/qt6/translations; \
    find /opt/calibre/translations -mindepth 1 -maxdepth 1 ! -name 'qtwebengine_locales' -exec rm -rf {} +; \
    if [ -d /opt/calibre/resources/localization ]; then \
      rm -rf /opt/calibre/resources/localization/locales.zip \
             /opt/calibre/resources/localization/stats.calibre_msgpack \
             /opt/calibre/resources/localization/website-languages.txt; \
      find /opt/calibre/resources/localization -mindepth 1 -maxdepth 1 ! -name 'iso639.calibre_msgpack' -exec rm -rf {} +; \
    fi; \
    \
    # ── CHANGED: strip debug symbols from shared libraries ──
    find /opt/calibre/lib -name '*.so*' \
      -exec strip --strip-unneeded {} + 2>/dev/null || true; \
    \
    # ── CHANGED: remove Python bytecode caches ──
    find /opt/calibre -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true; \
    find /opt/calibre -name '*.pyc' -delete 2>/dev/null || true; \
    \
    # ── Verify conversion still works ──
    /opt/calibre/ebook-convert --version; \
    echo "Hello" > /tmp/test.txt; \
    export QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox"; \
    /opt/calibre/ebook-convert /tmp/test.txt /tmp/test.pdf; \
    rm /tmp/test.*; \
    echo "=== Calibre stripped successfully ==="


# ╔═══════════════════════════════════════════════════════════╗
# ║  Stage 2 — Build the Java application + frontend          ║
# ╚═══════════════════════════════════════════════════════════╝
FROM gradle:9.3.1-jdk25 AS app-build

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && update-ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY build.gradle settings.gradle gradlew ./
COPY gradle/                               gradle/
COPY app/core/build.gradle                  app/core/
COPY app/common/build.gradle                app/common/
COPY app/proprietary/build.gradle           app/proprietary/

# Use system gradle instead of gradlew to avoid SSL issues downloading gradle distribution on emulated arm64
RUN gradle dependencies --no-daemon || true

COPY . .

RUN DISABLE_ADDITIONAL_FEATURES=false \
    gradle clean build \
      -PbuildWithFrontend=true \
      -x spotlessApply -x spotlessCheck -x test -x sonarqube \
      --no-daemon

# ╔═══════════════════════════════════════════════════════════╗
# ║  Stage 2.5 — Extract Spring Boot Layers                   ║
# ╚═══════════════════════════════════════════════════════════╝
FROM eclipse-temurin:25-jre-noble AS jar-extract
WORKDIR /tmp
COPY --from=app-build /app/app/core/build/libs/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract --destination /layers


# ╔═══════════════════════════════════════════════════════════╗
# ║  Stage 3 — Runtime image                                  ║
# ╚═══════════════════════════════════════════════════════════╝
FROM eclipse-temurin:25-jre-noble AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata

# ---------------------------------------------------------------------------
# Single layer: apt + pip + all cleanup
# ---------------------------------------------------------------------------
ARG UNOSERVER_VERSION=3.6

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      # Core tools
      ca-certificates tzdata tini bash fontconfig curl \
      ffmpeg poppler-utils imagemagick fontforge ghostscript \
      gosu unpaper qpdf \
      # Fonts: full CJK coverage retained
      fonts-dejavu \
      fonts-liberation2 \
      fonts-crosextra-caladea fonts-crosextra-carlito \
      fonts-noto-core fonts-noto-mono \
      fonts-noto-cjk \
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
    sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' \
      /etc/ImageMagick-*/policy.xml 2>/dev/null || true; \
    sed -i 's/rights="none" pattern="PS"/rights="read|write" pattern="PS"/' \
      /etc/ImageMagick-*/policy.xml 2>/dev/null || true; \
    sed -i 's/rights="none" pattern="EPS"/rights="read|write" pattern="EPS"/' \
      /etc/ImageMagick-*/policy.xml 2>/dev/null || true; \
    \
    # Note: We do NOT install numpy/pillow/cv2 here; it uses the system versions
    python3 -m venv /opt/venv --system-site-packages; \
    /opt/venv/bin/pip install --no-cache-dir \
      weasyprint pdf2image opencv-python-headless ocrmypdf \
      "unoserver==${UNOSERVER_VERSION}"; \
    \
    ln -sf /opt/venv/bin/unoconvert /usr/local/bin/unoconvert; \
    ln -sf /opt/venv/bin/unoserver  /usr/local/bin/unoserver; \
    \
    # ── Verify and fix LibreOffice ──
    libreoffice --version; \
    soffice --version 2>/dev/null || true; \
    # Rebuild UNO bridge type database
    /usr/lib/libreoffice/program/soffice.bin --headless --convert-to pdf /dev/null 2>/dev/null || true; \
    # Force font cache rebuild and verify filters are available
    fc-cache -f -v 2>&1 | awk 'NR <= 20'; \
    /opt/venv/bin/python -c "import cv2; print('OpenCV', cv2.__version__)"; \
    /opt/venv/bin/python -c "import ocrmypdf; print('ocrmypdf OK')"; \
    \
    # ══════════════════════════════════════════════════════════
    #  CLEANUP
    # ══════════════════════════════════════════════════════════
    \
    # apt clean needed without cache mounts
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*; \
    \
    # Docs / man / info / icons / themes / GUI assets (headless server)
    rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* \
           /usr/share/lintian/* /usr/share/linda/* \
           /usr/share/icons/* /usr/share/themes/* \
           /usr/share/javascript/* \
           /usr/share/unicode/* \
           /usr/share/gtk-3.0/* \
           /usr/share/fontforge/pixmaps \
           /usr/share/liblangtag/* \
           /usr/share/poppler/cMap \
           /usr/share/tcltk/* \
           /usr/share/python-wheels/*; \
    \
    find /usr/share/locale -mindepth 1 -maxdepth 1 -type d \
      ! -name 'en*' -exec rm -rf {} + 2>/dev/null || true; \
    rm -rf /usr/share/i18n/locales /usr/share/i18n/charmaps; \
    \
    # LibreOffice extras: Only remove specific directories as requested
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
           /usr/lib/libreoffice/share/psprint; \
    \
    # Trim soffice.cfg — keep all installed application module configs
    find /usr/lib/libreoffice/share/config/soffice.cfg \
      -mindepth 1 -maxdepth 1 -type d \
      ! -name svt ! -name modules \
      -exec rm -rf {} +; \
    find /usr/lib/libreoffice/share/config/soffice.cfg/modules \
      -mindepth 1 -maxdepth 1 -type d \
      ! -name swriter ! -name scalc ! -name sdraw ! -name simpress \
      -exec rm -rf {} +; \
    \
    # Python caches + pip/setuptools cleanup
    find /opt/venv -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true; \
    find /opt/venv \
      \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true; \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info; \
    \
    # Python stdlib: remove unused modules (~71 MB)
    rm -rf /usr/lib/python3.12/test \
           /usr/lib/python3.12/idlelib \
           /usr/lib/python3.12/tkinter \
           /usr/lib/python3.12/lib2to3 \
           /usr/lib/python3.12/pydoc_data; \
    \
    # System Python packages not needed at runtime (~153 MB)
    rm -rf /usr/lib/python3/dist-packages/scipy \
           /usr/lib/python3/dist-packages/sympy \
           /usr/lib/python3/dist-packages/mpmath; \
    \
    # Remove system cffi superseded by venv cffi 2.0
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
    # NOTE: Do NOT remove ffmpeg codec libs (libcodec2, libx265, libaom, etc.)
    # They are directly linked into ffmpeg/unpaper binaries and cannot be removed
    \
    # ── Remove Mesa/LLVM GPU backends (~179 MB, architecture-agnostic) ──
    MULTIARCH_LIBDIR=$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null \
      || find /usr/lib -maxdepth 1 -type d -name '*-linux-gnu' | head -1); \
    rm -f \
      "${MULTIARCH_LIBDIR}"/libLLVM*.so* \
      "${MULTIARCH_LIBDIR}"/libgallium*.so* \
      2>/dev/null || true; \
    \
    # System-wide Python cache cleanup
    find /usr/lib/python3* -type d -name __pycache__ \
        -exec rm -rf {} + 2>/dev/null || true; \
    find /usr/lib/python3* \( -name '*.pyc' -o -name '*.pyi' \) \
        -delete 2>/dev/null || true; \
    \
    # Additional metadata cleanup
    # FIX: Only remove ImageMagick doc/www, NOT the whole dir (preserves policy.xml/delegates.xml)
    rm -rf /usr/share/bug /usr/share/lintian /usr/share/linda \
           /var/lib/dpkg/info/*.md5sums \
           /var/log/dpkg.log /var/log/apt/* \
           /usr/share/ghostscript/*/doc \
           /usr/share/ghostscript/*/examples \
           /usr/share/ImageMagick-*/doc \
           /usr/share/ImageMagick-*/www; \
    \
    # NEW: Ghostscript CID resources (redundant with Noto CJK)
    rm -rf /usr/share/ghostscript/*/Resource/CIDFSubst \
           /usr/share/ghostscript/*/Resource/CIDFont; \
    \
    # NEW: Tesseract training configs (not needed for OCR, but keep configs/ for hocr/txt output)
    rm -rf /usr/share/tesseract-ocr/*/tessdata/tessconfigs; \
    \
    # Trim CJK fonts to Regular weight only (FIX: Broadened path)
    find /usr/share/fonts -name '*CJK*' \
        ! -name '*Regular*' -type f -delete 2>/dev/null || true; \
    \
    # Misc caches
    rm -rf /var/cache/fontconfig/* /tmp/*

# ---------------------------------------------------------------------------
# Calibre (pre-stripped in stage 1)
# ---------------------------------------------------------------------------
COPY --from=calibre-build /opt/calibre /opt/calibre

# ---------------------------------------------------------------------------
# Non-root user
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Application files (Layered JARs)
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Directories + permissions + font cache
# ---------------------------------------------------------------------------
RUN set -eux; \
    ln -sf /opt/calibre/ebook-convert /usr/bin/ebook-convert; \
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

# ==============================================================================
# Environment
# ==============================================================================
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG \
    JAVA_BASE_OPTS="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:MaxRAMPercentage=75 -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:+AlwaysPreTouch -XX:+DisableExplicitGC -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
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
    QT_QPA_PLATFORM=offscreen \
    QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox"

# ==============================================================================
# Metadata
# ==============================================================================
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
