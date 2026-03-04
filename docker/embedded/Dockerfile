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
    ln -sf /opt/venv/bin/ocrmypdf   /usr/local/bin/ocrmypdf; \
    ln -sf /opt/venv/bin/weasyprint /usr/local/bin/weasyprint; \
    ln -sf /opt/venv/bin/unoping    /usr/local/bin/unoping; \
    chmod +x /scripts/*; \
    # Create /app symlinks
    ln -s /logs /app/logs; \
    ln -s /configs /app/configs; \
    ln -s /customFiles /app/customFiles; \
    ln -s /pipeline /app/pipeline; \
    chown -h stirlingpdfuser:stirlingpdfgroup /app/logs /app/configs /app/customFiles /app/pipeline; \
    chown stirlingpdfuser:stirlingpdfgroup /app; \
    fc-cache -f
    # NOTE: Project Leyden AOT cache is generated in the background on first boot
    # by init-without-ocr.sh. The cache is picked up on subsequent boots for
    # 15-25% faster startup. See: JEP 483 + 514 + 515 (JDK 25).

# Environment variables.
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG

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
