# Frontend Dockerfile - React/Vite application
FROM node:20-alpine@sha256:658d0f63e501824d6c23e06d4bb95c71e7d704537c9d9272f488ac03a370d448 AS build

WORKDIR /app

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine@sha256:8491795299c8e739b7fcc6285d531d9812ce2666e07bd3dd8db00020ad132295

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