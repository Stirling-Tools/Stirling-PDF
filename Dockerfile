# Main stage
FROM alpine:3.21.3@sha256:a8560b36e8b8210634f77d9f7f9efd7ffa463e380b75e2e74aff4511df3ef88c

# Copy necessary files
COPY scripts /scripts
COPY pipeline /pipeline
COPY src/main/resources/static/fonts/*.ttf /usr/share/fonts/opentype/noto/
#COPY src/main/resources/static/fonts/*.otf /usr/share/fonts/opentype/noto/
COPY build/libs/*.jar app.jar

ARG VERSION_TAG

LABEL org.opencontainers.image.title="Stirling-PDF"
LABEL org.opencontainers.image.description="A powerful locally hosted web-based PDF manipulation tool supporting 50+ operations including merging, splitting, conversion, OCR, watermarking, and more."
LABEL org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Stirling-Tools"
LABEL org.opencontainers.image.url="https://www.stirlingpdf.com"
LABEL org.opencontainers.image.documentation="https://docs.stirlingpdf.com"
LABEL maintainer="Stirling-Tools"
LABEL org.opencontainers.image.authors="Stirling-Tools"
LABEL org.opencontainers.image.version="${VERSION_TAG}"
LABEL org.opencontainers.image.keywords="PDF, manipulation, merge, split, convert, OCR, watermark"

# Set Environment Variables
ENV DOCKER_ENABLE_SECURITY=false \
    VERSION_TAG=$VERSION_TAG \
    JAVA_BASE_OPTS="-XX:+UnlockExperimentalVMOptions -XX:MaxRAMPercentage=75 -XX:InitiatingHeapOccupancyPercent=20 -XX:+G1PeriodicGCInvokesConcurrent -XX:G1PeriodicGCInterval=10000 -XX:+UseStringDeduplication -XX:G1PeriodicGCSystemLoadThreshold=70" \
    JAVA_CUSTOM_OPTS="" \
    HOME=/home/stirlingpdfuser \
    PUID=1000 \
    PGID=1000 \
    UMASK=022 \
    PYTHONPATH=/usr/lib/libreoffice/program:/opt/venv/lib/python3.12/site-packages \
    UNO_PATH=/usr/lib/libreoffice/program \
    URE_BOOTSTRAP=file:///usr/lib/libreoffice/program/fundamentalrc \
    PATH=$PATH:/opt/venv/bin


# JDK for app
RUN echo "@main https://dl-cdn.alpinelinux.org/alpine/edge/main" | tee -a /etc/apk/repositories && \
    echo "@community https://dl-cdn.alpinelinux.org/alpine/edge/community" | tee -a /etc/apk/repositories && \
    echo "@testing https://dl-cdn.alpinelinux.org/alpine/edge/testing" | tee -a /etc/apk/repositories && \
    apk upgrade --no-cache -a && \
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
    # OCR MY PDF (unpaper for descew and other advanced features)
    tesseract-ocr-data-eng \
    tesseract-ocr-data-chi_sim \
	tesseract-ocr-data-deu \
	tesseract-ocr-data-fra \
	tesseract-ocr-data-por \
    # CV
    py3-opencv \
    python3 \
    py3-pip \
    py3-pillow@testing \
    py3-pdf2image@testing && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade unoserver weasyprint && \
    ln -s /usr/lib/libreoffice/program/uno.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program/unohelper.py /opt/venv/lib/python3.12/site-packages/ && \
    ln -s /usr/lib/libreoffice/program /opt/venv/lib/python3.12/site-packages/LibreOffice && \
    mv /usr/share/tessdata /usr/share/tessdata-original && \
    mkdir -p $HOME /configs /logs /customFiles /pipeline/watchedFolders /pipeline/finishedFolders && \
    fc-cache -f -v && \
    chmod +x /scripts/* && \
    chmod +x /scripts/init.sh && \
    # User permissions
    addgroup -S stirlingpdfgroup && adduser -S stirlingpdfuser -G stirlingpdfgroup && \
    chown -R stirlingpdfuser:stirlingpdfgroup $HOME /scripts /usr/share/fonts/opentype/noto /configs /customFiles /pipeline && \
    chown stirlingpdfuser:stirlingpdfgroup /app.jar

EXPOSE 8080/tcp

# Set user and run command
ENTRYPOINT ["tini", "--", "/scripts/init.sh"]
CMD ["sh", "-c", "java -Dfile.encoding=UTF-8 -jar /app.jar & /opt/venv/bin/unoserver --port 2003 --interface 127.0.0.1"]
