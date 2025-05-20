#!/bin/bash

# This script helps prepare your host environment for running Stirling-PDF in rootless mode
# It creates the necessary directories with appropriate permissions

# Set text colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Usage information
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --base-dir DIR     Base directory for Stirling-PDF data (default: /stirling/rootless)"
    echo "  -u, --uid UID          User ID to set as owner (default: current user ID)"
    echo "  -g, --gid GID          Group ID to set as owner (default: current group ID)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --base-dir ~/stirling-data --uid 1000 --gid 1000"
}

# Default values
BASE_DIR="/stirling/rootless"
UID_VAL=$(id -u)
GID_VAL=$(id -g)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--base-dir)
            BASE_DIR="$2"
            shift 2
            ;;
        -u|--uid)
            UID_VAL="$2"
            shift 2
            ;;
        -g|--gid)
            GID_VAL="$2"
            shift 2
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "Error: Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ ! "$UID_VAL" =~ ^[0-9]+$ ]]; then
    echo "Error: UID must be a number"
    exit 1
fi

if [[ ! "$GID_VAL" =~ ^[0-9]+$ ]]; then
    echo "Error: GID must be a number"
    exit 1
fi

echo -e "${YELLOW}Setting up directories for Stirling-PDF rootless mode${NC}"
echo "==============================================="
echo "UID: $UID_VAL"
echo "GID: $GID_VAL"
echo "Base directory: $BASE_DIR"
echo

# Create base directory if it doesn't exist
if [ ! -d "$BASE_DIR" ]; then
    echo "Creating base directory: $BASE_DIR"
    mkdir -p "$BASE_DIR" || { echo "Failed to create base directory"; exit 1; }
fi

# Create necessary subdirectories
DIRS=(
    "data" 
    "config" 
    "logs" 
    "customFiles" 
    "customFiles/signatures"
    "customFiles/templates"
    "pipeline/watchedFolders" 
    "pipeline/finishedFolders"
)

for DIR in "${DIRS[@]}"; do
    FULL_PATH="$BASE_DIR/$DIR"
    echo "Creating directory: $FULL_PATH"
    mkdir -p "$FULL_PATH" || { echo "Failed to create directory: $FULL_PATH"; exit 1; }
    
    echo "Setting ownership to $UID_VAL:$GID_VAL for $FULL_PATH"
    chown -R "$UID_VAL:$GID_VAL" "$FULL_PATH" || { echo "Warning: Failed to change ownership for $FULL_PATH"; }
    
    echo "Setting permissions for $FULL_PATH"
    chmod -R 1777 "$FULL_PATH" || { echo "Warning: Failed to set permissions for $FULL_PATH"; }
done

# Create a Docker Compose file for rootless mode if it doesn't exist
COMPOSE_FILE="$BASE_DIR/docker-compose-rootless.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Creating Docker Compose file for rootless mode: $COMPOSE_FILE"
    cat > "$COMPOSE_FILE" << EOL
services:
  stirling-pdf:
    container_name: Stirling-PDF-Rootless
    # Use the fat version for rootless operation as it includes all dependencies
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest-fat
    user: "$UID_VAL:$GID_VAL"
    ports:
      - "8080:8080"
    volumes:
      - $BASE_DIR/data:/usr/share/tessdata:rw
      - $BASE_DIR/config:/configs:rw
      - $BASE_DIR/logs:/logs:rw
      - $BASE_DIR/customFiles:/customFiles:rw
      - $BASE_DIR/pipeline:/pipeline:rw
    environment:
      DOCKER_ENABLE_SECURITY: "false"
      SECURITY_ENABLELOGIN: "false"
      SYSTEM_DEFAULTLOCALE: en-US
      UI_APPNAME: Stirling-PDF
      UI_HOMEDESCRIPTION: Stirling-PDF Rootless
      UI_APPNAMENAVBAR: Stirling-PDF Rootless
    restart: unless-stopped
EOL
    echo "Docker Compose file created"
fi

echo -e "${GREEN}"
echo "==============================================="
echo "Preparation complete!"
echo "===============================================${NC}"
echo ""
echo "To run Stirling-PDF in rootless mode:"
echo ""
echo -e "${YELLOW}Option 1: Using the generated docker-compose file:${NC}"
echo "cd $BASE_DIR"
echo "docker-compose -f docker-compose-rootless.yml up -d"
echo ""
echo -e "${YELLOW}Option 2: Manual docker run command:${NC}"
echo "docker run -d \\"
echo "  --name stirling-pdf-rootless \\"
echo "  --user \"$UID_VAL:$GID_VAL\" \\"
echo "  -p 8080:8080 \\"
echo "  -v $BASE_DIR/data:/usr/share/tessdata:rw \\"
echo "  -v $BASE_DIR/config:/configs:rw \\"
echo "  -v $BASE_DIR/logs:/logs:rw \\"
echo "  -v $BASE_DIR/customFiles:/customFiles:rw \\"
echo "  -v $BASE_DIR/pipeline:/pipeline:rw \\"
echo "  docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest-fat"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC} For rootless mode, always use the ${YELLOW}:latest-fat${NC} image tag"
echo "which includes all dependencies pre-installed."