# Frontend Dockerfile - React/Vite application
FROM node:25-alpine@sha256:f4769ca6eeb6ebbd15eb9c8233afed856e437b75f486f7fccaa81d7c8ad56007 AS build

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
FROM nginx:alpine@sha256:c083c3799197cfff91fe5c3c558db3d2eea65ccbbfd419fa42a64d2c39a24027

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