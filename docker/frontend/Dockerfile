# Frontend Dockerfile - React/Vite application
FROM node:25-alpine@sha256:e80397b81fa93888b5f855e8bef37d9b18d3c5eb38b8731fc23d6d878647340f AS build

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
FROM nginx:alpine@sha256:b0f7830b6bfaa1258f45d94c240ab668ced1b3651c8a222aefe6683447c7bf55

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