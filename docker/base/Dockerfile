# Stirling-PDF Base Image
# Pre-built tools: Ghostscript, QPDF, ImageMagick, Python venv with OCR packages
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


# Stage 3: Build PDF Tools (QPDF and ImageMagick 7)
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS pdf-tools-build
ARG TARGETPLATFORM
ARG QPDF_VERSION=12.4.2
ARG IM_VERSION=7.1.2-33

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
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS python-venv-build
ARG TARGETPLATFORM

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

RUN find /opt/venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true && \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info && \
    find /opt/venv -name '*.so' -exec strip --strip-unneeded {} + 2>/dev/null || true


# Final runtime image - the actual base image
FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS unpaper-build
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends build-essential nasm pkg-config meson ninja-build curl ca-certificates xz-utils python3 python3-sphinx zlib1g-dev >/dev/null
RUN curl -fsSL https://ffmpeg.org/releases/ffmpeg-7.1.2.tar.xz | tar xJ -C /tmp && cd /tmp/ffmpeg-7.1.2 && \
    ./configure --prefix=/opt/ff --enable-static --disable-shared --disable-programs --disable-doc --disable-network \
      --disable-autodetect --disable-everything --disable-avdevice --disable-avfilter --disable-swscale --disable-swresample --disable-postproc \
      --enable-protocol=file --enable-demuxer=image2 --enable-muxer=image2 \
      --enable-zlib --enable-decoder=png,pbm,pgm,pgmyuv,ppm,pam --enable-parser=png --enable-encoder=pbm,pgm,pgmyuv,ppm,pam >/dev/null && \
    make -j"$(nproc)" >/dev/null && make install >/dev/null
RUN curl -fsSL https://github.com/unpaper/unpaper/archive/refs/tags/unpaper-7.0.0.tar.gz | tar xz -C /tmp && cd /tmp/unpaper-unpaper-7.0.0 && \
    PKG_CONFIG_PATH=/opt/ff/lib/pkgconfig meson setup build --buildtype=release -Dprefer_static=true && ninja -C build && \
    install -m755 build/unpaper /usr/local/bin/unpaper

FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS tesseract-build
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends build-essential cmake pkg-config curl ca-certificates libpng-dev libjpeg-turbo8-dev zlib1g-dev libtiff-dev >/dev/null
RUN curl -fsSL https://github.com/DanBloomberg/leptonica/archive/refs/tags/1.87.0.tar.gz | tar xz -C /tmp && cd /tmp/leptonica-1.87.0 && \
    cmake -S . -B b -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_PROG=OFF -DCMAKE_INSTALL_PREFIX=/opt/lept \
      -DENABLE_PNG=ON -DENABLE_JPEG=ON -DENABLE_ZLIB=ON -DENABLE_TIFF=ON -DENABLE_OPENJPEG=OFF -DENABLE_WEBP=OFF -DENABLE_GIF=OFF -DSW_BUILD=OFF >/dev/null && \
    cmake --build b -j"$(nproc)" >/dev/null && cmake --install b >/dev/null
RUN curl -fsSL https://github.com/tesseract-ocr/tesseract/archive/ddcd04239a19d3992ecc443dfa0aa025843a6614.tar.gz | tar xz -C /tmp && cd /tmp/tesseract-ddcd04239a19d3992ecc443dfa0aa025843a6614 && \
    cmake -S . -B b -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TRAINING_TOOLS=OFF -DBUILD_TESTS=OFF \
      -DDISABLE_CURL=ON -DDISABLE_ARCHIVE=ON -DGRAPHICS_DISABLED=ON -DOPENMP_BUILD=OFF -DSW_BUILD=OFF -DENABLE_LTO=OFF \
      -DCMAKE_PREFIX_PATH=/opt/lept -DCMAKE_INSTALL_PREFIX=/opt/tess >/dev/null && \
    cmake --build b -j"$(nproc)" >/dev/null && cmake --install b >/dev/null && \
    strip /opt/tess/bin/tesseract

FROM amazoncorretto:25-al2023 AS jdk
ARG TARGETARCH
RUN dnf install -y -q binutils tar gzip >/dev/null && A=$([ "$TARGETARCH" = arm64 ] && echo aarch64 || echo x64) && curl -fsSL "https://corretto.aws/downloads/resources/25.0.5.1.2/amazon-corretto-25.0.5.1.2-linux-${A}.tar.gz" | tar xz -C /opt && mv /opt/amazon-corretto-* /opt/jdk && /opt/jdk/bin/jlink --add-modules java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.prefs,java.rmi,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.transaction.xa,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported,jdk.dynalink,jdk.management,jdk.management.agent,jdk.jfr,jdk.zipfs,jdk.charsets,jdk.localedata,jdk.naming.dns,jdk.net,jdk.attach,jdk.jcmd,jdk.httpserver,jdk.security.auth,jdk.xml.dom --strip-debug --no-header-files --no-man-pages --output /opt/jre

FROM ubuntu:noble@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852 AS runtime
COPY --link --from=jdk /opt/jre /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk PATH=/opt/java/openjdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TESS_BASE_PATH=/usr/share/tesseract-ocr/5/tessdata \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    apt-get install -y --no-install-recommends \
      # Core tools
      ca-certificates tzdata tini bash fontconfig curl libltdl7 libwebpdemux2 libzip4 \
      # ffmpeg disabled due to raised CVEs
      # ffmpeg \
      poppler-utils \
      pngquant \
      # Fonts: full coverage for standard + fat variants
      fonts-dejavu \
      fonts-liberation2 \
      fonts-crosextra-caladea fonts-crosextra-carlito \
      fonts-noto-core fonts-noto-mono fonts-noto-extra \
      fonts-noto-cjk poppler-data \
      fonts-freefont-ttf fonts-terminus \
      # Python runtime
      python3 python3-packaging \
      libxml2 \
      # OCR
      tesseract-ocr-eng tesseract-ocr-deu tesseract-ocr-fra \
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
      org.opencontainers.image.description="Pre-built base image with Ghostscript, QPDF, ImageMagick, OCRmyPDF and dependencies" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools"

COPY --from=unpaper-build /usr/local/bin/unpaper /usr/local/bin/unpaper
COPY --from=tesseract-build /opt/tess/bin/tesseract /usr/local/bin/tesseract
COPY --from=tesseract-build /opt/tess/share/tessdata/configs/ /usr/share/tesseract-ocr/5/tessdata/configs/
RUN tesseract --version && tesseract --list-langs && unpaper --version
