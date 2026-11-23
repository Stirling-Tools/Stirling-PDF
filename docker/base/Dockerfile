# Stirling-PDF Base Image
# Pre-built tools: Ghostscript, QPDF, Python venv with OCR packages
# This image is reused by Dockerfile and Dockerfile.fat to avoid rebuilding tools on every app release

ARG TARGETPLATFORM

# Stage 2: Build Ghostscript from source
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS gs-build
ARG TARGETPLATFORM
ARG GS_VERSION=10.08.0

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


# Stage 3: Build QPDF
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS pdf-tools-build
ARG TARGETPLATFORM
ARG QPDF_VERSION=12.4.2

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/tmp/pdf-tools-build,id=pdf-tools-${TARGETPLATFORM:-local} \
    apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake libssl-dev libjpeg-dev zlib1g-dev curl ca-certificates pkg-config \
      && rm -rf /var/lib/apt/lists/* && \
    cd /tmp/pdf-tools-build && \
    rm -rf qpdf-* && \
    (test -d "qpdf-${QPDF_VERSION}" || curl -fsSL --max-time 300 --retry 3 --retry-delay 5 "https://github.com/qpdf/qpdf/releases/download/v${QPDF_VERSION}/qpdf-${QPDF_VERSION}.tar.gz" | tar xz) && \
    cd "qpdf-${QPDF_VERSION}" && \
    cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DALLOW_CRYPTO_OPENSSL=ON -DDEFAULT_CRYPTO=openssl && \
    cmake --build build --parallel "$(nproc)" && \
    cmake --install build --strip


# Stage 4: Build Python venv
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS python-venv-build
ARG TARGETPLATFORM
ARG LXML_VERSION=6.1.3

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-dev build-essential libxml2-dev libxslt1-dev \
      ca-certificates binutils && \
    rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /opt/venv --system-site-packages && \
    /opt/venv/bin/pip install --no-cache-dir --prefer-binary --only-binary=:all: \
      pdf2image ocrmypdf \
      cryptography "pillow>=13.0.0" "Brotli>=1.2.1"

# Use distribution XML libraries so their package updates also cover lxml.
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    /opt/venv/bin/pip install --no-cache-dir --no-binary=lxml --force-reinstall \
      "lxml==${LXML_VERSION}" && \
    /opt/venv/bin/python -c \
      "from lxml import etree; assert etree.LIBXML_VERSION == (2, 9, 14), etree.LIBXML_VERSION"

RUN find /opt/venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true && \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info && \
    find /opt/venv -name '*.so' -exec strip --strip-unneeded {} + 2>/dev/null || true


# Final runtime image - the actual base image
FROM eclipse-temurin:25-jre-noble@sha256:a98128a57de944a72bd31fbc79b898edd5a5864d3652071d5bbd2160ab7d7dce AS runtime

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    apt-get install -y --no-install-recommends \
      # Core tools
      ca-certificates tzdata tini bash fontconfig curl \
      # ffmpeg disabled due to raised CVEs
      # ffmpeg \
      poppler-utils \
      unpaper pngquant \
      # Fonts: full coverage for standard + fat variants
      fonts-dejavu \
      fonts-liberation2 \
      fonts-crosextra-caladea fonts-crosextra-carlito \
      fonts-noto-core fonts-noto-mono fonts-noto-extra \
      fonts-noto-cjk poppler-data \
      fonts-freefont-ttf fonts-terminus \
      # Python runtime
      python3 python3-packaging \
      libxml2 libxslt1.1 \
      # OCR
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
      tesseract-ocr-por tesseract-ocr-chi-sim \
      # Tesseract OSD for orientation detection
      tesseract-ocr-osd \
      # Graphics / AWT headless
      libfreetype6 libfontconfig1 libx11-6 libxt6 libxext6 libxrender1 \
      libxtst6 libxi6 libxinerama1 libxkbcommon0 libsm6 libice6 \
      coreutils \
    ; \
    \
    # Force font cache rebuild
    fc-cache -f -v 2>&1 | awk 'NR <= 20'; \
    \
    # Cleanup stage.
    \
    apt-get autoremove --purge -y || true; \
    rm -rf /var/lib/apt/lists/*; \
    \
    # Docs / man / info / icons / themes / GUI assets (headless server)
    rm -rf /usr/share/doc/* /usr/share/man/* /usr/share/info/* \
           /usr/share/lintian/* /usr/share/linda/* \
           /usr/share/icons/* /usr/share/themes/* \
           /usr/share/javascript/* \
           /usr/share/gtk-3.0/* \
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
           /usr/local/share/ghostscript/*/examples; \
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
COPY --link --from=pdf-tools-build /usr/local/bin/qpdf    /usr/bin/qpdf
COPY --link --from=gs-build        /usr/local/bin/gs                /usr/local/bin/gs
COPY --link --from=gs-build        /usr/local/share/ghostscript     /usr/local/share/ghostscript
# Python venv pre-built (no pip install at runtime, no build tools needed)
COPY --link --from=python-venv-build /opt/venv /opt/venv

# Removing a package can silently drop a shared library another tool links; fail the build instead.
RUN ldconfig /usr/local/lib && \
    for bin in /usr/local/bin/gs /usr/bin/qpdf /usr/bin/tesseract /usr/bin/unpaper \
               /usr/bin/pngquant /usr/bin/pdftoppm; do \
      if ldd "$bin" | grep 'not found'; then echo "missing library for $bin" >&2; exit 1; fi; \
    done && \
    PYTHONDONTWRITEBYTECODE=1 \
      /opt/venv/bin/python -c "import cffi; print('cffi OK:', cffi.__version__)" && \
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
             /storage \
             /tmp/stirling-pdf/heap_dumps; \
    chown -R stirlingpdfuser:stirlingpdfgroup \
      /home/stirlingpdfuser /configs /logs /customFiles /pipeline /storage \
      /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf/heap_dumps

# Tool symlinks
RUN set -eux; \
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    fc-cache -f

# Metadata labels - base image
LABEL org.opencontainers.image.title="Stirling-PDF Base" \
      org.opencontainers.image.description="Pre-built base image with Ghostscript, QPDF, OCRmyPDF and dependencies" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools"
