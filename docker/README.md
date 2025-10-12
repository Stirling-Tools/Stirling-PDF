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
└── compose/           # Docker Compose files
    ├── docker-compose.yml           # Standard setup
    ├── docker-compose.ultra-lite.yml # Ultra-lite setup
    └── docker-compose.fat.yml       # Full-featured setup
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


## Access Points

- **Frontend**: http://localhost:3000
- **Backend API (debugging)**: http://localhost:8080 (TODO: Remove in production)
- **Backend API (via frontend)**: http://localhost:3000/api/*

## Configuration

- **Backend URL**: Set `VITE_API_BASE_URL` environment variable for custom backend locations
- **Custom Ports**: Modify port mappings in docker-compose files
- **Memory Limits**: Adjust memory limits per variant (2G ultra-lite, 4G standard, 6G fat)

### [Google Drive Integration](https://developers.google.com/workspace/drive/picker/guides/overview)

- **VITE_GOOGLE_DRIVE_CLIENT_ID**: [OAuth 2.0 Client ID](https://console.cloud.google.com/auth/clients/create)
- **VITE_GOOGLE_DRIVE_API_KEY**: [Create New API](https://console.cloud.google.com/apis)
- **VITE_GOOGLE_DRIVE_APP_ID**: This is your [project number](https://console.cloud.google.com/iam-admin/settings) in the GoogleCloud Settings

## Development vs Production

- **Development**: Keep backend port 8080 exposed for debugging
- **Production**: Remove backend port exposure, use only frontend proxy

