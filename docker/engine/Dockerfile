# syntax=docker/dockerfile:1.5

# uv resolves the venv here so its ~52MB binary stays out of the runtime image.
FROM python:3.13-slim-bookworm@sha256:281d39ff02e3b389401586134ff9e6572954687822a58055ec07a60ded4e0b7f AS builder
COPY --from=ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 /uv /uvx /bin/

WORKDIR /app/engine
COPY engine/pyproject.toml engine/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --group engine

FROM python:3.13-slim-bookworm@sha256:281d39ff02e3b389401586134ff9e6572954687822a58055ec07a60ded4e0b7f AS runtime

# Created before the COPYs so they land owned; a later chown -R duplicates the venv layer.
RUN set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    rm -rf /var/lib/apt/lists/*; \
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
