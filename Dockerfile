# Main stage
FROM alpine:3.21.3@sha256:a8560b36e8b8210634f77d9f7f9efd7ffa463e380b75e2e74aff4511df3ef88c AS base

# Enable testing repositories
RUN echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

# Install packages
RUN apk upgrade --no-cache -a && \
    apk add --no-cache \
        ca-certificates \
        tzdata \
        tini \
        bash \
        curl \
        qpdf \
        shadow \
        su-exec \
        openssl \
        openssl-dev \
        openjdk21-jre \
        # Doc conversion
        gcompat \
        libc6-compat \
        libreoffice \
        # pdftohtml
        poppler-utils \
        # OCR / advanced PDF processing
        tesseract-ocr-data-eng \
        # Computer vision and imaging
        py3-opencv \
        python3 \
        py3-pip \
        py3-pillow@testing \
        py3-pdf2image@testing

# Create a Python virtual environment for UNO/LibreOffice integration and install required packages
RUN python3 -m venv /opt/venv && \
    export PATH="/opt/venv/bin:$PATH" && \
    pip install --upgrade pip && \
    pip install --no-cache-dir --upgrade unoserver weasyprint && \
    ln -s /usr/lib/libreoffice/program/uno.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program/unohelper.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program /opt/venv/lib/python3.12/site-packages/LibreOffice

# Move tessdata directory (if present) and create required directories
RUN mv /usr/share/tessdata /usr/share/tessdata-original || true && \
    mkdir -p /home/stirlingpdfuser /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders

# Update font cache
RUN fc-cache -f -v

# Create user and set directory ownership
RUN addgroup -S stirlingpdfgroup && adduser -S stirlingpdfuser -G stirlingpdfgroup && \
    chown -R stirlingpdfuser:stirlingpdfgroup /home/stirlingpdfuser /configs /customFiles /pipeline

# Copy base image into a new image
FROM alpine:3.21.3@sha256:a8560b36e8b8210634f77d9f7f9efd7ffa463e380b75e2e74aff4511df3ef88c

# Copy everything from the base stage
COPY --from=base / /

# Build argument for versioning
ARG VERSION_TAG

# Open Container Initiative Labels
LABEL org.opencontainers.image.title="Stirling-PDF" \
      org.opencontainers.image.description="A powerful locally hosted web-based PDF manipulation tool supporting 50+ operations including merging, splitting, conversion, OCR, watermarking, and more." \
      org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Stirling-Tools" \
      org.opencontainers.image.url="https://www.stirlingpdf.com" \
      org.opencontainers.image.documentation="https://docs.stirlingpdf.com" \
      maintainer="Stirling-Tools" \
      org.opencontainers.image.authors="Stirling-Tools" \
      org.opencontainers.image.version="${VERSION_TAG}" \
      org.opencontainers.image.keywords="PDF, manipulation, merge, split, convert, OCR, watermark"

# Set environment variables (including UNO and Python venv paths)
ENV DOCKER_ENABLE_SECURITY=false \
    VERSION_TAG=${VERSION_TAG} \
    JAVA_TOOL_OPTIONS="-XX:+UnlockExperimentalVMOptions \
-XX:MaxRAMPercentage=75 \
-XX:InitiatingHeapOccupancyPercent=20 \
-XX:+G1PeriodicGCInvokesConcurrent \
-XX:G1PeriodicGCInterval=10000 \
-XX:+UseStringDeduplication \
-XX:G1PeriodicGCSystemLoadThreshold=70" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022 \
    PYTHONPATH=/usr/lib/libreoffice/program:/opt/venv/lib/python3.12/site-packages \
    UNO_PATH=/usr/lib/libreoffice/program \
    URE_BOOTSTRAP=file:///usr/lib/libreoffice/program/fundamentalrc

# Copy necessary application files
COPY scripts /scripts
COPY pipeline /pipeline
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
#COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
COPY build/libs/*.jar /app.jar

# Set script permissions and adjust ownership of files
RUN chmod +x /scripts/* && \
    chown -R stirlingpdfuser:stirlingpdfgroup /scripts /usr/share/fonts/opentype/noto && \
    chown stirlingpdfuser:stirlingpdfgroup /app.jar

# Expose the primary port
EXPOSE 8080/tcp

# Set the entrypoint and run both the Java app and the UNO server concurrently
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD ["sh", "-c", "java -Dfile.encoding=UTF-8 -jar /app.jar & /opt/venv/bin/unoserver --port 2003 --interface 0.0.0.0"]
