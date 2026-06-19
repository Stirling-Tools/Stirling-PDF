# Stirling-PDF - Quarkus full image (embedded frontend, all tools)
#
# Layers the Quarkus uber runner-jar onto the prebuilt base image (Java 25 +
# LibreOffice + Tesseract + qpdf + Ghostscript + Calibre + Python).
#
# Two-step build (the runner-jar is NOT built by this Dockerfile so the image
# build stays fast for the e2e loop):
#
#   1. ./gradlew :stirling-pdf:quarkusBuild -x test --console=plain
#        -> produces app/core/build/stirling-pdf-<version>-runner.jar
#   2. docker build -f docker/quarkus/Dockerfile -t stirling-pdf-quarkus:full .
#        (build context MUST be the repo root so the jar + fonts resolve)
#
# NOTE: this uses the Quarkus *uber* runner-jar, NOT app/core/build/libs/*.jar
# (that plain jar has an empty manifest). quarkus.package.jar.type=uber-jar is
# set in application.properties.

ARG BASE_VERSION=1.0.2
ARG BASE_IMAGE=stirlingtools/stirling-pdf-base:${BASE_VERSION}

FROM ${BASE_IMAGE}

ARG VERSION_TAG=dev
# Path (relative to repo root) of the runner-jar produced by quarkusBuild.
ARG JAR_FILE=app/core/build/stirling-pdf-2.12.0-runner.jar

WORKDIR /app

# Application uber-jar
COPY --chown=1000:1000 ${JAR_FILE} /app/app.jar

# Fonts go to the system dir (root ownership is correct - world-readable)
COPY app/core/src/main/resources/static/fonts/*.ttf /usr/share/fonts/truetype/

# Permissions and configuration (mirror docker/embedded/Dockerfile volume layout)
RUN set -eux; \
    ln -s /logs /app/logs; \
    ln -s /configs /app/configs; \
    ln -s /customFiles /app/customFiles; \
    ln -s /pipeline /app/pipeline; \
    ln -s /storage /app/storage; \
    chown -h stirlingpdfuser:stirlingpdfgroup /app/logs /app/configs /app/customFiles /app/pipeline /app/storage; \
    chown stirlingpdfuser:stirlingpdfgroup /app; \
    fc-cache -f

ENV VERSION_TAG=${VERSION_TAG} \
    HOME=/home/stirlingpdfuser \
    JAVA_OPTS="-XX:+UseG1GC -Djava.awt.headless=true" \
    STIRLING_TEMPFILES_DIRECTORY=/tmp/stirling-pdf \
    TMPDIR=/tmp/stirling-pdf \
    TEMP=/tmp/stirling-pdf \
    TMP=/tmp/stirling-pdf \
    SAL_TMP=/tmp/stirling-pdf/libre \
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    QUARKUS_HTTP_HOST=0.0.0.0 \
    QUARKUS_HTTP_PORT=8080

LABEL org.opencontainers.image.title="Stirling-PDF (Quarkus)" \
      org.opencontainers.image.description="Full version (Quarkus) with Calibre, LibreOffice, Tesseract, OCRmyPDF" \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.version="${VERSION_TAG}"

EXPOSE 8080/tcp
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD curl -fs --max-time 10 http://localhost:8080${SYSTEM_ROOTURIPATH:-''}/api/v1/info/status || exit 1

USER stirlingpdfuser
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
