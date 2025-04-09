#!/bin/bash

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

# Function to check the health of the service with a timeout of 80 seconds
check_health() {
    local service_name=$1
    local compose_file=$2
    local end=$((SECONDS+60))

    echo -n "Waiting for $service_name to become healthy..."
    until [ "$(docker inspect --format='{{json .State.Health.Status}}' "$service_name")" == '"healthy"' ] || [ $SECONDS -ge $end ]; do
        sleep 3
        echo -n "."
        if [ $SECONDS -ge $end ]; then
            echo -e "\n$service_name health check timed out after 80 seconds."
            echo "Printing logs for $service_name:"
            docker logs "$service_name"
            return 1
        fi
    done
    echo -e "\n$service_name is healthy!"
    echo "Printing logs for $service_name:"
    docker logs "$service_name"
    return 0
}

# Function to capture file list from a Docker container
capture_file_list() {
    local container_name=$1
    local output_file=$2
    
    echo "Capturing file list from $container_name..."
    # Get all files in one command, output directly from Docker to avoid path issues
    # Skip proc, sys, dev, and the specified LibreOffice config directory
    # Also skip PDFBox and LibreOffice temporary files
    docker exec $container_name sh -c "find / -type f \
        -not -path '*/proc/*' \
        -not -path '*/sys/*' \
        -not -path '*/dev/*' \
        -not -path '/config/*' \
        -not -path '/logs/*' \
        -not -path '*/home/stirlingpdfuser/.config/libreoffice/*' \
        -not -path '*/tmp/PDFBox*' \
        -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
        -not -path '*/tmp/lu*' \
        -not -path '*/tmp/tmp*' \
        2>/dev/null | xargs -I{} sh -c 'stat -c \"%n %s %Y\" \"{}\" 2>/dev/null || true' | sort" > "$output_file"
    
    # Check if the output file has content
    if [ ! -s "$output_file" ]; then
        echo "WARNING: Failed to capture file list or container returned empty list"
        echo "Trying alternative approach..."
        
        # Alternative simpler approach - just get paths as a fallback
        docker exec $container_name sh -c "find / -type f \
            -not -path '*/proc/*' \
            -not -path '*/sys/*' \
            -not -path '*/dev/*' \
            -not -path '/config/*' \
            -not -path '/logs/*' \
            -not -path '*/home/stirlingpdfuser/.config/libreoffice/*' \
            -not -path '*/tmp/PDFBox*' \
            -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
            -not -path '*/tmp/lu*' \
            -not -path '*/tmp/tmp*' \
            2>/dev/null | sort" > "$output_file"
        
        if [ ! -s "$output_file" ]; then
            echo "ERROR: All attempts to capture file list failed"
            # Create a dummy entry to prevent diff errors
            echo "NO_FILES_FOUND 0 0" > "$output_file"
        fi
    fi
    
    echo "File list captured to $output_file"
}

# Function to compare before and after file lists
compare_file_lists() {
    local before_file=$1
    local after_file=$2
    local diff_file=$3
    local container_name=$4  # Added container_name parameter
    
    echo "Comparing file lists..."
    
    # Check if files exist and have content
    if [ ! -s "$before_file" ] || [ ! -s "$after_file" ]; then
        echo "WARNING: One or both file lists are empty."
        
        if [ ! -s "$before_file" ]; then
            echo "Before file is empty: $before_file"
        fi
        
        if [ ! -s "$after_file" ]; then
            echo "After file is empty: $after_file"
        fi
        
        # Create empty diff file
        > "$diff_file"
        
        # Check if we at least have the after file to look for temp files
        if [ -s "$after_file" ]; then
            echo "Checking for temp files in the after snapshot..."
            grep -i "tmp\|temp" "$after_file" > "${diff_file}.tmp"
            if [ -s "${diff_file}.tmp" ]; then
                echo "WARNING: Temporary files found:"
                cat "${diff_file}.tmp"
                echo "Printing docker logs due to temporary file detection:"
                docker logs "$container_name"  # Print logs when temp files are found
                return 1
            else
                echo "No temporary files found in the after snapshot."
            fi
        fi
        
        return 0
    fi
    
    # Both files exist and have content, proceed with diff
    diff "$before_file" "$after_file" > "$diff_file"
    
    if [ -s "$diff_file" ]; then
        echo "Detected changes in files:"
        cat "$diff_file"
        
        # Extract only added files (lines starting with ">")
        grep "^>" "$diff_file" > "${diff_file}.added" || true
        if [ -s "${diff_file}.added" ]; then
            echo "New files created during test:"
            cat "${diff_file}.added" | sed 's/^> //'
            
            # Check for tmp files
            grep -i "tmp\|temp" "${diff_file}.added" > "${diff_file}.tmp" || true
            if [ -s "${diff_file}.tmp" ]; then
                echo "WARNING: Temporary files detected:"
                cat "${diff_file}.tmp"
                echo "Printing docker logs due to temporary file detection:"
                docker logs "$container_name"  # Print logs when temp files are found
                return 1
            fi
        fi
        
        # Extract only removed files (lines starting with "<")
        grep "^<" "$diff_file" > "${diff_file}.removed" || true
        if [ -s "${diff_file}.removed" ]; then
            echo "Files removed during test:"
            cat "${diff_file}.removed" | sed 's/^< //'
        fi
    else
        echo "No file changes detected during test."
    fi
    
    return 0
}

# Function to test a Docker Compose configuration
test_compose() {
    local compose_file=$1
    local service_name=$2
    local status=0

    echo "Testing $compose_file configuration..."

    # Start up the Docker Compose service
    docker-compose -f "$compose_file" up -d

    # Wait for the service to become healthy
    if check_health "$service_name" "$compose_file"; then
        echo "$service_name test passed."
    else
        echo "$service_name test failed."
        status=1
    fi

    return $status
}

# Keep track of which tests passed and failed
declare -a passed_tests
declare -a failed_tests

run_tests() {
    local test_name=$1
    local compose_file=$2

    if test_compose "$compose_file" "$test_name"; then
        passed_tests+=("$test_name")
    else
        failed_tests+=("$test_name")
    fi
}

# Main testing routine
main() {
    SECONDS=0

    cd "$PROJECT_ROOT"

	export DOCKER_CLI_EXPERIMENTAL=enabled
	export COMPOSE_DOCKER_CLI_BUILD=0
    export DOCKER_ENABLE_SECURITY=false
    # Run the gradlew build command and check if it fails
    if ! ./gradlew clean build; then
        echo "Gradle build failed with security disabled, exiting script."
        exit 1
    fi

    # Building Docker images
    # docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest -f ./Dockerfile .
    docker build --build-arg VERSION_TAG=alpha -t docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest-ultra-lite -f ./Dockerfile.ultra-lite .

    # Test each configuration
    run_tests "Stirling-PDF-Ultra-Lite" "./exampleYmlFiles/docker-compose-latest-ultra-lite.yml"

    echo "Testing webpage accessibility..."
    cd "testing"
    if ./test_webpages.sh -f webpage_urls.txt -b http://localhost:8080; then
        passed_tests+=("Webpage-Accessibility-lite")
    else
        failed_tests+=("Webpage-Accessibility-lite")
        echo "Webpage accessibility lite tests failed"
    fi
    cd "$PROJECT_ROOT"
    docker-compose -f "./exampleYmlFiles/docker-compose-latest-ultra-lite.yml" down

    # run_tests "Stirling-PDF" "./exampleYmlFiles/docker-compose-latest.yml"
    # docker-compose -f "./exampleYmlFiles/docker-compose-latest.yml" down

    export DOCKER_ENABLE_SECURITY=true
    # Run the gradlew build command and check if it fails
    if ! ./gradlew clean build; then
        echo "Gradle build failed with security enabled, exiting script."
        exit 1
    fi

    # Building Docker images with security enabled
    # docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest -f ./Dockerfile .
    # docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t stirlingtools/stirling-pdf:latest-ultra-lite -f ./Dockerfile.ultra-lite .
    docker build --no-cache --pull --build-arg VERSION_TAG=alpha -t docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest-fat -f ./Dockerfile.fat .


    # Test each configuration with security
    # run_tests "Stirling-PDF-Ultra-Lite-Security" "./exampleYmlFiles/docker-compose-latest-ultra-lite-security.yml"
    # docker-compose -f "./exampleYmlFiles/docker-compose-latest-ultra-lite-security.yml" down
    # run_tests "Stirling-PDF-Security" "./exampleYmlFiles/docker-compose-latest-security.yml"
    # docker-compose -f "./exampleYmlFiles/docker-compose-latest-security.yml" down


    run_tests "Stirling-PDF-Security-Fat" "./exampleYmlFiles/docker-compose-latest-fat-security.yml"

    echo "Testing webpage accessibility..."
    cd "testing"
    if ./test_webpages.sh -f webpage_urls_full.txt -b http://localhost:8080; then
        passed_tests+=("Webpage-Accessibility-full")
    else
        failed_tests+=("Webpage-Accessibility-full")
        echo "Webpage accessibility full tests failed"
    fi
    cd "$PROJECT_ROOT"

    docker-compose -f "./exampleYmlFiles/docker-compose-latest-fat-security.yml" down

    run_tests "Stirling-PDF-Security-Fat-with-login" "./exampleYmlFiles/test_cicd.yml"

    if [ $? -eq 0 ]; then
        # Create directory for file snapshots if it doesn't exist
        SNAPSHOT_DIR="$PROJECT_ROOT/testing/file_snapshots"
        mkdir -p "$SNAPSHOT_DIR"
        
        # Capture file list before running behave tests
        BEFORE_FILE="$SNAPSHOT_DIR/files_before_behave.txt"
        AFTER_FILE="$SNAPSHOT_DIR/files_after_behave.txt"
        DIFF_FILE="$SNAPSHOT_DIR/files_diff.txt"
        
        # Define container name variable for consistency
        CONTAINER_NAME="Stirling-PDF-Security-Fat-with-login"
        
        capture_file_list "$CONTAINER_NAME" "$BEFORE_FILE"
        
        cd "testing/cucumber"
        if python -m behave; then
            # Wait 10 seconds before capturing the file list after tests
            echo "Waiting 5 seconds for any file operations to complete..."
            sleep 5
            
            # Capture file list after running behave tests
            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"
            
            # Compare file lists
            if compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"; then
                echo "No unexpected temporary files found."
                passed_tests+=("Stirling-PDF-Regression")
            else
                echo "WARNING: Unexpected temporary files detected after behave tests!"
                failed_tests+=("Stirling-PDF-Regression-Temp-Files")
            fi
            
            passed_tests+=("Stirling-PDF-Regression")
        else
            failed_tests+=("Stirling-PDF-Regression")
            echo "Printing docker logs of failed regression"
            docker logs "$CONTAINER_NAME"
            echo "Printed docker logs of failed regression"
            
            # Still capture file list after failure for analysis
            # Wait 10 seconds before capturing the file list
            echo "Waiting 5 seconds before capturing file list..."
            sleep 10
            
            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"
            compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"
        fi
    fi

    docker-compose -f "./exampleYmlFiles/test_cicd.yml" down

    run_tests "Stirling-PDF-Fat-Disable-Endpoints" "./exampleYmlFiles/docker-compose-latest-fat-endpoints-disabled.yml"

    echo "Testing disabled endpoints..."
    if ./testing/test_disabledEndpoints.sh -f ./testing/endpoints.txt -b http://localhost:8080; then
        passed_tests+=("Disabled-Endpoints")
    else
        failed_tests+=("Disabled-Endpoints")
        echo "Disabled Endpoints tests failed"
    fi

    docker-compose -f "./exampleYmlFiles/docker-compose-latest-fat-endpoints-disabled.yml" down

    # Report results
    echo "All tests completed in $SECONDS seconds."


    if [ ${#passed_tests[@]} -ne 0 ]; then
        echo "Passed tests:"
    fi
    for test in "${passed_tests[@]}"; do
        echo -e "\e[32m$test\e[0m"  # Green color for passed tests
    done

    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo "Failed tests:"
    fi
    for test in "${failed_tests[@]}"; do
        echo -e "\e[31m$test\e[0m"  # Red color for failed tests
    done

    # Check if there are any failed tests and exit with an error code if so
    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo "Some tests failed."
        exit 1
    else
        echo "All tests passed successfully."
        exit 0
    fi
}

main