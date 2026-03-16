# syntax=docker/dockerfile:1.5
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# Install system deps: Node.js + Puppeteer/Chromium runtime libraries
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates \
      poppler-utils \
      nodejs \
      npm \
      # Fonts for correct text rendering in generated PDFs
      fonts-liberation \
      fonts-dejavu-core \
      # Chromium headless runtime deps
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libx11-6 \
      libxext6 \
      libxfixes3 \
      libgbm1 \
      libdrm2 \
      libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies (Puppeteer) first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Install Python dependencies
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Copy Python source into /app/src/
COPY src/ ./src/

# Create output directories
RUN mkdir -p /app/output /app/data

# Expose port
EXPOSE 5001

# Environment variables for Gunicorn configuration
ENV GUNICORN_WORKERS=4
ENV GUNICORN_TIMEOUT=120
# Disable Python stdout/stderr buffering so log output appears immediately in Docker logs
ENV PYTHONUNBUFFERED=1

ENV PATH="/app/.venv/bin:$PATH"
WORKDIR /app/src
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:5001 --workers ${GUNICORN_WORKERS} --timeout ${GUNICORN_TIMEOUT} --worker-class gthread --threads 4 app:app"]
