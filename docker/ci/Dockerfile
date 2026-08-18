# Lightweight Ubuntu image with a pinned Task binary for CI.
# Build with: task docker:build:ci

FROM ubuntu:noble@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea

ARG TASK_VERSION=3.53.1
ARG TARGETARCH=amd64

RUN set -eux; \
    apt-get update; \
    apt-get install --no-install-recommends -y ca-certificates curl tar; \
    rm -rf /var/lib/apt/lists/*; \
    case "${TARGETARCH}" in \
      amd64) task_arch=amd64; task_sha256=a54a408f6861ff921f6e87774180db31bacd8c1e7c944ca696db9fea49a82fc7 ;; \
      arm64) task_arch=arm64; task_sha256=e3ad19101493a0112e1f22ae8ccc54bf03e533b1076a0ca1e6c782a09ad2e588 ;; \
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
