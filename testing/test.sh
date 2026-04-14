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

REPORT_DIR="$PROJECT_ROOT/testing/reports"
mkdir -p "$REPORT_DIR"

declare -A test_start_times
declare -A test_durations
declare -A test_failure_logs
CURRENT_CONTAINER=""

is_gha() {
    [ -n "${GITHUB_ACTIONS:-}" ]
}

gha_group() {
    if is_gha; then echo "::group::$1"; else echo "=== $1 ==="; fi
}
gha_endgroup() {
    if is_gha; then echo "::endgroup::"; fi
}

start_test_timer() {
    local test_name=$1
    test_start_times["$test_name"]=$SECONDS
}

stop_test_timer() {
    local test_name=$1
    local start=${test_start_times["$test_name"]:-$SECONDS}
    test_durations["$test_name"]=$(( SECONDS - start ))
}

capture_failure_logs() {
    local test_name=$1
    local container_name=$2
    local extra_context=$3
    local log_file="$REPORT_DIR/${test_name//[^a-zA-Z0-9_-]/_}.failure.log"

    {
        echo "=== Failure logs for: $test_name ==="
        echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        if [ -n "$container_name" ]; then
            echo "Container: $container_name"
            echo "---"
            docker logs "$container_name" 2>&1 | tail -200
        elif [ -n "$extra_context" ]; then
            echo "---"
            echo "$extra_context"
        else
            echo "---"
            echo "No container was running. Docker-compose may have failed to start."
        fi
    } > "$log_file" 2>/dev/null || true
    test_failure_logs["$test_name"]="$log_file"
}

capture_build_failure() {
    local build_name=$1
    local log_file="$REPORT_DIR/${build_name//[^a-zA-Z0-9_-]/_}.failure.log"
    local build_log="$REPORT_DIR/${build_name//[^a-zA-Z0-9_-]/_}.build.log"
    local gradle_report_dirs=(
        "$PROJECT_ROOT/app/core/build/reports/tests"
        "$PROJECT_ROOT/app/common/build/reports/tests"
        "$PROJECT_ROOT/app/proprietary/build/reports/tests"
    )

    {
        echo "=== Build failure: $build_name ==="
        echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "---"

        # Include Docker/command build output if captured
        if [ -f "$build_log" ]; then
            echo "--- Build output (last 100 lines) ---"
            tail -100 "$build_log"
            echo ""
        fi

        for report_dir in "${gradle_report_dirs[@]}"; do
            if [ -d "$report_dir" ]; then
                local txt_index="$report_dir/test/index.html"
                if [ -f "$txt_index" ]; then
                    echo "--- Gradle test report: $report_dir ---"
                    sed 's/<[^>]*>//g' "$txt_index" | head -100
                    echo ""
                fi
            fi
        done

        for xml_file in "$PROJECT_ROOT"/app/*/build/test-results/test/TEST-*.xml; do
            if [ -f "$xml_file" ]; then
                local failures
                failures=$(grep -c 'failures="[^0]' "$xml_file" 2>/dev/null || true)
                local errors
                errors=$(grep -c 'errors="[^0]' "$xml_file" 2>/dev/null || true)
                if [ "$failures" -gt 0 ] || [ "$errors" -gt 0 ]; then
                    echo "--- Failed: $(basename "$xml_file") ---"
                    grep -A 5 '<failure\|<error' "$xml_file" | head -50
                    echo ""
                fi
            fi
        done
    } > "$log_file" 2>/dev/null || true

    test_failure_logs["$build_name"]="$log_file"
}


generate_json_report() {
    local report_file="$REPORT_DIR/test-report.json"
    local total_duration=$SECONDS
    local total_tests=$(( ${#passed_tests[@]} + ${#failed_tests[@]} ))

    {
        echo "{"
        echo "  \"summary\": {"
        echo "    \"total\": $total_tests,"
        echo "    \"passed\": ${#passed_tests[@]},"
        echo "    \"failed\": ${#failed_tests[@]},"
        echo "    \"duration_seconds\": $total_duration,"
        echo "    \"result\": \"$([ ${#failed_tests[@]} -eq 0 ] && echo 'PASS' || echo 'FAIL')\","
        echo "    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
        echo "  },"
        echo "  \"tests\": ["

        local first=true
        for test in "${passed_tests[@]}"; do
            if [ "$first" = true ]; then first=false; else echo ","; fi
            local dur=${test_durations["$test"]:-0}
            printf "    {\"name\": \"%s\", \"status\": \"PASS\", \"duration_seconds\": %d}" "$test" "$dur"
        done

        for test in "${failed_tests[@]}"; do
            if [ "$first" = true ]; then first=false; else echo ","; fi
            local dur=${test_durations["$test"]:-0}
            local log_file=${test_failure_logs["$test"]:-""}
            local failure_snippet=""
            if [ -n "$log_file" ] && [ -f "$log_file" ]; then
                # Grab last 20 lines as a failure snippet, escape for JSON
                failure_snippet=$(tail -20 "$log_file" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' '|' | sed 's/|/\\n/g')
            fi
            printf "    {\"name\": \"%s\", \"status\": \"FAIL\", \"duration_seconds\": %d, \"log_file\": \"%s\", \"failure_snippet\": \"%s\"}" \
                "$test" "$dur" "$log_file" "$failure_snippet"
        done

        echo ""
        echo "  ]"
        echo "}"
    } > "$report_file"

    echo "JSON test report written to: $report_file"
}

generate_gha_summary() {
    if ! is_gha; then return; fi
    local summary_file="${GITHUB_STEP_SUMMARY}"
    local total_duration=$SECONDS

    {
        echo "## Docker Compose Test Results"
        echo ""
        if [ ${#failed_tests[@]} -eq 0 ]; then
            echo "**Result: ALL PASSED** in ${total_duration}s"
        else
            echo "**Result: ${#failed_tests[@]} FAILED** out of $(( ${#passed_tests[@]} + ${#failed_tests[@]} )) tests in ${total_duration}s"
        fi
        echo ""
        echo "| Test | Status | Duration |"
        echo "|------|--------|----------|"

        for test in "${passed_tests[@]}"; do
            local dur=${test_durations["$test"]:-0}
            echo "| ${test} | :white_check_mark: PASS | ${dur}s |"
        done

        for test in "${failed_tests[@]}"; do
            local dur=${test_durations["$test"]:-0}
            echo "| ${test} | :x: FAIL | ${dur}s |"
        done

        # If there are failures, include snippets
        if [ ${#failed_tests[@]} -ne 0 ]; then
            echo ""
            echo "### Failure Details"
            echo ""
            for test in "${failed_tests[@]}"; do
                local log_file=${test_failure_logs["$test"]:-""}
                echo "<details>"
                echo "<summary>${test}</summary>"
                echo ""
                if [ -n "$log_file" ] && [ -f "$log_file" ]; then
                    echo '```'
                    tail -50 "$log_file"
                    echo '```'
                else
                    echo "No failure logs captured. Check the full build log."
                fi
                echo "</details>"
                echo ""
            done
        fi
    } >> "$summary_file"

    echo "GitHub Actions job summary written."
}

prepare_base_image() {
    if [ "${DOCKER_BASE_CHANGED:-false}" = "true" ]; then
        echo "Docker base files changed — building base image locally..."
        gha_group "Build: Base image (local)"
        if docker build -f "$PROJECT_ROOT/docker/base/Dockerfile" \
            -t stirling-pdf-base:local \
            "$PROJECT_ROOT/docker/base"; then
            echo "✓ Built base image locally: stirling-pdf-base:local"
            BASE_IMAGE_ARG="--build-arg BASE_IMAGE=stirling-pdf-base:local"
        else
            echo "ERROR: Failed to build base image"
            gha_endgroup
            return 1
        fi
        gha_endgroup
    else
        echo "Docker base unchanged — using published base image from Dockerfile defaults"
        BASE_IMAGE_ARG=""
    fi
}

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

    gha_group "Health check: $container_name"
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
            gha_group "Container logs (startup): $container_name"
            docker logs "$container_name" || true
            gha_endgroup
            gha_endgroup
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

    gha_group "Container logs (failure): $container_name"
    docker logs "$container_name" || true
    gha_endgroup
    gha_endgroup
    return 1
}

# Function to capture file list from a Docker container
capture_file_list() {
    local container_name=$1
    local output_file=$2

    gha_group "Capture file list: $container_name"
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
        -not -path '*/home/stirlingpdfuser/.config/calibre/*' \
        -not -path '*/home/stirlingpdfuser/.java/fonts/*' \
        -not -path '*/home/stirlingpdfuser/.pdfbox.cache' \
        -not -path '*/tmp/stirling-pdf/PDFBox*' \
        -not -path '*/tmp/stirling-pdf/hsperfdata_stirlingpdfuser/*' \
        -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
        -not -path '*/tmp/hsperfdata_root/*' \
        -not -path '*/tmp/stirling-pdf/jetty-*/*' \
        -not -path '*/tmp/stirling-pdf/lu*' \
        -not -path '*/tmp/stirling-pdf/tmp*' \
        -not -path '/tmp/lu*' \
        -not -path '*/tmp/*/user/registrymodifications.xcu' \
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
            -not -path '*/home/stirlingpdfuser/.config/calibre/*' \
            -not -path '*/home/stirlingpdfuser/.java/fonts/*' \
            -not -path '*/home/stirlingpdfuser/.pdfbox.cache' \
            -not -path '*/tmp/PDFBox*' \
            -not -path '*/tmp/hsperfdata_stirlingpdfuser/*' \
            -not -path '*/tmp/hsperfdata_root/*' \
            -not -path '*/tmp/stirling-pdf/hsperfdata_stirlingpdfuser/*' \
            -not -path '*/tmp/stirling-pdf/jetty-*/*' \
            -not -path '*/tmp/stirling-pdf/lu*' \
            -not -path '*/tmp/stirling-pdf/tmp*' \
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
    gha_endgroup
}

# Function to compare before and after file lists
compare_file_lists() {
    local before_file=$1
    local after_file=$2
    local diff_file=$3
    local container_name=$4  # Added container_name parameter

    gha_group "Compare file lists"
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
                gha_endgroup
                return 1
            else
                echo "No temporary files found in the after snapshot."
            fi
        fi
        gha_endgroup
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
    gha_endgroup
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

    gha_group "Deploy: $test_name"
    echo "Testing ${compose_file} configuration..."

    # Start up the Docker Compose service
    docker-compose -f "$compose_file" up -d

    # Wait a moment for containers to appear
    sleep 3

    local container_name
    container_name=$(docker-compose -f "$compose_file" ps --format '{{.Names}}' --filter "status=running" | head -n1)

    if [[ -z "$container_name" ]]; then
        echo "ERROR: No running container found for ${compose_file}"
        local compose_output
        compose_output=$(docker-compose -f "$compose_file" ps 2>&1)
        echo "$compose_output"
        capture_failure_logs "$test_name" "" "docker-compose failed for: ${compose_file}
${compose_output}"
        gha_endgroup
        return 1
    fi

    CURRENT_CONTAINER="$container_name"
    echo "Started container: $container_name"

    # Wait for the service to become healthy (HTTP-based)
    if check_health "$container_name" "$compose_file"; then
        echo "${test_name} test passed."
    else
        echo "${test_name} test failed."
        capture_failure_logs "$test_name" "$container_name"
        status=1
    fi

    gha_endgroup
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

    start_test_timer "$test_name"
    if test_compose "$compose_file" "$test_name"; then
        passed_tests+=("$test_name")
    else
        failed_tests+=("$test_name")
    fi
    stop_test_timer "$test_name"
}

finalize_reports() {
    generate_json_report
    generate_gha_summary
    save_failed_tests
}

# Main testing routine
main() {
    SECONDS=0
    cd "$PROJECT_ROOT"

    trap finalize_reports EXIT

    echo "=========================================="
    echo "Preparing Docker base image..."
    echo "=========================================="
    prepare_base_image || exit 1
    echo ""

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

        gha_group "Build: Ultra-Lite (Gradle + Docker)"
        export DISABLE_ADDITIONAL_FEATURES=true
        if ! ./gradlew clean build -PnoSpotless; then
            echo "Gradle build failed with security disabled, exiting script."
            failed_tests+=("Build-Ultra-Lite-Gradle")
            capture_build_failure "Build-Ultra-Lite-Gradle"
            gha_endgroup
            exit 1
        fi

        # Get expected version after the build to ensure version.properties is created
        echo "Getting expected version from Gradle..."
        EXPECTED_VERSION=$(get_expected_version)
        echo "Expected version: $EXPECTED_VERSION"

        # Build Ultra-Lite image with embedded frontend (matching docker-compose-latest-ultra-lite.yml)
        echo "Building ultra-lite image for tests that require it..."
        if [ -n "${ACTIONS_RUNTIME_TOKEN}" ] && { [ -n "${ACTIONS_RESULTS_URL}" ] || [ -n "${ACTIONS_CACHE_URL}" ]; }; then
            DOCKER_CACHE_ARGS_ULTRA_LITE="--cache-from type=gha,scope=stirling-pdf-ultra-lite --cache-to type=gha,mode=max,scope=stirling-pdf-ultra-lite"
        else
            DOCKER_CACHE_ARGS_ULTRA_LITE=""
        fi
        local ultra_lite_build_log="$REPORT_DIR/Build-Ultra-Lite-Docker.build.log"
        if ! docker buildx build --build-arg VERSION_TAG=alpha \
            -t docker.stirlingpdf.com/stirlingtools/stirling-pdf:ultra-lite \
            -f ./docker/embedded/Dockerfile.ultra-lite \
            --load \
            ${DOCKER_CACHE_ARGS_ULTRA_LITE} . 2>&1 | tee "$ultra_lite_build_log"; then
            failed_tests+=("Build-Ultra-Lite-Docker")
            capture_build_failure "Build-Ultra-Lite-Docker"
            gha_endgroup
            exit 1
        fi
        gha_endgroup
    else
        echo "Skipping ultra-lite image build - no ultra-lite tests in rerun list"
    fi

    # Test Ultra-Lite configuration
    run_tests "Stirling-PDF-Ultra-Lite" "./docker/embedded/compose/docker-compose-latest-ultra-lite.yml"

    if should_run_test "Webpage-Accessibility-lite"; then
        start_test_timer "Webpage-Accessibility-lite"
        gha_group "Test: Webpage-Accessibility-lite"
        echo "Testing webpage accessibility..."
        cd "testing"
        if ./test_webpages.sh -f webpage_urls.txt -b http://localhost:8080; then
            passed_tests+=("Webpage-Accessibility-lite")
        else
            failed_tests+=("Webpage-Accessibility-lite")
            capture_failure_logs "Webpage-Accessibility-lite" "$CURRENT_CONTAINER"
            echo "Webpage accessibility lite tests failed"
        fi
        cd "$PROJECT_ROOT"
        gha_endgroup
        stop_test_timer "Webpage-Accessibility-lite"
    fi

    if should_run_test "Stirling-PDF-Ultra-Lite-Version-Check"; then
        start_test_timer "Stirling-PDF-Ultra-Lite-Version-Check"
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Ultra-Lite" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Ultra-Lite-Version-Check")
            echo "Version verification passed for Stirling-PDF-Ultra-Lite"
        else
            failed_tests+=("Stirling-PDF-Ultra-Lite-Version-Check")
            capture_failure_logs "Stirling-PDF-Ultra-Lite-Version-Check" "$CURRENT_CONTAINER"
            echo "Version verification failed for Stirling-PDF-Ultra-Lite"
        fi
        stop_test_timer "Stirling-PDF-Ultra-Lite-Version-Check"
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

        gha_group "Build: Fat + Security (Gradle + Docker)"
        export DISABLE_ADDITIONAL_FEATURES=false
        if ! ./gradlew clean build -PnoSpotless; then
            echo "Gradle build failed with security enabled, exiting script."
            failed_tests+=("Build-Fat-Gradle")
            capture_build_failure "Build-Fat-Gradle"
            gha_endgroup
            exit 1
        fi

        echo "Getting expected version from Gradle (security enabled)..."
        EXPECTED_VERSION=$(get_expected_version)
        echo "Expected version with security enabled: $EXPECTED_VERSION"

        # Build Fat (Security) image with embedded frontend (matching all 'fat' compose files)
        echo "Building fat image for tests that require it..."
        if [ -n "${ACTIONS_RUNTIME_TOKEN}" ] && { [ -n "${ACTIONS_RESULTS_URL}" ] || [ -n "${ACTIONS_CACHE_URL}" ]; }; then
            DOCKER_CACHE_ARGS_FAT="--cache-from type=gha,scope=stirling-pdf-fat --cache-to type=gha,mode=max,scope=stirling-pdf-fat"
        else
            DOCKER_CACHE_ARGS_FAT=""
        fi
        local fat_build_log="$REPORT_DIR/Build-Fat-Docker.build.log"
        if ! docker buildx build --build-arg VERSION_TAG=alpha \
            ${BASE_IMAGE_ARG} \
            -t docker.stirlingpdf.com/stirlingtools/stirling-pdf:fat \
            -f ./docker/embedded/Dockerfile.fat \
            --load \
            ${DOCKER_CACHE_ARGS_FAT} . 2>&1 | tee "$fat_build_log"; then
            failed_tests+=("Build-Fat-Docker")
            capture_build_failure "Build-Fat-Docker"
            gha_endgroup
            exit 1
        fi
        gha_endgroup
    else
        echo "Skipping fat image build - no fat tests in rerun list"
    fi

    # Test fat + security compose
    run_tests "Stirling-PDF-Security-Fat" "./docker/embedded/compose/docker-compose-latest-fat-security.yml"

    if should_run_test "Webpage-Accessibility-full"; then
        start_test_timer "Webpage-Accessibility-full"
        gha_group "Test: Webpage-Accessibility-full"
        echo "Testing webpage accessibility..."
        cd "testing"
        if ./test_webpages.sh -f webpage_urls_full.txt -b http://localhost:8080; then
            passed_tests+=("Webpage-Accessibility-full")
        else
            failed_tests+=("Webpage-Accessibility-full")
            capture_failure_logs "Webpage-Accessibility-full" "$CURRENT_CONTAINER"
            echo "Webpage accessibility full tests failed"
        fi
        cd "$PROJECT_ROOT"
        gha_endgroup
        stop_test_timer "Webpage-Accessibility-full"
    fi

    if should_run_test "Stirling-PDF-Security-Fat-Version-Check"; then
        start_test_timer "Stirling-PDF-Security-Fat-Version-Check"
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Security-Fat" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Security-Fat-Version-Check")
            echo "Version verification passed for Stirling-PDF-Security-Fat"
        else
            failed_tests+=("Stirling-PDF-Security-Fat-Version-Check")
            capture_failure_logs "Stirling-PDF-Security-Fat-Version-Check" "$CURRENT_CONTAINER"
            echo "Version verification failed for Stirling-PDF-Security-Fat"
        fi
        stop_test_timer "Stirling-PDF-Security-Fat-Version-Check"
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
        start_test_timer "Stirling-PDF-Regression"

        # Snapshot docker log line count before behave so we can extract only behave-window logs
        DOCKER_LOG_BEFORE=$(docker logs "$CONTAINER_NAME" 2>&1 | wc -l)

        export TEST_CONTAINER_NAME="$CONTAINER_NAME"
        export TEST_REPORT_DIR="$REPORT_DIR"

        gha_group "Test: Behave regression tests"
        if python -m behave \
            -f behave_html_formatter:HTMLFormatter -o "$CUCUMBER_REPORT" \
            -f pretty \
            --junit --junit-directory "$CUCUMBER_JUNIT_DIR"; then
            gha_endgroup

            # Save docker logs produced during the behave run
            docker logs "$CONTAINER_NAME" 2>&1 | tail -n +"$((DOCKER_LOG_BEFORE + 1))" > "$REPORT_DIR/cucumber-docker-context.log" 2>/dev/null || true

            # Check for "response is already committed" errors in docker logs.
            # These indicate Spring Security re-running on async dispatches
            # (e.g. StreamingResponseBody completion) which can corrupt responses.
            local committed_errors
            committed_errors=$(grep -c "response is already committed" "$REPORT_DIR/cucumber-docker-context.log" 2>/dev/null) || committed_errors=0
            if [ "$committed_errors" -gt 0 ]; then
                echo "ERROR: Found $committed_errors 'response is already committed' errors in docker logs."
                echo "This usually means a StreamingResponseBody endpoint is triggering a Spring Security"
                echo "re-authorization on the async dispatch. Check spring.security.filter.dispatcher-types"
                echo "in application.properties."
                grep -B2 "response is already committed" "$REPORT_DIR/cucumber-docker-context.log" | head -30
                local committed_log="$REPORT_DIR/response-committed-errors.log"
                grep -B5 "response is already committed" "$REPORT_DIR/cucumber-docker-context.log" > "$committed_log"
                test_failure_logs["Response-Already-Committed"]="$committed_log"
                failed_tests+=("Response-Already-Committed")
            else
                echo "No 'response is already committed' errors found in docker logs."
            fi

            echo "Waiting 5 seconds for any file operations to complete..."
            sleep 5

            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"

            if compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"; then
                echo "No unexpected temporary files found."
                passed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")
            else
                echo "WARNING: Unexpected temporary files detected after behave tests!"

                # Save temp file failure details to a log for the test report
                local tempfile_log="$REPORT_DIR/temp-files-failure.log"
                {
                    echo "=== Temp File Regression Failure ==="
                    echo "Container: $CONTAINER_NAME"
                    echo ""
                    echo "=== Before snapshot ==="
                    cat "$BEFORE_FILE" 2>/dev/null || echo "(empty)"
                    echo ""
                    echo "=== After snapshot ==="
                    cat "$AFTER_FILE" 2>/dev/null || echo "(empty)"
                    echo ""
                    echo "=== Diff (new/changed files) ==="
                    cat "$DIFF_FILE" 2>/dev/null || echo "(empty)"
                    echo ""
                    echo "=== Leftover temp files ==="
                    cat "${DIFF_FILE}.tmp" 2>/dev/null || echo "(none found)"
                    echo ""
                    echo "=== Docker logs ==="
                    docker logs "$CONTAINER_NAME" 2>&1 | tail -200
                } > "$tempfile_log" 2>/dev/null || true

                # Copy snapshots to report dir for artifact upload
                cp "$BEFORE_FILE" "$REPORT_DIR/" 2>/dev/null || true
                cp "$AFTER_FILE" "$REPORT_DIR/" 2>/dev/null || true
                cp "$DIFF_FILE" "$REPORT_DIR/" 2>/dev/null || true
                cp "${DIFF_FILE}.tmp" "$REPORT_DIR/files_diff_tmp_matches.txt" 2>/dev/null || true

                test_failure_logs["Stirling-PDF-Regression-Temp-Files"]="$tempfile_log"
                failed_tests+=("Stirling-PDF-Regression-Temp-Files")
            fi
            passed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")
        else
            gha_endgroup
            failed_tests+=("Stirling-PDF-Regression $CONTAINER_NAME")

            # Save docker logs from the behave window to a dedicated file
            local cucumber_log="$REPORT_DIR/cucumber-docker-context.log"
            docker logs "$CONTAINER_NAME" 2>&1 | tail -n +"$((DOCKER_LOG_BEFORE + 1))" > "$cucumber_log" 2>/dev/null || true
            test_failure_logs["Stirling-PDF-Regression"]="$cucumber_log"

            gha_group "Docker logs during behave run: $CONTAINER_NAME"
            tail -100 "$cucumber_log"
            gha_endgroup

            echo "Waiting 10 seconds before capturing file list..."
            sleep 10

            cd "$PROJECT_ROOT"
            capture_file_list "$CONTAINER_NAME" "$AFTER_FILE"
            compare_file_lists "$BEFORE_FILE" "$AFTER_FILE" "$DIFF_FILE" "$CONTAINER_NAME"
        fi
        stop_test_timer "Stirling-PDF-Regression"
    fi
    docker-compose -f "./docker/embedded/compose/test_cicd.yml" down -v

    # ==================================================================
    # 4. Disabled Endpoints Test
    # ==================================================================
    run_tests "Stirling-PDF-Fat-Disable-Endpoints" "./docker/embedded/compose/docker-compose-latest-fat-endpoints-disabled.yml"

    if should_run_test "Disabled-Endpoints"; then
        start_test_timer "Disabled-Endpoints"
        gha_group "Test: Disabled-Endpoints"
        echo "Testing disabled endpoints..."
        if ./testing/test_disabledEndpoints.sh -f ./testing/endpoints.txt -b http://localhost:8080; then
            passed_tests+=("Disabled-Endpoints")
        else
            failed_tests+=("Disabled-Endpoints")
            capture_failure_logs "Disabled-Endpoints" "$CURRENT_CONTAINER"
            echo "Disabled Endpoints tests failed"
        fi
        gha_endgroup
        stop_test_timer "Disabled-Endpoints"
    fi

    if should_run_test "Stirling-PDF-Fat-Disable-Endpoints-Version-Check"; then
        start_test_timer "Stirling-PDF-Fat-Disable-Endpoints-Version-Check"
        echo "Testing version verification..."
        if verify_app_version "Stirling-PDF-Fat-Disable-Endpoints" "http://localhost:8080"; then
            passed_tests+=("Stirling-PDF-Fat-Disable-Endpoints-Version-Check")
            echo "Version verification passed for Stirling-PDF-Fat-Disable-Endpoints"
        else
            failed_tests+=("Stirling-PDF-Fat-Disable-Endpoints-Version-Check")
            capture_failure_logs "Stirling-PDF-Fat-Disable-Endpoints-Version-Check" "$CURRENT_CONTAINER"
            echo "Version verification failed for Stirling-PDF-Fat-Disable-Endpoints"
        fi
        stop_test_timer "Stirling-PDF-Fat-Disable-Endpoints-Version-Check"
    fi

    docker-compose -f "./docker/embedded/compose/docker-compose-latest-fat-endpoints-disabled.yml" down -v

    # ==================================================================
    # Final Report
    # ==================================================================
    echo ""
    echo "=========================================="
    echo "TEST RESULTS SUMMARY"
    echo "=========================================="
    echo "Total duration: ${SECONDS}s"
    echo "Passed: ${#passed_tests[@]}  Failed: ${#failed_tests[@]}"
    echo ""

    if [ ${#passed_tests[@]} -ne 0 ]; then
        echo "Passed tests:"
        for test in "${passed_tests[@]}"; do
            local dur=${test_durations["$test"]:-"?"}
            echo -e "  \e[32m✅ $test\e[0m (${dur}s)"
        done
    fi

    if [ ${#failed_tests[@]} -ne 0 ]; then
        echo ""
        echo "Failed tests:"
        for test in "${failed_tests[@]}"; do
            local dur=${test_durations["$test"]:-"?"}
            local log=${test_failure_logs["$test"]:-"no log captured"}
            echo -e "  \e[31m❌ $test\e[0m (${dur}s) -> $log"
        done
    fi

    echo ""

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
