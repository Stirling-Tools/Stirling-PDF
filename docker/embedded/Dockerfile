# Stirling-PDF - Standard version (uses base image)
# Built on stirling-pdf-base which includes pre-compiled tools

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


# Final image: use base image
FROM stirlingtools/stirling-pdf-base:latest

ARG VERSION_TAG

ENV VERSION_TAG=$VERSION_TAG \
    STIRLING_JVM_PROFILE="balanced" \
    _JVM_OPTS_BALANCED="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    _JVM_OPTS_PERFORMANCE="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:+AlwaysPreTouch -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    JAVA_CUSTOM_OPTS="" \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

# Application JAR layers
COPY --from=jar-extract --chown=1000:1000 /layers/dependencies/           /app/
COPY --from=jar-extract --chown=1000:1000 /layers/spring-boot-loader/     /app/
COPY --from=jar-extract --chown=1000:1000 /layers/snapshot-dependencies/  /app/
COPY --from=jar-extract --chown=1000:1000 /layers/application/            /app/

COPY --from=app-build --chown=1000:1000 \
     /app/build/libs/restart-helper.jar /restart-helper.jar
COPY --chown=1000:1000 scripts/ /scripts/

# Fonts go to system dir — root ownership is correct (world-readable)
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Permissions and configuration
RUN set -eux; \
    # Set up Python venv for runtime packages
    python3 -m venv /opt/venv --system-site-packages; \
    /opt/venv/bin/pip install --upgrade pip setuptools; \
    /opt/venv/bin/pip install --no-cache-dir \
      weasyprint pdf2image opencv-python-headless ocrmypdf \
      "unoserver==3.6"; \
    \
    # Set up symlinks for Python tools
    ln -sf /opt/venv/bin/unoconvert /usr/local/bin/unoconvert; \
    ln -sf /opt/venv/bin/unoserver  /usr/local/bin/unoserver; \
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    ln -sf /opt/venv/bin/weasyprint /usr/local/bin/weasyprint; \
    ln -sf /opt/venv/bin/unoping    /usr/local/bin/unoping; \
    \
    # Script permissions
    chmod +x /scripts/*; \
    \
    # Cleanup venv
    find /opt/venv -type d -name __pycache__ \
      -exec rm -rf {} + 2>/dev/null || true; \
    find /opt/venv \( -name '*.pyc' -o -name '*.pyi' \) -delete 2>/dev/null || true; \
    rm -rf /opt/venv/lib/python*/site-packages/pip \
           /opt/venv/lib/python*/site-packages/pip-*.dist-info \
           /opt/venv/lib/python*/site-packages/setuptools \
           /opt/venv/lib/python*/site-packages/setuptools-*.dist-info

LABEL org.opencontainers.image.title="Stirling-PDF" \
      org.opencontainers.image.description="Standard version with Calibre, LibreOffice, Tesseract, OCRmyPDF" \
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
