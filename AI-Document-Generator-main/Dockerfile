# syntax=docker/dockerfile:1.5
FROM python:3.11-slim

# Install full TeXLive so LLM outputs (siunitx, paracol, tikz, etc.) compile reliably.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      texlive-full \
      latexmk \
      ghostscript \
      poppler-utils \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend files
COPY backend/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY backend/ .

# Create output directories
RUN mkdir -p /app/output /app/data

# Expose port
EXPOSE 5000

# Run the Flask app
CMD ["python", "app.py"]
