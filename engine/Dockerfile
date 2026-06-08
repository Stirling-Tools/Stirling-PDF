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

# The OSS repo's root Taskfile.yml expects engine tasks to run from ./engine/
# (configured via `includes.engine.dir: engine`). The OSS-clone-build workflow
# copies the root Taskfile.yml + .taskfiles/ into the engine build context, then
# this Dockerfile copies them into the image. To match the Taskfile's expectations
# at runtime, engine source must live at /app/engine/ — not flattened to /app/ —
# so `task engine:run` can chdir there successfully and uv resolves
# scripts/setup_env.py to /app/engine/scripts/setup_env.py.
#
# Layout:
#   /app/Taskfile.yml          ← workflow-copied root Taskfile
#   /app/.taskfiles/           ← workflow-copied .taskfiles
#   /app/engine/pyproject.toml
#   /app/engine/uv.lock
#   /app/engine/.env
#   /app/engine/scripts/       ← scripts/setup_env.py here
#   /app/engine/src/           ← uvicorn entrypoint dir
#   /app/engine/.venv/         ← uv-managed venv
WORKDIR /app/engine

COPY pyproject.toml uv.lock .env ./
COPY scripts/ ./scripts/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY src/ ./src/

# Task definitions live at /app/ — root Taskfile + included .taskfiles — because
# the root Taskfile's `includes.engine.dir: engine` is resolved relative to the
# Taskfile's own location, so it must sit one level above engine/.
WORKDIR /app
COPY Taskfile.yml ./
COPY .taskfiles/ ./.taskfiles/

ENV PATH="/app/engine/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 5001

CMD ["task", "engine:run"]
