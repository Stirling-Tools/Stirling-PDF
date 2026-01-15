# Stirling-PDF Unified Container

Single Docker container that can run as **frontend + backend**, **frontend only**, or **backend only** using the `MODE` environment variable.

## Quick Start

### MODE=BOTH (Default)
Single container with both frontend and backend on port 8080:

```bash
docker run -p 8080:8080 \
  -e MODE=BOTH \
  stirlingtools/stirling-pdf:unified
```

Access at: `http://localhost:8080`

### MODE=FRONTEND
Frontend only, connecting to separate backend:

```bash
docker run -p 8080:8080 \
  -e MODE=FRONTEND \
  -e VITE_API_BASE_URL=http://backend:8080 \
  stirlingtools/stirling-pdf:unified
```

### MODE=BACKEND
Backend API only:

```bash
docker run -p 8080:8080 \
  -e MODE=BACKEND \
  stirlingtools/stirling-pdf:unified
```

Access API at: `http://localhost:8080/api`
Swagger UI at: `http://localhost:8080/swagger-ui/index.html`

---

## Architecture

### MODE=BOTH (Default)
```
┌─────────────────────────────────────┐
│     Port 8080 (External)            │
│  ┌───────────────────────────────┐  │
│  │         Nginx                 │  │
│  │  • Serves frontend (/)        │  │
│  │  • Proxies /api/* → backend   │  │
│  └───────────┬───────────────────┘  │
│              │                       │
│  ┌───────────▼───────────────────┐  │
│  │    Backend (Internal 8081)    │  │
│  │  • Spring Boot                │  │
│  │  • PDF Processing             │  │
│  │  • UnoServer                  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### MODE=FRONTEND
```
┌─────────────────────────────┐      ┌──────────────────┐
│   Frontend Container        │      │  Backend         │
│   Port 8080                 │      │  (External)      │
│  ┌───────────────────────┐  │      │                  │
│  │       Nginx           │  │──────▶  :8080/api       │
│  │  • Serves frontend    │  │      │                  │
│  │  • Proxies to backend │  │      │                  │
│  └───────────────────────┘  │      └──────────────────┘
└─────────────────────────────┘
```

### MODE=BACKEND
```
┌─────────────────────────────┐
│   Backend Container         │
│   Port 8080                 │
│  ┌───────────────────────┐  │
│  │   Spring Boot         │  │
│  │  • API Endpoints      │  │
│  │  • PDF Processing     │  │
│  │  • UnoServer          │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## Environment Variables

### MODE Configuration

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `MODE` | `BOTH`, `FRONTEND`, `BACKEND` | `BOTH` | Container operation mode |

### MODE=BOTH Specific

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_INTERNAL_PORT` | `8081` | Internal port for backend when MODE=BOTH |

### MODE=FRONTEND Specific

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://backend:8080` | Backend URL for API proxying |

### Standard Configuration

All modes support standard Stirling-PDF environment variables:

- `DISABLE_ADDITIONAL_FEATURES` - Enable/disable OCR and LibreOffice features
- `DOCKER_ENABLE_SECURITY` - Enable authentication
- `PUID` / `PGID` - User/Group IDs
- `SYSTEM_MAXFILESIZE` - Max upload size (MB)
- `TESSERACT_LANGS` - Comma-separated OCR language codes
- `JAVA_CUSTOM_OPTS` - Additional JVM options
- `PROCESS_EXECUTOR_AUTO_UNO_SERVER` - Overrides `processExecutor.autoUnoServer` (true or false)
- `PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT` - Overrides `processExecutor.sessionLimit.libreOfficeSessionLimit`
- `UNO_SERVER_AUTO` - Legacy alias for `processExecutor.autoUnoServer`
- `UNO_SERVER_COUNT` - Legacy alias for `processExecutor.sessionLimit.libreOfficeSessionLimit`
- `UNO_SERVER_HEALTH_INTERVAL` - Seconds between unoserver PID checks (default: 30)

See full configuration docs at: https://docs.stirlingpdf.com

---

## Docker Compose Examples

### Example 1: All-in-One (MODE=BOTH)

**File:** `docker/compose/docker-compose-unified-both.yml`

```yaml
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:unified
    ports:
      - "8080:8080"
    volumes:
      - ./data:/usr/share/tessdata:rw
      - ./config:/configs:rw
    environment:
      MODE: BOTH
    restart: unless-stopped
```

### Example 2: Separate Frontend & Backend

**File:** `docker/compose/docker-compose-unified-frontend.yml`

```yaml
services:
  backend:
    image: stirlingtools/stirling-pdf:unified
    ports:
      - "8081:8080"
    environment:
      MODE: BACKEND
    volumes:
      - ./data:/usr/share/tessdata:rw
      - ./config:/configs:rw

  frontend:
    image: stirlingtools/stirling-pdf:unified
    ports:
      - "8080:8080"
    environment:
      MODE: FRONTEND
      VITE_API_BASE_URL: http://backend:8080
    depends_on:
      - backend
```

### Example 3: Backend API Only

**File:** `docker/compose/docker-compose-unified-backend.yml`

```yaml
services:
  stirling-pdf-api:
    image: stirlingtools/stirling-pdf:unified
    ports:
      - "8080:8080"
    environment:
      MODE: BACKEND
    volumes:
      - ./data:/usr/share/tessdata:rw
      - ./config:/configs:rw
    restart: unless-stopped
```

---

## Building the Image

```bash
# From repository root
docker build -t stirlingtools/stirling-pdf:unified -f docker/Dockerfile.unified .
```

### Build Arguments

| Argument | Description |
|----------|-------------|
| `VERSION_TAG` | Version tag for the image |

Example:
```bash
docker build \
  --build-arg VERSION_TAG=v1.0.0 \
  -t stirlingtools/stirling-pdf:unified \
  -f docker/Dockerfile.unified .
```

---

## Use Cases

### 1. Simple Deployment (MODE=BOTH)
- **Best for:** Personal use, small teams, simple deployments
- **Pros:** Single container, easy setup, minimal configuration
- **Cons:** Frontend and backend scale together

### 2. Scaled Frontend (MODE=FRONTEND + BACKEND)
- **Best for:** High traffic, need to scale frontend independently
- **Pros:** Scale frontend containers separately, CDN-friendly
- **Example:**
  ```yaml
  services:
    backend:
      image: stirlingtools/stirling-pdf:unified
      environment:
        MODE: BACKEND
      deploy:
        replicas: 1

    frontend:
      image: stirlingtools/stirling-pdf:unified
      environment:
        MODE: FRONTEND
        VITE_API_BASE_URL: http://backend:8080
      deploy:
        replicas: 5  # Scale frontend independently
  ```

### 3. API-Only (MODE=BACKEND)
- **Best for:** Headless deployments, custom frontends, API integrations
- **Pros:** Minimal resources, no nginx overhead
- **Example:** Use with external frontend or API consumers

### 4. Multi-Backend Setup
- **Best for:** Load balancing, high availability
- **Example:**
  ```yaml
  services:
    backend-1:
      image: stirlingtools/stirling-pdf:unified
      environment:
        MODE: BACKEND

    backend-2:
      image: stirlingtools/stirling-pdf:unified
      environment:
        MODE: BACKEND

    frontend:
      image: stirlingtools/stirling-pdf:unified
      environment:
        MODE: FRONTEND
        VITE_API_BASE_URL: http://load-balancer:8080
  ```

---

## Port Configuration

All modes use **port 8080** by default:

- **MODE=BOTH**: Nginx listens on 8080, proxies to backend on internal 8081
- **MODE=FRONTEND**: Nginx listens on 8080
- **MODE=BACKEND**: Spring Boot listens on 8080

**Expose port 8080** in all configurations:
```yaml
ports:
  - "8080:8080"
```

---

## Health Checks

### MODE=BOTH and MODE=BACKEND
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:8080/api/v1/info/status || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### MODE=FRONTEND
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:8080/ || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
```

---

## Troubleshooting

### Check logs
```bash
docker logs stirling-pdf-container
```

Look for the startup banner:
```
===================================
Stirling-PDF Unified Container
MODE: BOTH
===================================
```

### Invalid MODE error
```
ERROR: Invalid MODE 'XYZ'. Must be BOTH, FRONTEND, or BACKEND
```
**Fix:** Set `MODE` to one of the three valid values.

### Frontend can't connect to backend (MODE=FRONTEND)
**Check:**
1. `VITE_API_BASE_URL` points to correct backend URL
2. Backend container is running and accessible
3. Network connectivity between containers

### Backend not starting (MODE=BOTH or BACKEND)
**Check:**
1. Sufficient memory allocated (4GB recommended)
2. Java heap size (`JAVA_CUSTOM_OPTS`)
3. Volume permissions for `/tmp/stirling-pdf`

---

## Migration Guide

### From Separate Containers → MODE=BOTH

**Before:**
```yaml
services:
  frontend:
    image: stirlingtools/stirling-pdf:frontend
    ports: ["80:80"]

  backend:
    image: stirlingtools/stirling-pdf:backend
    ports: ["8080:8080"]
```

**After:**
```yaml
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:unified
    ports: ["8080:8080"]
    environment:
      MODE: BOTH
```

### From Legacy → MODE=BACKEND
```yaml
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:latest
    ports: ["8080:8080"]
```

**Becomes:**
```yaml
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:unified
    ports: ["8080:8080"]
    environment:
      MODE: BACKEND
```

---

## Performance Tuning

### MODE=BOTH
```yaml
environment:
  JAVA_CUSTOM_OPTS: "-Xmx4g -XX:MaxRAMPercentage=75"
  BACKEND_INTERNAL_PORT: 8081
deploy:
  resources:
    limits:
      memory: 4G
    reservations:
      memory: 2G
```

### MODE=FRONTEND (Lightweight)
```yaml
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

### MODE=BACKEND (Heavy Processing)
```yaml
environment:
  JAVA_CUSTOM_OPTS: "-Xmx8g"
deploy:
  resources:
    limits:
      memory: 10G
    reservations:
      memory: 4G
```

---

## Security Considerations

1. **MODE=BOTH**: Backend not exposed externally (runs on internal port)
2. **MODE=BACKEND**: API exposed directly - consider API authentication
3. **MODE=FRONTEND**: Only serves static files - minimal attack surface

Enable security features:
```yaml
environment:
  DOCKER_ENABLE_SECURITY: "true"
  SECURITY_ENABLELOGIN: "true"
```

---

## Support

- Documentation: https://docs.stirlingpdf.com
- GitHub Issues: https://github.com/Stirling-Tools/Stirling-PDF/issues
- Docker Hub: https://hub.docker.com/r/stirlingtools/stirling-pdf

---

## License

MIT License - See repository for full details
