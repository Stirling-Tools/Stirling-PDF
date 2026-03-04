# Stirling-PDF - Full version (embedded frontend)
# Uses pre-compiled base image with tools, extends with app JAR

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


# Final runtime image - based on pre-compiled tools.
ARG BASE_IMAGE=stirlingtools/stirling-pdf-base:1.0.0
FROM ${BASE_IMAGE}

# Application files.
WORKDIR /app
COPY --link --from=jar-extract --chown=1000:1000 /layers/dependencies/           /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/spring-boot-loader/     /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/snapshot-dependencies/  /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/application/            /app/

COPY --link --from=app-build --chown=1000:1000 \
     /app/build/libs/restart-helper.jar /restart-helper.jar
COPY --link --chown=1000:1000 scripts/ /scripts/

# Fonts go to system dir — root ownership is correct (world-readable)
COPY --link app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Permissions and configuration.
RUN set -eux; \
    ln -sf /opt/calibre/ebook-convert /usr/bin/ebook-convert; \
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    ln -sf /opt/venv/bin/weasyprint /usr/local/bin/weasyprint; \
    ln -sf /opt/venv/bin/unoping    /usr/local/bin/unoping; \
    chmod +x /scripts/*; \
    mkdir -p /configs /configs/cache /configs/heap_dumps /logs /customFiles \
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
    fc-cache -f; \
    find /opt/calibre -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true
    # NOTE: Project Leyden AOT cache is generated in the background on first boot
    # by init-without-ocr.sh. The cache is picked up on subsequent boots for
    # 15-25% faster startup. See: JEP 483 + 514 + 515 (JDK 25).

# Environment variables.
ARG VERSION_TAG
# Write version to a file so it is readable by scripts without env-var inheritance.
# init-without-ocr.sh reads /etc/stirling_version for the AOT cache fingerprint.
RUN echo "${VERSION_TAG:-dev}" > /etc/stirling_version

ENV VERSION_TAG=$VERSION_TAG \
    STIRLING_AOT_ENABLE="false" \
    STIRLING_JVM_PROFILE="balanced" \
    _JVM_OPTS_BALANCED="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    _JVM_OPTS_PERFORMANCE="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:+AlwaysPreTouch -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
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

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD curl -fs --max-time 10 http://localhost:8080/api/v1/info/status || exit 1

ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD []
