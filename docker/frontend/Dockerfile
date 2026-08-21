# check=skip=SecretsUsedInArgOrEnv
# Supabase publishable ARG is client-safe by design, not a real secret.

# Stage 1: build
FROM node:25-alpine@sha256:e80397b81fa93888b5f855e8bef37d9b18d3c5eb38b8731fc23d6d878647340f AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend .

# Generate material-symbols icon subset (normally done by task prepare:icons).
RUN node editor/scripts/generate-icons.js

# Defaults match prior behaviour. Supabase values are client-publishable build args.
ARG STIRLING_FLAVOR=proprietary
ARG VITE_BUILD_MODE=production
ARG VITE_SUPABASE_URL=""
# pragma: allowlist secret
ARG VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=""

# Build vite from editor/, output lands in editor/dist/.
RUN set -eu; \
    export STIRLING_FLAVOR="${STIRLING_FLAVOR}"; \
    if [ -n "${VITE_SUPABASE_URL}" ]; then export VITE_SUPABASE_URL="${VITE_SUPABASE_URL}"; fi; \
    if [ -n "${VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}" ]; then export VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="${VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY}"; fi; \
    npx vite build editor --mode "${VITE_BUILD_MODE}"

# Stage 2: nginx
FROM nginx:alpine@sha256:b0f7830b6bfaa1258f45d94c240ab668ced1b3651c8a222aefe6683447c7bf55

COPY --from=build /app/editor/dist /usr/share/nginx/html
COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY docker/frontend/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENV VITE_API_BASE_URL=http://backend:8080

ENTRYPOINT ["/entrypoint.sh"]
