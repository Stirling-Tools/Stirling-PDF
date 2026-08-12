# Lightweight Ubuntu image with a pinned Task binary for CI experiments.
# Build with: task docker:build:ci

FROM ubuntu:24.04@sha256:4fbb8e6a8395de5a7550b33509421a2bafbc0aab6c06ba2cef9ebffbc7092d90

ARG TASK_VERSION=3.51.1
ARG TARGETARCH

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/* \
    && case "${TARGETARCH}" in \
         amd64) task_arch=amd64; task_sha256=da7e92f0ff961ef2aae7cfecbad8d1fd2a08d7b09ba968673adf7ff389b243b5 ;; \
         arm64) task_arch=arm64; task_sha256=49c58bb00eff2449a5553f3b3e694fc424e0dc04d5c669d8831126daee1000f8 ;; \
         *) echo "Unsupported Docker architecture: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl --fail --silent --show-error --location \
         "https://github.com/go-task/task/releases/download/v${TASK_VERSION}/task_linux_${task_arch}.tar.gz" \
         --output /tmp/task.tar.gz \
    && echo "${task_sha256}  /tmp/task.tar.gz" | sha256sum --check --status \
    && tar --extract --file /tmp/task.tar.gz --directory /usr/local/bin task \
    && chmod 0755 /usr/local/bin/task \
    && rm /tmp/task.tar.gz

WORKDIR /workspace

ENTRYPOINT ["task"]
