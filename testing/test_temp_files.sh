#!/bin/bash

# This script tests the temporary file cleanup functionality in Stirling-PDF.
# It creates various temporary files inside a Docker container and verifies
# that they are properly cleaned up.

# Find project root by locating build.gradle
find_root() {
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/build.gradle" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    echo "Error: build.gradle not found" >&2
    exit 1
}

PROJECT_ROOT=$(find_root)
CONTAINER_NAME="stirling-pdf-temp-file-test"
COMPOSE_FILE="$PROJECT_ROOT/testing/testdriver/temp_file_test.yml"
SNAPSHOT_DIR="$PROJECT_ROOT/testing/file_snapshots"
SUCCESS=true

# Create directories
mkdir -p "$SNAPSHOT_DIR"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to check the health of the service
check_health() {
    local service_name=$1
    local end=$((SECONDS+60))

    echo -n "Waiting for $service_name to become healthy..."
    until [ "$(docker inspect --format='{{json .State.Health.Status}}' "$service_name")" == '"healthy"' ] || [ $SECONDS -ge $end ]; do
        sleep 3
        echo -n "."
        if [ $SECONDS -ge $end ]; then
            echo -e "\n$service_name health check timed out after 60 seconds."
            echo "Printing logs for $service_name:"
            docker logs "$service_name"
            return 1
        fi
    done
    echo -e "\n$service_name is healthy!"
    return 0
}

# Function to capture all files in /tmp and its subdirectories
capture_temp_files() {
    local output_file=$1
    
    echo "Capturing temporary files list..."
    docker exec $CONTAINER_NAME sh -c "find /tmp -type f | sort" > "$output_file"
    
    # Count files
    local count=$(wc -l < "$output_file")
    echo "Found $count files in /tmp"
}

# Function to create test temporary files in the container
create_test_files() {
    echo "Creating test temporary files..."
    
    # Create files with various patterns in different directories
    docker exec $CONTAINER_NAME sh -c '
        # Create files in /tmp
        touch /tmp/output_123.pdf
        touch /tmp/compressedPDF456.pdf
        touch /tmp/stirling-pdf-789.tmp
        touch /tmp/pdf-save-123-456.tmp
        touch /tmp/pdf-stream-789-012.tmp
        touch /tmp/PDFBox123.tmp
        touch /tmp/input_test.pdf
        touch /tmp/overlay-test.pdf
        
        # Create system-like temp files
        touch /tmp/lu123abc.tmp
        mkdir -p /tmp/ocr_process123
        touch /tmp/tmp_upload.tmp
        touch /tmp/OSL_PIPE_1000_stirling
        touch /tmp/random.tmp
        
        # Create Jetty files (should be preserved)
        touch /tmp/jetty-123.tmp
        touch /tmp/something-with-jetty-inside.tmp
        
        # Create nested directories with temp files
        mkdir -p /tmp/stirling-pdf
        touch /tmp/stirling-pdf/nested_output.pdf
        
        mkdir -p /tmp/webp_outputXYZ
        touch /tmp/webp_outputXYZ/output_nested.pdf
        
        # Create an empty file (special case)
        touch /tmp/empty.tmp
        
        # Create normal files (should be preserved)
        touch /tmp/important.txt
        
        echo "Test files created successfully"
    '
}

# Function to trigger cleanup by modifying settings
trigger_cleanup() {
    echo "Triggering temporary file cleanup..."
    
    # Set aggressive cleanup settings and restart
    docker exec $CONTAINER_NAME sh -c '
        echo "stirling.tempfiles.max-age-hours=0.001" >> /app/application.properties
        echo "stirling.tempfiles.cleanup-interval-minutes=0.1" >> /app/application.properties
        touch /app/restart-trigger
    '
    
    # Wait for cleanup to run
    echo "Waiting for cleanup to run (30 seconds)..."
    sleep 30
}

# Function to verify cleanup results
verify_cleanup() {
    local before_file=$1
    local after_file=$2
    local status=true
    
    echo "Verifying cleanup results..."
    
    # Files that should be cleaned
    local should_be_cleaned=(
        "/tmp/output_123.pdf"
        "/tmp/compressedPDF456.pdf"
        "/tmp/stirling-pdf-789.tmp"
        "/tmp/pdf-save-123-456.tmp"
        "/tmp/pdf-stream-789-012.tmp"
        "/tmp/PDFBox123.tmp"
        "/tmp/input_test.pdf"
        "/tmp/overlay-test.pdf"
        "/tmp/lu123abc.tmp"
        "/tmp/ocr_process123"
        "/tmp/tmp_upload.tmp"
        "/tmp/OSL_PIPE_1000_stirling"
        "/tmp/random.tmp"
        "/tmp/empty.tmp"
        "/tmp/stirling-pdf/nested_output.pdf"
        "/tmp/webp_outputXYZ/output_nested.pdf"
    )
    
    # Files that should be preserved
    local should_be_preserved=(
        "/tmp/jetty-123.tmp"
        "/tmp/something-with-jetty-inside.tmp"
        "/tmp/important.txt"
    )
    
    # Check files that should be cleaned
    for file in "${should_be_cleaned[@]}"; do
        if grep -q "$file" "$after_file"; then
            echo -e "${RED}FAIL: $file was not cleaned up${NC}"
            status=false
        else
            echo -e "${GREEN}PASS: $file was properly cleaned up${NC}"
        fi
    done
    
    # Check files that should be preserved
    for file in "${should_be_preserved[@]}"; do
        if grep -q "$file" "$after_file"; then
            echo -e "${GREEN}PASS: $file was properly preserved${NC}"
        else
            echo -e "${RED}FAIL: $file was incorrectly cleaned up${NC}"
            status=false
        fi
    done
    
    return $status
}

# Main function
main() {
    echo -e "${YELLOW}Starting temporary file cleanup test...${NC}"
    
    # Create special test compose file
    cat > "$COMPOSE_FILE" << EOL
version: '3.8'
services:
  stirling-pdf:
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest-ultra-lite
    container_name: $CONTAINER_NAME
    environment:
      - DOCKER_ENABLE_SECURITY=false
      - APP_FILESYSTEM_DIRECTORY_BASE=/app/customFiles
      - STIRLING_MACHINE_TYPE=Docker
      - STIRLING_TEMPFILES_STARTUP_CLEANUP=false
      - STIRLING_TEMPFILES_CLEANUP_INTERVAL_MINUTES=5
      - JAVA_OPTS=-Xmx500m
    ports:
      - 8080:8080
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped
EOL
    
    # Start the container
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for container to be healthy
    if ! check_health "$CONTAINER_NAME"; then
        echo -e "${RED}Failed to start test container${NC}"
        docker-compose -f "$COMPOSE_FILE" down
        exit 1
    fi
    
    # Create temporary files
    create_test_files
    
    # Capture initial state
    BEFORE_FILE="$SNAPSHOT_DIR/temp_files_before.txt"
    capture_temp_files "$BEFORE_FILE"
    
    # Trigger cleanup
    trigger_cleanup
    
    # Capture final state
    AFTER_FILE="$SNAPSHOT_DIR/temp_files_after.txt"
    capture_temp_files "$AFTER_FILE"
    
    # Verify cleanup results
    if verify_cleanup "$BEFORE_FILE" "$AFTER_FILE"; then
        echo -e "${GREEN}Temporary file cleanup test PASSED${NC}"
    else
        echo -e "${RED}Temporary file cleanup test FAILED${NC}"
        SUCCESS=false
    fi
    
    # Clean up
    docker-compose -f "$COMPOSE_FILE" down
    
    if $SUCCESS; then
        exit 0
    else
        exit 1
    fi
}

main