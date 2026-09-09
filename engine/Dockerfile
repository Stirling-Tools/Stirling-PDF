# syntax=docker/dockerfile:1.5
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim@sha256:531f855bda2c73cd6ef67d56b733b357cea384185b3022bd09f05e002cd144ca

ARG TASK_VERSION=3.49.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && ARCH=$(dpkg --print-architecture) \
    && curl -fsSL "https://github.com/go-task/task/releases/download/v${TASK_VERSION}/task_${TASK_VERSION}_linux_${ARCH}.deb" -o /tmp/task.deb \
    && dpkg -i /tmp/task.deb \
    && rm /tmp/task.deb \
    && rm -rf /var/lib/apt/lists/*

# Source under /app/engine/ to match root Taskfile's `includes.engine.dir: engine`.
WORKDIR /app/engine

COPY pyproject.toml uv.lock .env ./
COPY scripts/ ./scripts/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY src/ ./src/

WORKDIR /app
COPY Taskfile.yml ./
COPY .taskfiles/ ./.taskfiles/

ENV PATH="/app/engine/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV STIRLING_ENGINE_WORKERS=4
# Container runs on a fixed port; skip the host-only free-port probe (its script
# is not shipped in the image). engine:run honours these.
ENV ENGINE_PORT_PROBE=false
ENV STIRLING_ENGINE_PORT=5001

EXPOSE 5001

CMD ["task", "engine:run"]
