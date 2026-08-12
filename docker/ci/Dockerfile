# Lightweight Ubuntu image with a pinned Task binary for CI experiments.
# Build with: task docker:build:ci

FROM ubuntu:24.04@sha256:4fbb8e6a8395de5a7550b33509421a2bafbc0aab6c06ba2cef9ebffbc7092d90

ARG TASK_VERSION=3.52.0
ARG TARGETARCH=amd64

RUN set -eux; \
    apt-get update; \
    apt-get install --no-install-recommends -y ca-certificates curl tar; \
    rm -rf /var/lib/apt/lists/*; \
    case "${TARGETARCH}" in \
      amd64) task_arch=amd64; task_sha256=02c679ffae53dca791804847d78b31731615894e292948397c971c87ac9e95bd ;; \
      arm64) task_arch=arm64; task_sha256=7e0044108830cec0534577b289564e3b7c83e6df276feb631a1edc63d04e4ebe ;; \
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

WORKDIR /workspace

ENTRYPOINT ["task"]
