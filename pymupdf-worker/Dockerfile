# Stirling PDF PyMuPDF Worker - AGPL-3.0-or-later
# This image bundles AGPL-3.0 software (PyMuPDF + this worker). Distributing it
# carries AGPL obligations for THIS worker only; it is a separate program from
# the MIT core and proprietary engine, invoked as a CLI subprocess.
FROM python:3.13-slim-bookworm

LABEL org.opencontainers.image.title="Stirling PDF PyMuPDF Worker"
LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/Stirling-Tools/Stirling-PDF/tree/main/pymupdf-worker"

WORKDIR /app

COPY pyproject.toml ./
COPY LICENSE ./
COPY src/ ./src/

RUN pip install --no-cache-dir . \
    && useradd --no-create-home --shell /bin/false pymupdf

USER pymupdf

ENV PYTHONUNBUFFERED=1
