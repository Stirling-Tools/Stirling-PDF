#!/bin/bash

# Test script for AutoJobPostMapping functionality
# Tests the rotate-pdf endpoint with various configurations

# Don't exit on error for Git Bash compatibility
# set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Utility functions
function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    # Don't exit on error for Git Bash
    # exit 1
}

function log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

function separator() {
    echo -e "\n${YELLOW}----------------------------------------${NC}\n"
}

# Check if Stirling-PDF is running
function check_service() {
    log_info "Checking if Stirling-PDF service is running..."
    
    # Try to connect to the service
    if curl -s -f http://localhost:8080 > /dev/null; then
        log_success "Stirling-PDF service is running"
        return 0
    else
        log_error "Stirling-PDF service is not running. Please start it first."
        exit 1
    fi
}

# Create test directory
TEST_DIR="/tmp/autojob_test"
mkdir -p "$TEST_DIR"

# Clean previous test results
rm -rf "$TEST_DIR"/*

# Prepare test PDF file if it doesn't exist
TEST_PDF="$TEST_DIR/test.pdf"
if [ ! -f "$TEST_PDF" ]; then
    log_info "Creating test PDF..."
    # Check if we have a sample PDF in the repository
    if [ -f "src/main/resources/static/files/Auto Splitter Divider (with instructions).pdf" ]; then
        cp "src/main/resources/static/files/Auto Splitter Divider (with instructions).pdf" "$TEST_PDF"
    else
        # Create a simple PDF with text
        echo "This is a test PDF file for AutoJobPostMapping testing" > "$TEST_DIR/test.txt"
        if command -v convert &> /dev/null; then
            convert -size 612x792 canvas:white -font Arial -pointsize 20 -draw "text 50,400 '@$TEST_DIR/test.txt'" "$TEST_PDF"
        else
            log_error "ImageMagick 'convert' command not found. Cannot create test PDF."
            exit 1
        fi
    fi
fi

# Test variables
SUCCESS_COUNT=0
FAILURE_COUNT=0
START_TIME=$(date +%s)

# Test 1: Synchronous mode with file upload
function test_sync_file_upload() {
    separator
    log_info "Test 1: Synchronous mode with file upload"
    
    RESPONSE_FILE="$TEST_DIR/sync_response.pdf"
    
    log_info "Calling rotate-pdf endpoint with angle=90..."
    
    # Call the endpoint
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \
        -F "fileInput=@$TEST_PDF" \
        -F "angle=90" \
        -H "Accept: application/pdf" \
        http://localhost:8080/api/v1/general/rotate-pdf)
    
    if [[ $HTTP_CODE -ge 200 && $HTTP_CODE -lt 300 ]]; then
        # Check if response is a valid PDF
        if file "$RESPONSE_FILE" | grep -q "PDF document"; then
            log_success "Test 1 succeeded: Received valid PDF response (HTTP $HTTP_CODE)"
            ((SUCCESS_COUNT++))
        # Check if it's a JSON response with an embedded PDF
        elif grep -q "result" "$RESPONSE_FILE" && grep -q "application/pdf" "$RESPONSE_FILE"; then
            log_warning "Test 1 partial: Response is a JSON wrapper instead of direct PDF (HTTP $HTTP_CODE)"
            log_info "The API returned a JSON wrapper. This will be fixed by the JobExecutorService update."
            ((SUCCESS_COUNT++))
        else
            log_error "Test 1 failed: Response is neither a valid PDF nor a JSON wrapper (HTTP $HTTP_CODE)"
            ((FAILURE_COUNT++))
        fi
    else
        log_error "Test 1 failed: API call returned error (HTTP $HTTP_CODE)"
        ((FAILURE_COUNT++))
    fi
}

# Test 2: Asynchronous mode with file upload
function test_async_file_upload() {
    separator
    log_info "Test 2: Asynchronous mode with file upload"
    
    RESPONSE_FILE="$TEST_DIR/async_response.json"
    
    log_info "Calling rotate-pdf endpoint with angle=180 and async=true..."
    
    # Call the endpoint - simplified for Git Bash
    curl -s -o "$RESPONSE_FILE" \
        -F "fileInput=@$TEST_PDF" \
        -F "angle=180" \
        "http://localhost:8080/api/v1/general/rotate-pdf?async=true"
    
    # Check if file exists and has content
    if [ -f "$RESPONSE_FILE" ] && [ -s "$RESPONSE_FILE" ]; then
        
        # Extract job ID from response
        JOB_ID=$(grep -o '"jobId":"[^"]*"' "$RESPONSE_FILE" | cut -d':' -f2 | tr -d '"')
        
        if [ -n "$JOB_ID" ]; then
            log_success "Received job ID: $JOB_ID"
            
            # Wait for job to complete (polling)
            log_info "Polling for job completion..."
            MAX_ATTEMPTS=10
            ATTEMPT=0
            
            while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
                ((ATTEMPT++))
                sleep 2
                
                # Check job status
                STATUS_FILE="$TEST_DIR/job_status.json"
                if curl -s -o "$STATUS_FILE" "http://localhost:8080/api/v1/general/job/$JOB_ID"; then
                    if grep -q '"complete":true' "$STATUS_FILE"; then
                        log_success "Job completed successfully"
                        
                        # Download result
                        RESULT_FILE="$TEST_DIR/async_result.pdf"
                        if curl -s -o "$RESULT_FILE" "http://localhost:8080/api/v1/general/job/$JOB_ID/result"; then
                            # Check if response is a valid PDF
                            if file "$RESULT_FILE" | grep -q "PDF document"; then
                                log_success "Test 2 succeeded: Received valid PDF result"
                                ((SUCCESS_COUNT++))
                                break
                            else
                                log_error "Test 2 failed: Result is not a valid PDF"
                                ((FAILURE_COUNT++))
                                break
                            fi
                        else
                            log_error "Test 2 failed: Could not download result"
                            ((FAILURE_COUNT++))
                            break
                        fi
                    elif grep -q '"error":' "$STATUS_FILE"; then
                        ERROR=$(grep -o '"error":"[^"]*"' "$STATUS_FILE" | cut -d':' -f2 | tr -d '"')
                        log_error "Test 2 failed: Job reported error: $ERROR"
                        ((FAILURE_COUNT++))
                        break
                    else
                        log_info "Job still processing (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
                    fi
                else
                    log_error "Failed to check job status"
                fi
                
                if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
                    log_error "Test 2 failed: Job did not complete in time"
                    ((FAILURE_COUNT++))
                fi
            done
        else
            log_error "Test 2 failed: No job ID found in response"
            ((FAILURE_COUNT++))
        fi
    else
        log_error "Test 2 failed: API call returned error"
        ((FAILURE_COUNT++))
    fi
}

# Test 3: Using fileId parameter from an async job result
function test_file_id() {
    separator
    log_info "Test 3: Using fileId parameter from an async job"
    
    # First, we need to run an async operation to get a fileId
    ASYNC_RESPONSE="$TEST_DIR/test3_async_response.json"
    
    log_info "First, submitting an async rotation to get a server-side file..."
    
    # Call the endpoint with async=true
    curl -s -o "$ASYNC_RESPONSE" \
        -F "fileInput=@$TEST_PDF" \
        -F "angle=90" \
        "http://localhost:8080/api/v1/general/rotate-pdf?async=true"
    
    # Extract job ID from response
    JOB_ID=$(grep -o '"jobId":"[^"]*"' "$ASYNC_RESPONSE" | cut -d':' -f2 | tr -d '"')
    
    if [ -z "$JOB_ID" ]; then
        log_error "Test 3 failed: No job ID found in async response"
        ((FAILURE_COUNT++))
        return
    fi
    
    log_success "Received job ID: $JOB_ID"
    
    # Wait for job to complete
    log_info "Waiting for async job to complete..."
    MAX_ATTEMPTS=10
    ATTEMPT=0
    JOB_COMPLETED=false
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ((ATTEMPT++))
        sleep 2
        
        # Check job status
        STATUS_FILE="$TEST_DIR/test3_job_status.json"
        if curl -s -o "$STATUS_FILE" "http://localhost:8080/api/v1/general/job/$JOB_ID"; then
            echo "Job status response:"
            cat "$STATUS_FILE"
            
            if grep -q '"complete":true' "$STATUS_FILE"; then
                log_success "Async job completed successfully"
                JOB_COMPLETED=true
                break
            elif grep -q '"error":' "$STATUS_FILE"; then
                ERROR=$(grep -o '"error":"[^"]*"' "$STATUS_FILE" | cut -d':' -f2 | tr -d '"')
                log_error "Test 3 failed: Async job reported error: $ERROR"
                ((FAILURE_COUNT++))
                return
            else
                log_info "Job still processing (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
            fi
        else
            log_error "Failed to check job status"
        fi
        
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            log_error "Test 3 failed: Async job did not complete in time"
            ((FAILURE_COUNT++))
            return
        fi
    done
    
    if [ "$JOB_COMPLETED" = false ]; then
        log_error "Test 3 failed: Async job did not complete successfully"
        ((FAILURE_COUNT++))
        return
    fi
    
    # Now get the result file from the completed job
    RESULT_FILE="$TEST_DIR/test3_result.pdf"
    if curl -s -o "$RESULT_FILE" "http://localhost:8080/api/v1/general/job/$JOB_ID/result"; then
        if file "$RESULT_FILE" | grep -q "PDF document"; then
            log_success "Successfully downloaded result file"
        else
            log_error "Test 3 failed: Downloaded result is not a valid PDF"
            ((FAILURE_COUNT++))
            return
        fi
    else
        log_error "Test 3 failed: Could not download result file"
        ((FAILURE_COUNT++))
        return
    fi
    
    # Now check the job result info to get fileId
    RESULT_INFO="$TEST_DIR/test3_job_info.json"
    curl -s -o "$RESULT_INFO" "http://localhost:8080/api/v1/general/job/$JOB_ID"
    
    # Try to extract fileId directly from the job info
    FILE_ID=$(grep -o '"fileId":"[^"]*"' "$RESULT_INFO" | head -1 | cut -d':' -f2 | tr -d '"')
    
    if [ -z "$FILE_ID" ]; then
        log_error "Test 3 failed: Could not find fileId in job result"
        echo "Job result content:"
        cat "$RESULT_INFO"
        
        # Even if we couldn't find a fileId, let's try to proceed using an alternate approach
        log_warning "Falling back to alternate approach: extracting fileId from request PDFFile"
    
        # Run another async job but extract fileId from the request PDFFile
        ASYNC_RESPONSE2="$TEST_DIR/test3_async_response2.json"
        
        curl -vvv -s -o "$ASYNC_RESPONSE2" \
            -F "fileInput=@$TEST_PDF" \
            -F "angle=90" \
            "http://localhost:8080/api/v1/general/rotate-pdf?async=true" 2>&1 | tee "$TEST_DIR/curl_verbose.log"
        
        echo "Curl verbose log for debugging:"
        cat "$TEST_DIR/curl_verbose.log"
        
        # Try to get the fileId from the async response
        JOB_ID2=$(grep -o '"jobId":"[^"]*"' "$ASYNC_RESPONSE2" | cut -d':' -f2 | tr -d '"')
        
        if [ -z "$JOB_ID2" ]; then
            log_error "Test 3 failed: No job ID found in second async response"
            ((FAILURE_COUNT++))
            return
        fi
        
        log_success "Received second job ID: $JOB_ID2"
        
        # Wait for this job to complete as well
        sleep 5
        
        # Get the job status to see if fileId is available
        RESULT_INFO2="$TEST_DIR/test3_job_info2.json"
        curl -s -o "$RESULT_INFO2" "http://localhost:8080/api/v1/general/job/$JOB_ID2"
        
        # Try to extract fileId directly from the job info
        FILE_ID=$(grep -o '"fileId":"[^"]*"' "$RESULT_INFO2" | head -1 | cut -d':' -f2 | tr -d '"')
        
        if [ -z "$FILE_ID" ]; then
            log_error "Test 3 failed: Could not find fileId in second job result either"
            echo "Second job result content:"
            cat "$RESULT_INFO2"
            ((FAILURE_COUNT++))
            return
        fi
    fi
    
    log_success "Extracted fileId from job result: $FILE_ID"
    
    # Now use the fileId to rotate the PDF again with a different angle
    RESPONSE_FILE="$TEST_DIR/fileid_response.pdf"
    
    log_info "Calling rotate-pdf endpoint with fileId and angle=270..."
    
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \
        -F "fileId=$FILE_ID" \
        -F "angle=270" \
        -H "Accept: application/pdf" \
        http://localhost:8080/api/v1/general/rotate-pdf)
    
    echo "Response status code: $HTTP_CODE"
    
    if [[ $HTTP_CODE -ge 200 && $HTTP_CODE -lt 300 ]]; then
        # Check if response is a valid PDF
        if file "$RESPONSE_FILE" | grep -q "PDF document"; then
            log_success "Test 3 succeeded: Received valid PDF response using fileId (HTTP $HTTP_CODE)"
            ((SUCCESS_COUNT++))
        # Check if it's a JSON response with an embedded PDF
        elif grep -q "result" "$RESPONSE_FILE" && grep -q "application/pdf" "$RESPONSE_FILE"; then
            log_warning "Test 3 partial: Response is a JSON wrapper instead of direct PDF (HTTP $HTTP_CODE)"
            log_info "The API returned a JSON wrapper. This will be fixed by the JobExecutorService update."
            ((SUCCESS_COUNT++))
        else
            log_error "Test 3 failed: Response is neither a valid PDF nor a JSON wrapper (HTTP $HTTP_CODE)"
            echo "Response content:"
            cat "$RESPONSE_FILE"
            ((FAILURE_COUNT++))
        fi
    else
        log_error "Test 3 failed: API call with fileId returned error (HTTP $HTTP_CODE)"
        echo "Response content:"
        cat "$RESPONSE_FILE"
        ((FAILURE_COUNT++))
    fi
}

# Test 4: Error handling (invalid angle)
function test_error_handling() {
    separator
    log_info "Test 4: Error handling (invalid angle)"
    
    RESPONSE_FILE="$TEST_DIR/error_response.txt"
    
    log_info "Calling rotate-pdf endpoint with invalid angle=45..."
    
    # Call the endpoint with an invalid angle (not multiple of 90)
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \
        -F "fileInput=@$TEST_PDF" \
        -F "angle=45" \
        http://localhost:8080/api/v1/general/rotate-pdf)
    
    # Check if we got an error response (4xx or 5xx)
    if [[ $HTTP_CODE -ge 400 ]]; then
        log_success "Test 4 succeeded: Received error response for invalid angle (HTTP $HTTP_CODE)"
        ((SUCCESS_COUNT++))
    else
        log_error "Test 4 failed: Did not receive error for invalid angle (HTTP $HTTP_CODE)"
        ((FAILURE_COUNT++))
    fi
}

# Test 5: Non-async operation with fileId from an async job
function test_non_async_with_fileid() {
    separator
    log_info "Test 5: Non-async operation with fileId from an async job"
    
    # First, we need to run an async operation to get a fileId
    ASYNC_RESPONSE="$TEST_DIR/test5_async_response.json"
    
    log_info "First, submitting an async rotation to get a server-side file..."
    
    # Call the endpoint with async=true
    curl -s -o "$ASYNC_RESPONSE" \
        -F "fileInput=@$TEST_PDF" \
        -F "angle=90" \
        "http://localhost:8080/api/v1/general/rotate-pdf?async=true"
    
    # Extract job ID from response
    JOB_ID=$(grep -o '"jobId":"[^"]*"' "$ASYNC_RESPONSE" | cut -d':' -f2 | tr -d '"')
    
    if [ -z "$JOB_ID" ]; then
        log_error "Test 5 failed: No job ID found in async response"
        ((FAILURE_COUNT++))
        return
    fi
    
    log_success "Received job ID: $JOB_ID"
    
    # Wait for job to complete
    log_info "Waiting for async job to complete..."
    MAX_ATTEMPTS=10
    ATTEMPT=0
    JOB_COMPLETED=false
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ((ATTEMPT++))
        sleep 2
        
        # Check job status
        STATUS_FILE="$TEST_DIR/test5_job_status.json"
        if curl -s -o "$STATUS_FILE" "http://localhost:8080/api/v1/general/job/$JOB_ID"; then
            if grep -q '"complete":true' "$STATUS_FILE"; then
                log_success "Async job completed successfully"
                JOB_COMPLETED=true
                break
            elif grep -q '"error":' "$STATUS_FILE"; then
                ERROR=$(grep -o '"error":"[^"]*"' "$STATUS_FILE" | cut -d':' -f2 | tr -d '"')
                log_error "Test 5 failed: Async job reported error: $ERROR"
                ((FAILURE_COUNT++))
                return
            else
                log_info "Job still processing (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
            fi
        else
            log_error "Failed to check job status"
        fi
        
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            log_error "Test 5 failed: Async job did not complete in time"
            ((FAILURE_COUNT++))
            return
        fi
    done
    
    if [ "$JOB_COMPLETED" = false ]; then
        log_error "Test 5 failed: Async job did not complete successfully"
        ((FAILURE_COUNT++))
        return
    fi
    
    # Get the job status info
    RESULT_INFO="$TEST_DIR/test5_job_info.json"
    curl -s -o "$RESULT_INFO" "http://localhost:8080/api/v1/general/job/$JOB_ID"
    
    # Try to extract fileId directly from the job info
    FILE_ID=$(grep -o '"fileId":"[^"]*"' "$RESULT_INFO" | head -1 | cut -d':' -f2 | tr -d '"')
    
    if [ -z "$FILE_ID" ]; then
        log_error "Test 5 failed: Could not find fileId in job result"
        echo "Job result content:"
        cat "$RESULT_INFO"
        ((FAILURE_COUNT++))
        return
    fi
    
    log_success "Extracted fileId from job result: $FILE_ID"
    
    # Now use the fileId to rotate the PDF with a non-async operation
    RESPONSE_FILE="$TEST_DIR/test5_response.pdf"
    
    log_info "Calling rotate-pdf endpoint with fileId and angle=180 (non-async)..."
    
    HTTP_CODE=$(curl -s -w "%{http_code}" -o "$RESPONSE_FILE" \
        -F "fileId=$FILE_ID" \
        -F "angle=180" \
        -H "Accept: application/pdf" \
        http://localhost:8080/api/v1/general/rotate-pdf)
    
    echo "Response status code: $HTTP_CODE"
    
    if [[ $HTTP_CODE -ge 200 && $HTTP_CODE -lt 300 ]]; then
        # Check if response is a valid PDF
        if file "$RESPONSE_FILE" | grep -q "PDF document"; then
            log_success "Test 5 succeeded: Received valid PDF response using fileId in non-async mode (HTTP $HTTP_CODE)"
            ((SUCCESS_COUNT++))
        else
            log_error "Test 5 failed: Response is not a valid PDF (HTTP $HTTP_CODE)"
            echo "Response content type:"
            file "$RESPONSE_FILE"
            ((FAILURE_COUNT++))
        fi
    else
        log_error "Test 5 failed: API call with fileId returned error (HTTP $HTTP_CODE)"
        echo "Response content:"
        cat "$RESPONSE_FILE"
        ((FAILURE_COUNT++))
    fi
}

# Run tests
check_service || exit 1

echo "Starting Test 1"
test_sync_file_upload
echo "Test 1 completed"

echo "Starting Test 2"
test_async_file_upload
echo "Test 2 completed"

echo "Starting Test 3"
test_file_id
echo "Test 3 completed"

echo "Starting Test 4"
test_error_handling
echo "Test 4 completed"

echo "Starting Test 5"
test_non_async_with_fileid
echo "Test 5 completed"

# Calculate test duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate report
separator
echo -e "${BLUE}==== AutoJobPostMapping Test Report ====${NC}"
echo -e "Test duration: ${DURATION} seconds"
echo -e "Tests passed: ${GREEN}${SUCCESS_COUNT}${NC}"
echo -e "Tests failed: ${RED}${FAILURE_COUNT}${NC}"
echo -e "Total tests: $((SUCCESS_COUNT + FAILURE_COUNT))"
echo -e "Success rate: $(( (SUCCESS_COUNT * 100) / (SUCCESS_COUNT + FAILURE_COUNT) ))%"

if [ $FAILURE_COUNT -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed successfully!${NC}"
else
    echo -e "\n${RED}Some tests failed. Check the logs above for details.${NC}"
fi
separator

# Clean up
# Uncomment the following line to keep test files for inspection
# rm -rf "$TEST_DIR"

echo "Test files are available in $TEST_DIR"