# syntax=docker/dockerfile:1.5

# Build stage: uv resolves the venv here so its ~52MB binary never reaches the runtime image.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim@sha256:531f855bda2c73cd6ef67d56b733b357cea384185b3022bd09f05e002cd144ca AS builder

WORKDIR /app/engine
COPY engine/pyproject.toml engine/uv.lock ./
# Source is copied into the runtime stage instead, so the venv holds dependencies only.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --group engine

FROM python:3.13-slim-bookworm@sha256:00faa2debb87529f9f0764e9491d8ba400a3678976616c3bd7cb193745ac20d1 AS runtime

# Unprivileged runtime user, created before the copies so they can land already-owned:
# a `chown -R` afterwards would rewrite every file and duplicate the venv into a second layer.
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
# Fail closed: this image listens on 0.0.0.0, and without a shared secret the document
# routes accept any caller-supplied X-User-Id, so anyone reaching the port could write or
# purge another owner's documents. Non-public routes answer 503 until an operator sets
# STIRLING_ENGINE_SHARED_SECRET here and on the Stirling-PDF backend, which sends it as
# X-Engine-Auth. Set STIRLING_ENGINE_REQUIRE_AUTH=false to opt out on a trusted network.
ENV STIRLING_ENGINE_REQUIRE_AUTH=true

# `stirling` imports resolve from the working directory, matching engine:run's `dir: src`.
WORKDIR /app/engine/src
USER stirling

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('STIRLING_ENGINE_PORT','5001'), timeout=4).status==200 else 1)"]

# Calls uvicorn directly: `task` would need the repo's frontend/ include to exist.
CMD ["sh", "-c", "exec uvicorn stirling.api.app:app --host 0.0.0.0 --port ${STIRLING_ENGINE_PORT:-5001} --workers ${STIRLING_ENGINE_WORKERS:-4}"]
