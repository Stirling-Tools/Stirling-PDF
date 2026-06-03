# check=skip=SecretsUsedInArgOrEnv
# The only ARG the SecretsUsedInArgOrEnv rule flags here is the Supabase
# PUBLISHABLE key — a client-safe value embedded in the bundle by design, not a
# secret. No real secrets are passed via ARG/ENV in this image.

# Frontend Dockerfile - React/Vite application
FROM node:25-alpine@sha256:e80397b81fa93888b5f855e8bef37d9b18d3c5eb38b8731fc23d6d878647340f AS build

WORKDIR /app

# Copy package files
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY frontend .

# Generate the material-symbols icon subset that LocalIcon.tsx imports at build
# time. Normally produced by `task frontend:build:<mode>` via its prepare:icons
# dependency; since this Dockerfile invokes vite directly, run it explicitly.
# Fully offline — reads the @iconify-json/material-symbols dev dependency.
RUN node editor/scripts/generate-icons.js

# ---- Build configuration (backward compatible) ----
# STIRLING_FLAVOR selects the editor tsconfig + source set (see
# frontend/editor/vite.config.ts). VITE_BUILD_MODE selects which .env.<mode>
# files vite loads and is passed to `vite build --mode`. The defaults below
# reproduce the previous behaviour exactly: proprietary flavor, production mode
# (vite's implicit default for `vite build`).
#
# VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY are CLIENT-SAFE
# publishable values, NOT secrets. They are intentionally empty here so the OSS
# repo ships no injected config; a downstream pipeline (e.g. SaaS) passes the
# target project's publishable values as build args. Note: .env* is excluded by
# .dockerignore, so these args are the only way Supabase config reaches the
# bundle in a Docker build. vite's loadEnv merges (and prioritises) VITE_-
# prefixed process env vars, so exporting them before `vite build` is enough.
ARG STIRLING_FLAVOR=proprietary
ARG VITE_BUILD_MODE=production
ARG VITE_SUPABASE_URL=""
# pragma: allowlist secret — Supabase publishable key (safe for client)
ARG VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=""

# Build the application (vite root is editor/, output lands in editor/dist/).
# Only export the Supabase overrides when provided so unset stays unset.
RUN set -eu; \
    export STIRLING_FLAVOR="${STIRLING_FLAVOR}"; \
    if [ -n "${VITE_SUPABASE_URL}" ]; then export VITE_SUPABASE_URL="${VITE_SUPABASE_URL}"; fi; \
    if [ -n "${VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}" ]; then export VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="${VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}"; fi; \
    npx vite build editor --mode "${VITE_BUILD_MODE}"

# Production stage
FROM nginx:alpine@sha256:b0f7830b6bfaa1258f45d94c240ab668ced1b3651c8a222aefe6683447c7bf55

# Copy built files from build stage
COPY --from=build /app/editor/dist /usr/share/nginx/html

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
