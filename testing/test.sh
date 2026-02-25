#!/bin/bash

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --rerun-failed              Rerun only the tests that failed in the last run"
    echo "  --rerun \"test1,test2,...\"   Rerun specific tests (comma-separated)"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run all tests"
    echo "  $0 --rerun-failed                     # Rerun tests that failed previously"
    echo "  $0 --rerun \"Stirling-PDF-Regression Stirling-PDF-Security-Fat-with-login,Webpage-Accessibility-full\""
    exit 0
}

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

# Function to check application readiness via HTTP instead of Docker's health status
check_health() {
    local container_name=$1          # real container name
    local compose_file=$2
    local timeout=80                 # total timeout in seconds
    local interval=3                 # poll interval in seconds
    local end=$((SECONDS + timeout))
    local last_code="000"

    # Check if container has API key configured
    local api_key=$(docker inspect "$container_name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep "SECURITY_CUSTOMGLOBALAPIKEY=" | cut -d'=' -f2)
    if [ -n "$api_key" ]; then
        echo "Using API key for health check: ${api_key:0:3}***"
    fi

    echo "Waiting for $container_name to become reachable on http://localhost:8080/api/v1/info/status (timeout ${timeout}s)..."
    while [ $SECONDS -lt $end ]; do
        # Optional: check if container is running at all (nice for debugging)
        if ! docker ps --format '{{.Names}}' | grep -Fxq "$container_name"; then
            echo "  Container $container_name not running yet (still waiting)..."
        fi

        # Try API status endpoint with optional API key
        if [ -n "$api_key" ]; then
            last_code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-API-KEY: $api_key" "http://localhost:8080/api/v1/info/status") || last_code="000"
        else
            last_code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080/api/v1/info/status") || last_code="000"
        fi

        # Treat any 2xx as "ready"
        if [ "$last_code" -ge 200 ] && [ "$last_code" -lt 300 ]; then
            echo "$container_name is reachable over HTTP (status $last_code)."
            echo "Printing logs for $container_name:"
            docker logs "$container_name" || true
            return 0
        fi

        echo "  Still waiting for HTTP readiness, current status: $last_code"
        sleep "$interval"
    done

    echo "$container_name did not become HTTP-ready within ${timeout}s (last HTTP status: $last_code)."

    # For extra debugging: show Docker health status, but DO NOT depend on it
    local docker_health
    docker_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}(no healthcheck){{end}}' "$container_name" 2>/dev/null || echo "inspect failed")
    echo "Docker-reported health status for $container_name: $docker_health"

    echo "Printing logs for $container_name:"
    docker logs "$container_name" || true
    return 1
}

# Function to capture file list from a Docker container
capture_file_list() {
    local container_name=$1
    local output_file=$2

    echo "Capturing file list from $container_name..."
    # Get all files in one command, output directly from Docker to avoid path issues
    # Skip proc, sys, dev, and the specified LibreOffice config directory
    # Also skip PDFBox, LibreOffice, and Jetty temporary files
    docker exec "$container_name" sh -c "find / -type f \
        -not -path '*/proc/*' \
        -not -path '*/sys/*' \
        -not -path '*/dev/*' \
        -not -path '/config/*' \
        -not -path '/configs/*' \
        -not -path '/logs/*' \
        -not -path '*/home/stirlingpdfuser/.config/libreoffice/*' \
        -not -path '*/home/stirlingpdfuser/.pdfbox.cache' \
        -not -path '*/tmp/stirling-pdf/PDFBox*' \
        -not -path '*/tmp/stirling-pdf/hsperfdata_stirlingpdfuser/*' \
        -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
        -not -path '*/tmp/hsperfdata_root/*' \
        -not -path '*/tmp/stirling-pdf/jetty-*/*' \
        -not -path '*/tmp/stirling-pdf/lu*' \
        -not -path '*/tmp/stirling-pdf/tmp*' \
        -not -path '/app/stirling.aot' \
        -not -path '*/tmp/stirling.aotconf' \
        -not -path '*/tmp/aot-*.log' \
        2>/dev/null | xargs -I{} sh -c 'stat -c \"%n %s %Y\" \"{}\" 2>/dev/null || true' | sort" > "$output_file"

    # Check if the output file has content
    if [ ! -s "$output_file" ]; then
        echo "WARNING: Failed to capture file list or container returned empty list"
        echo "Trying alternative approach..."

        # Alternative simpler approach - just get paths as a fallback
        docker exec "$container_name" sh -c "find / -type f \
            -not -path '*/proc/*' \
            -not -path '*/sys/*' \
            -not -path '*/dev/*' \
            -not -path '/config/*' \
        -not -path '/configs/*' \
            -not -path '/logs/*' \
            -not -path '*/home/stirlingpdfuser/.config/libreoffice/*' \
            -not -path '*/home/stirlingpdfuser/.pdfbox.cache' \
            -not -path '*/tmp/PDFBox*' \
            -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
            -not -path '*/tmp/hsperfdata_root/*' \
            -not -path '*/tmp/stirling-pdf/hsperfdata_stirlingpdfuser/*' \
            -not -path '*/tmp/stirling-pdf/jetty-*/*' \
            -not -path '*/tmp/lu*' \
            -not -path '*/tmp/tmp*' \
            -not -path '/app/stirling.aot' \
            -not -path '*/tmp/stirling.aotconf' \
            -not -path '*/tmp/aot-*.log' \
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
        if [ ! -s "$before_file" ]; then echo "Before file is empty: $before_file"; fi
        if [ ! -s "$after_file" ]; then echo "After file is empty: $after_file"; fi

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

# Get the expected version from Gradle once
get_expected_version() {
    ./gradlew printVersion --quiet | tail -1
}

# Function to verify the application version
verify_app_version() {
    local service_name=$1
    local base_url=$2

    echo "Checking version for $service_name (expecting $EXPECTED_VERSION)..."

    # Use the API endpoint to get version information
    local response
    response=$(curl -s "${base_url}/api/v1/info/status")

    # Extract version from JSON response using grep and sed
    local actual_version
    actual_version=$(echo "$response" | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"\(.*\)"/\1/')

    # Check if we got a version
    if [ -z "$actual_version" ]; then
        echo "❌ Version verification failed: Could not find version in API response"
        echo "API response: $response"
        return 1
    fi

    # Check if the extracted version matches expected version
    if [ "$actual_version" = "$EXPECTED_VERSION" ]; then
        echo "✅ Version verification passed: $actual_version"
        return 0
    elif [ "$actual_version" = "0.0.0" ]; then
        echo "❌ Version verification failed: Found placeholder version 0.0.0"
        return 1
    else
        echo "❌ Version verification failed: Found $actual_version, expected $EXPECTED_VERSION"
        return 1
    fi
}

# Function to test a Docker Compose configuration
test_compose() {
    local compose_file=$1
    local test_name=$2
    local status=0

    echo "Testing ${compose_file} configuration..."

    # Start up the Docker Compose service
    docker-compose -f "$compose_file" up -d

    # Wait a moment for containers to appear
    sleep 3

    local container_name
    container_name=$(docker-compose -f "$compose_file" ps --format '{{.Names}}' --filter "status=running" | head -n1)

    if [[ -z "$container_name" ]]; then
        echo "ERROR: No running container found for ${compose_file}"
        docker-compose -f "$compose_file" ps
        return 1
    fi

    echo "Started container: $container_name"

    # Wait for the service to become healthy (HTTP-based)
    if check_health "$container_name" "$compose_file"; then
        echo "${test_name} test passed."
    else
        echo "${test_name} test failed."
        status=1
    fi

    return $status
}

# Keep track of which tests passed and failed
declare -a passed_tests
declare -a failed_tests

# File to store failed tests
FAILED_TESTS_FILE="$PROJECT_ROOT/testing/.failed_tests"

# Function to save failed tests to file
# Note: This OVERWRITES (not appends) the file each run, so the list resets every time
save_failed_tests() {
    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo "Saving failed tests to $FAILED_TESTS_FILE"
        printf "%s\n" "${failed_tests[@]}" > "$FAILED_TESTS_FILE"
        echo "Failed tests saved. To rerun them: $0 --rerun-failed"
    else
        # Remove the file if all tests passed
        rm -f "$FAILED_TESTS_FILE"
        echo "All tests passed - cleared failed tests file"
    fi
}

# Function to load failed tests from file
load_failed_tests() {
    if [ -f "$FAILED_TESTS_FILE" ]; then
        echo "Loading failed tests from previous run..."
        mapfile -t RERUN_TESTS < "$FAILED_TESTS_FILE"
        echo "Found ${#RERUN_TESTS[@]} failed test(s) to rerun:"
        for test in "${RERUN_TESTS[@]}"; do
            echo "  - $test"
        done
        return 0
    else
        echo "No failed tests file found at $FAILED_TESTS_FILE"
        echo "Run tests normally first, then use --rerun-failed"
        exit 1
    fi
}

# Function to check if a test should be run
should_run_test() {
    local test_name=$1
    if [ ${#RERUN_TESTS[@]} -eq 0 ]; then
        # No filter - run all tests
        return 0
    fi

    # Check if this test is in the rerun list
    for rerun_test in "${RERUN_TESTS[@]}"; do
        if [[ "$test_name" == "$rerun_test" ]]; then
            return 0
        fi
    done
    return 1
}

run_tests() {
    local test_name=$1
    local compose_file=$2

    if ! should_run_test "$test_name"; then
        echo "Skipping $test_name (not in rerun list)"
        return 0
    fi

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

    # Parse command line arguments
    RERUN_MODE=false
    declare -a RERUN_TESTS

    while [[ $# -gt 0 ]]; do
        case $1 in
            --rerun-failed)
                RERUN_MODE=true
                load_failed_tests
                shift
                ;;
            --rerun)
                RERUN_MODE=true
                if [[ -z "$2" ]]; then
                    echo "Error: --rerun requires a comma-separated list of test names"
                    usage
                fi
                # Split comma-separated list into array
                IFS=',' read -ra RERUN_TESTS <<< "$2"
                echo "Rerunning ${#RERUN_TESTS[@]} specified test(s):"
                for test in "${RERUN_TESTS[@]}"; do
                    echo "  - $test"
                done
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                echo "Unknown option: $1"
                usage
                ;;
        esac
    done

    export DOCKER_CLI_EXPERIMENTAL=enabled
    export COMPOSE_DOCKER_CLI_BUILD=0

    # ==================================================================
    # 1. Ultra-Lite (no additional features)
    # ==================================================================
    # Check if any ultra-lite tests need to run before building
    if should_run_test "Stirling-PDF-Ultra-Lite" || \
       should_run_test "Webpage-Accessibility-lite" || \
       should_run_test "Stirling-PDF-Ultra-Lite-Version-Check"; then

        export DISABLE_ADDITIONAL_FEATURES=true
        if ! ./gradlew clean build; then
            echo "Gradle build failed with security disabled, exiting script."
            exit 1
        fi

        # Get expected version after the build to ensure version.properties is created
        echo "Getting expected version from Gradle..."
        EXPECTED_VERSION=$(get_expected_version)
        echo "Expected version: $EXPECTED_VERSION"

        # Build Ultra-Lite image with embedded frontend (GHCR tag, matching docker-compose-latest-ultra-lite.yml)
        echo "Building ultra-lite image for tests that require it..."
        if [ -n "${GITHUB_ACTIONS}" ]; then
            DOCKER_CACHE_ARGS_ULTRA_LITE="--cache-from type=gha,scope=stirling-pdf-ultra-lite --cache-to type=gha,mode=max,scope=stirling-pdf-ultra-lite"
        else
            DOCKER_CACHE_ARGS_ULTRA_LITE=""
        fi
        docker buildx build --build-arg VERSION_TAG=alpha \
            -t stirling-pdf:ultra-lite-test-sh \
            -f ./docker/embedded/Dockerfile.ultra-lite \
            --load \
            ${DOCKER_CACHE_ARGS_ULTRA_LITE} .
    else
        echo "Skipping ultra-lite image build - no ultra-lite tests in rerun list"
    fi

    # Test Ultra-Lite configuration
    run_tests "Stirling-PDF-Ultra-Lite" "./docker/embedded/compose/docker-compose-latest-ultra-lite.yml"

    if should_run_test "Webpage-Accessibility-lite"; then
        echo "Testing webpage accessibility..."
        cd "testing"
        if ./test_webpages.sh -f webpage_urls.txt -b http://localhost:8080; then
            passed_tests+=("Webpage-Accessibility-lite")
        else
            failed_tests+=("Webpage-Accessibility-lite")
            echo "Webpage accessibility lite tests failed"
        fi
        cd "$PROJECT_ROOT"
    fi

    if should_run_test "Stirling-PDF-Ultra-Lite-Version-Check"; then
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Ultra-Lite" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Ultra-Lite-Version-Check")
            echo "Version verification passed for Stirling-PDF-Ultra-Lite"
        else
            failed_tests+=("Stirling-PDF-Ultra-Lite-Version-Check")
            echo "Version verification failed for Stirling-PDF-Ultra-Lite"
        fi
    fi

    docker-compose -f "./docker/embedded/compose/docker-compose-latest-ultra-lite.yml" down -v

    # ==================================================================
    # 2. Full Fat + Security
    # ==================================================================
    # Check if any fat image tests need to run before building
    if should_run_test "Stirling-PDF-Security-Fat" || \
       should_run_test "Webpage-Accessibility-full" || \
       should_run_test "Stirling-PDF-Security-Fat-Version-Check" || \
       should_run_test "Stirling-PDF-Security-Fat-with-login" || \
       should_run_test "Stirling-PDF-Regression Stirling-PDF-Security-Fat-with-login" || \
       should_run_test "Stirling-PDF-Fat-Disable-Endpoints" || \
       should_run_test "Disabled-Endpoints" || \
       should_run_test "Stirling-PDF-Fat-Disable-Endpoints-Version-Check"; then

        export DISABLE_ADDITIONAL_FEATURES=false
        if ! ./gradlew clean build; then
            echo "Gradle build failed with security enabled, exiting script."
            exit 1
        fi

        echo "Getting expected version from Gradle (security enabled)..."
        EXPECTED_VERSION=$(get_expected_version)
        echo "Expected version with security enabled: $EXPECTED_VERSION"

        # Build Fat (Security) image with embedded frontend for GHCR tag used in all 'fat' compose files
        echo "Building fat image for tests that require it..."
        if [ -n "${GITHUB_ACTIONS}" ]; then
            DOCKER_CACHE_ARGS_FAT="--cache-from type=gha,scope=stirling-pdf-fat --cache-to type=gha,mode=max,scope=stirling-pdf-fat"
        else
            DOCKER_CACHE_ARGS_FAT=""
        fi
        docker buildx build --build-arg VERSION_TAG=alpha \
            -t stirling-pdf:fat-test-sh \
            -f ./docker/embedded/Dockerfile.fat \
            --load \
            ${DOCKER_CACHE_ARGS_FAT} .
    else
        echo "Skipping fat image build - no fat tests in rerun list"
    fi

    # Test fat + security compose
    run_tests "Stirling-PDF-Security-Fat" "./docker/embedded/compose/docker-compose-latest-fat-security.yml"

    if should_run_test "Webpage-Accessibility-full"; then
        echo "Testing webpage accessibility..."
        cd "testing"
        if ./test_webpages.sh -f webpage_urls_full.txt -b http://localhost:8080; then
            passed_tests+=("Webpage-Accessibility-full")
        else
            failed_tests+=("Webpage-Accessibility-full")
            echo "Webpage accessibility full tests failed"
        fi
        cd "$PROJECT_ROOT"
    fi

    if should_run_test "Stirling-PDF-Security-Fat-Version-Check"; then
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Security-Fat" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Security-Fat-Version-Check")
            echo "Version verification passed for Stirling-PDF-Security-Fat"
        else
            failed_tests+=("Stirling-PDF-Security-Fat-Version-Check")
            echo "Version verification failed for Stirling-PDF-Security-Fat"
        fi
    fi

    docker-compose -f "./docker/embedded/compose/docker-compose-latest-fat-security.yml" down -v

    # ==================================================================
    # 3. Regression test with login (test_cicd.yml)
    # ==================================================================
    run_tests "Stirling-PDF-Security-Fat-with-login" "./docker/embedded/compose/test_cicd.yml"

    # Only run behave tests if the container started successfully
    if [[ " ${passed_tests[*]} " =~ "Stirling-PDF-Security-Fat-with-login" ]]; then

        CONTAINER_NAME=$(docker-compose -f "./docker/embedded/compose/test_cicd.yml" ps --format '{{.Names}}' --filter "status=running" | head -n1)

        SNAPSHOT_DIR="$PROJECT_ROOT/testing/file_snapshots"
        mkdir -p "$SNAPSHOT_DIR"

        BEFORE_FILE="$SNAPSHOT_DIR/files_before_behave.txt"
        AFTER_FILE="$SNAPSHOT_DIR/files_after_behave.txt"
        DIFF_FILE="$SNAPSHOT_DIR/files_diff.txt"

        capture_file_list "$CONTAINER_NAME" "$BEFORE_FILE"

        CUCUMBER_REPORT="$PROJECT_ROOT/testing/cucumber/report.html"
        CUCUMBER_JUNIT_DIR="$PROJECT_ROOT/testing/cucumber/junit"
        mkdir -p "$CUCUMBER_JUNIT_DIR"
        cd "testing/cucumber"
        if python -m behave \
            -f behave_html_formatter:HTMLFormatter -o "$CUCUMBER_REPORT" \
            -f pretty \
            --junit --junit-directory "$CUCUMBER_JUNIT_DIR"; then
            echo "Waiting 5 seconds for any file operations to complete..."
            sleep 5

            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"

            if compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"; then
                echo "No unexpected temporary files found."
                passed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")
            else
                echo "WARNING: Unexpected temporary files detected after behave tests!"
                failed_tests+=("Stirling-PDF-Regression-Temp-Files")
            fi
            passed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")
        else
            failed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")
            echo "Printing docker logs of failed regression"
            docker logs "$CONTAINER_NAME"
            echo "Printed docker logs of failed regression"

            echo "Waiting 10 seconds before capturing file list..."
            sleep 10

            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"
            compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"
        fi
    fi
    docker-compose -f "./docker/embedded/compose/test_cicd.yml" down -v

    # ==================================================================
    # 4. Disabled Endpoints Test
    # ==================================================================
    run_tests "Stirling-PDF-Fat-Disable-Endpoints" "./docker/embedded/compose/docker-compose-latest-fat-endpoints-disabled.yml"

    if should_run_test "Disabled-Endpoints"; then
        echo "Testing disabled endpoints..."
        if ./testing/test_disabledEndpoints.sh -f ./testing/endpoints.txt -b http://localhost:8080; then
            passed_tests+=("Disabled-Endpoints")
        else
            failed_tests+=("Disabled-Endpoints")
            echo "Disabled Endpoints tests failed"
        fi
    fi

    if should_run_test "Stirling-PDF-Fat-Disable-Endpoints-Version-Check"; then
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Fat-Disable-Endpoints" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Fat-Disable-Endpoints-Version-Check")
            echo "Version verification passed for Stirling-PDF-Fat-Disable-Endpoints"
        else
            failed_tests+=("Stirling-PDF-Fat-Disable-Endpoints-Version-Check")
            echo "Version verification failed for Stirling-PDF-Fat-Disable-Endpoints"
        fi
    fi

    docker-compose -f "./docker/embedded/compose/docker-compose-latest-fat-endpoints-disabled.yml" down -v

    # ==================================================================
    # Final Report
    # ==================================================================
    echo "All tests completed in $SECONDS seconds."

    if [ ${#passed_tests[@]} -ne 0 ]; then
        echo "Passed tests:"
        for test in "${passed_tests[@]}"; do
            echo -e "\e[32m$test\e[0m"
        done
    fi

    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo "Failed tests:"
        for test in "${failed_tests[@]}"; do
            echo -e "\e[31m$test\e[0m"
        done
    fi

    # Save failed tests for potential rerun
    save_failed_tests

    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo "Some tests failed."
        echo "To rerun only failed tests, use: $0 --rerun-failed"
        exit 1
    else
        echo "All tests passed successfully."
        exit 0
    fi
}

main "$@"
