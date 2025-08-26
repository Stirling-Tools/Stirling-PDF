# Frontend Dockerfile - React/Vite application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies (uses .npmrc secret if available, otherwise anonymous)
RUN --mount=type=secret,id=npmrc \
    if [ -s /run/secrets/npmrc ]; then \
      echo "$(cat /run/secrets/npmrc)" > /root/.npmrc; \
    fi && \
    npm ci && \
    rm -f /root/.npmrc

# Copy source code
COPY frontend .

# Build the application (uses .npmrc secret if available, otherwise anonymous)
RUN --mount=type=secret,id=npmrc \
    if [ -s /run/secrets/npmrc ]; then \
      echo "$(cat /run/secrets/npmrc)" > /root/.npmrc; \
    fi && \
    npm run build && \
    rm -f /root/.npmrc

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration and entrypoint
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY docker/frontend/entrypoint.sh /entrypoint.sh

# Make entrypoint executable
RUN chmod +x /entrypoint.sh

# Expose port 80 (standard HTTP port)
EXPOSE 80

# Environment variables for flexibility
ENV VITE_API_BASE_URL=http://backend:8080

# Use custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]