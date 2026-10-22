# Lightweight Ubuntu image with a pinned Task binary for CI.
# Build with: task docker:build:ci

FROM ubuntu:noble@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea

ARG TASK_VERSION=3.54.0
ARG TARGETARCH=amd64

RUN set -eux; \
    apt-get update; \
    apt-get install --no-install-recommends -y ca-certificates curl tar; \
    rm -rf /var/lib/apt/lists/*; \
    case "${TARGETARCH}" in \
      amd64) task_arch=amd64; task_sha256=680859dbb4d881a9c72d4d9a8f510825450849af8567deacd7302c01124416fb ;; \
      arm64) task_arch=arm64; task_sha256=d7189d439d4a6058e39e1b2acd7c8b27acd4856691b408f23b242e4294e1df5b ;; \
      *) echo "Unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    archive="/tmp/task_linux_${task_arch}.tar.gz"; \
    curl --fail --show-error --location --http1.1 --retry 5 --retry-all-errors --connect-timeout 30 \
      "https://github.com/go-task/task/releases/download/v${TASK_VERSION}/task_linux_${task_arch}.tar.gz" \
      --output "${archive}"; \
    echo "${task_sha256}  ${archive}" | sha256sum --check; \
    tar --extract --file "${archive}" --directory /usr/local/bin task; \
    chmod 0755 /usr/local/bin/task; \
    rm "${archive}"

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin taskuser

WORKDIR /workspace
USER taskuser

ENTRYPOINT ["task"]
