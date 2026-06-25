# Stirling-PDF backend-only image — JAR built with -PbuildWithFrontend=false, UI ships separately.

ARG BASE_VERSION=1.0.2
ARG BASE_IMAGE=stirlingtools/stirling-pdf-base:${BASE_VERSION}

# Stage 1: Build the Java application (backend only, no frontend)
FROM gradle:9.6.0-jdk25@sha256:e3905233ae349e72016daf8a0e19f085a1dd89ded8ec88b3d8335d3fd0b350f4 AS app-build

# JDK 25+: --add-exports is no longer accepted via JAVA_TOOL_OPTIONS; use JDK_JAVA_OPTIONS instead
ENV JDK_JAVA_OPTIONS="--add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
  --add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED \
  --add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
  --add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED"

WORKDIR /app

COPY build.gradle settings.gradle gradlew ./
COPY gradle/                               gradle/
COPY app/core/build.gradle                  app/core/
COPY app/common/build.gradle                app/common/
COPY app/proprietary/build.gradle           app/proprietary/

# Use system gradle instead of gradlew to avoid SSL issues downloading gradle distribution on emulated arm64
RUN gradle dependencies --no-daemon || true

COPY . .

ARG PROTOTYPES_BUILD=false
ARG STIRLING_FLAVOR=proprietary
ENV STIRLING_FLAVOR=${STIRLING_FLAVOR}

# buildWithFrontend=false → backend-only JAR with API landing page.
# Bundle only the JPDFium native for this image's target arch.
ARG TARGETARCH
RUN JPDFIUM_PLATFORM="$([ "$TARGETARCH" = arm64 ] && echo linux-arm64 || echo linux-x64)" && \
    STIRLING_FLAVOR=${STIRLING_FLAVOR} \
    gradle clean build \
      -PbuildWithFrontend=false \
      -PjpdfiumPlatforms="$JPDFIUM_PLATFORM" \
      -PprototypesMode=${PROTOTYPES_BUILD} \
      -x spotlessApply -x spotlessCheck -x test -x sonarqube \
      --no-daemon

# Stage 2: Extract Spring Boot Layers
FROM eclipse-temurin:25-jre-noble@sha256:b27ca47660a8fa837e47a8533b9b1a3a430295cf29ca28d91af4fd121572dc29 AS jar-extract
WORKDIR /tmp
COPY --from=app-build /app/app/core/build/libs/*.jar app.jar
RUN java -Djarmode=tools -jar app.jar extract --layers --destination /layers


# Stage 3: Final runtime image on top of pre-built base
FROM ${BASE_IMAGE}

ARG VERSION_TAG

WORKDIR /app

# Application layers
COPY --link --from=jar-extract --chown=1000:1000 /layers/dependencies/           /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/spring-boot-loader/     /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/snapshot-dependencies/  /app/
COPY --link --from=jar-extract --chown=1000:1000 /layers/application/            /app/

COPY --link --from=app-build --chown=1000:1000 \
     /app/build/libs/restart-helper.jar /restart-helper.jar
COPY --link --chown=1000:1000 scripts/ /scripts/

# Fonts go to system dir, root ownership is correct (world-readable)
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Permissions and configuration
RUN set -eux; \
    chmod +x /scripts/*; \
    ln -s /logs /app/logs; \
    ln -s /configs /app/configs; \
    ln -s /customFiles /app/customFiles; \
    ln -s /pipeline /app/pipeline; \
    ln -s /storage /app/storage; \
    chown -h stirlingpdfuser:stirlingpdfgroup /app/logs /app/configs /app/customFiles /app/pipeline /app/storage; \
    chown stirlingpdfuser:stirlingpdfgroup /app; \
    chmod 750 /tmp/stirling-pdf; \
    chmod 750 /tmp/stirling-pdf/heap_dumps; \
    fc-cache -f

# Version file for scripts (init-without-ocr.sh reads /etc/stirling_version).
RUN echo "${VERSION_TAG:-dev}" > /etc/stirling_version

# Environment variables
ENV VERSION_TAG=$VERSION_TAG \
    STIRLING_AOT_ENABLE="false" \
    STIRLING_JVM_PROFILE="balanced" \
    _JVM_OPTS_BALANCED="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    _JVM_OPTS_PERFORMANCE="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -XX:+UseCompactObjectHeaders -XX:+UseStringDeduplication -XX:+AlwaysPreTouch -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true -Djava.awt.headless=true" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022 \
    STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf \
    TEMP=/tmp/stirling-pdf \
    TMP=/tmp/stirling-pdf \
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    SAL_TMP=/tmp/stirling-pdf/libre

# Metadata labels
LABEL org.opencontainers.image.title="Stirling-PDF Backend" \
      org.opencontainers.image.description="Backend-only version (no embedded UI) with Calibre, LibreOffice, Tesseract, OCRmyPDF" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools" \
      org.opencontainers.image.version="${VERSION_TAG}" \
      org.opencontainers.image.keywords="PDF, manipulation, backend, API, Spring Boot"

EXPOSE 8080/tcp
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD curl -fs --max-time 10 http://localhost:8080${SYSTEM_ROOTURIPATH:-''}/api/v1/info/status || exit 1

ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD []
