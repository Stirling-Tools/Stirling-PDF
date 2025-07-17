# Docker Setup for Stirling-PDF

This directory contains the organized Docker configurations for the split frontend/backend architecture.

## Directory Structure

```
docker/
├── backend/           # Backend Docker files
│   ├── Dockerfile            # Standard backend
│   ├── Dockerfile.ultra-lite # Minimal backend
│   └── Dockerfile.fat        # Full-featured backend
├── frontend/          # Frontend Docker files
│   ├── Dockerfile     # React/Vite frontend with nginx
│   ├── nginx.conf     # Nginx configuration
│   └── entrypoint.sh  # Dynamic backend URL setup
├── monolith/          # Single container setup
│   ├── Dockerfile           # Combined frontend + backend
│   ├── nginx-monolith.conf  # Nginx config for monolith
│   └── start-monolith.sh    # Startup script
└── compose/           # Docker Compose files
    ├── docker-compose.yml           # Standard setup
    ├── docker-compose.ultra-lite.yml # Ultra-lite setup
    ├── docker-compose.fat.yml       # Full-featured setup
    └── docker-compose.monolith.yml  # Single container setup
```

## Usage

### Separate Containers (Recommended)

From the project root directory:

```bash
# Standard version
docker-compose -f docker/compose/docker-compose.yml up --build

# Ultra-lite version
docker-compose -f docker/compose/docker-compose.ultra-lite.yml up --build

# Fat version
docker-compose -f docker/compose/docker-compose.fat.yml up --build
```

### Single Container (Monolith)

```bash
# Single container with both frontend and backend
docker-compose -f docker/compose/docker-compose.monolith.yml up --build
```

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API (debugging)**: http://localhost:8080 (TODO: Remove in production)
- **Backend API (via frontend)**: http://localhost:3000/api/*

## Configuration

- **Backend URL**: Set `BACKEND_URL` environment variable for custom backend locations
- **Custom Ports**: Modify port mappings in docker-compose files
- **Memory Limits**: Adjust memory limits per variant (2G ultra-lite, 4G standard, 6G fat)

## Development vs Production

- **Development**: Keep backend port 8080 exposed for debugging
- **Production**: Remove backend port exposure, use only frontend proxy