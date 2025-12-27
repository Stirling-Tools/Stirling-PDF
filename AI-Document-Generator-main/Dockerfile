FROM python:3.11-slim

# Install full TeXLive so LLM outputs (siunitx, paracol, tikz, etc.) compile reliably.
RUN apt-get update && \
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
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Create output directories
RUN mkdir -p /app/output /app/data

# Expose port
EXPOSE 5000

# Run the Flask app
CMD ["python", "app.py"]
