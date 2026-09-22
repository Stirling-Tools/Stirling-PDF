ARG CLIENT_IMAGE=alpine:3.22
FROM ${CLIENT_IMAGE}
RUN if command -v apk >/dev/null; then \
      apk add --no-cache python3 py3-pip poppler-utils; \
    else \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils && \
      rm -rf /var/lib/apt/lists/*; \
    fi && \
    python3 -m venv /opt/client && /opt/client/bin/pip install --no-cache-dir unoserver==3.7
COPY client.py /client.py
COPY fixtures /fixtures
USER 1001:1001
ENTRYPOINT ["/opt/client/bin/python", "-u", "/client.py"]
