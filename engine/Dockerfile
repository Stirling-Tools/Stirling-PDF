# syntax=docker/dockerfile:1.5

# uv resolves the venv here so its ~52MB binary stays out of the runtime image.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim@sha256:531f855bda2c73cd6ef67d56b733b357cea384185b3022bd09f05e002cd144ca AS builder

WORKDIR /app/engine
COPY engine/pyproject.toml engine/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --group engine

FROM python:3.14-slim-bookworm@sha256:416f0db2a2b561945630cef9877a7ea0581b27449eb9fd9df42f03e1b74b5b63 AS runtime

# Created before the COPYs so they land owned; a later chown -R duplicates the venv layer.
RUN set -eux; \
    groupadd --system --gid 1000 stirling; \
    useradd --system --uid 1000 --gid 1000 --home /app/engine stirling; \
    mkdir -p /app/engine/data; \
    chown stirling:stirling /app/engine /app/engine/data

WORKDIR /app/engine
COPY --from=builder --chown=stirling:stirling /app/engine/.venv ./.venv
# settings.py resolves ENGINE_ROOT to /app/engine, so .env must sit here.
COPY --chown=stirling:stirling engine/.env ./
COPY --chown=stirling:stirling engine/src/ ./src/

ENV PATH="/app/engine/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV STIRLING_ENGINE_WORKERS=4
ENV STIRLING_ENGINE_PORT=5001
# Fail closed: without a secret the document routes trust caller-supplied X-User-Id.
# Set STIRLING_ENGINE_SHARED_SECRET (the backend sends it as X-Engine-Auth), or false to opt out.
ENV STIRLING_ENGINE_REQUIRE_AUTH=true

# `stirling` resolves from the working directory.
WORKDIR /app/engine/src
USER stirling

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('STIRLING_ENGINE_PORT','5001'), timeout=4).status==200 else 1)"]

CMD ["sh", "-c", "exec uvicorn stirling.api.app:app --host 0.0.0.0 --port ${STIRLING_ENGINE_PORT:-5001} --workers ${STIRLING_ENGINE_WORKERS:-4}"]
