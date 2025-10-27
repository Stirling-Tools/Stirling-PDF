#!/bin/bash

# Build script for Stirling-PDF Unified Container
# Usage: ./build.sh [version-tag]

set -e

VERSION_TAG=${1:-latest}
IMAGE_NAME="stirlingtools/stirling-pdf:unified-${VERSION_TAG}"

echo "==================================="
echo "Building Stirling-PDF Unified Container"
echo "Version: $VERSION_TAG"
echo "Image: $IMAGE_NAME"
echo "==================================="

# Navigate to repository root (assuming script is in docker/unified/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$SCRIPT_DIR/../.."

cd "$REPO_ROOT"

# Build the image
docker build \
  --build-arg VERSION_TAG="$VERSION_TAG" \
  -t "$IMAGE_NAME" \
  -f docker/Dockerfile.unified \
  .

echo "==================================="
echo "✓ Build complete!"
echo "Image: $IMAGE_NAME"
echo ""
echo "Test the image:"
echo "  MODE=BOTH:     docker run -p 8080:8080 -e MODE=BOTH $IMAGE_NAME"
echo "  MODE=FRONTEND: docker run -p 8080:8080 -e MODE=FRONTEND $IMAGE_NAME"
echo "  MODE=BACKEND:  docker run -p 8080:8080 -e MODE=BACKEND $IMAGE_NAME"
echo "==================================="
