#!/bin/bash

# Function to check a single webpage
check_webpage() {
    local url=$(echo "$1" | tr -d '\r')  # Remove carriage returns
    local base_url=$(echo "$2" | tr -d '\r')
    local full_url="${base_url}${url}"
    local timeout=10
    echo -n "Testing $full_url ... "
    
    # Use curl to fetch the page with timeout
    response=$(curl -s -w "\n%{http_code}" --max-time $timeout "$full_url")
    if [ $? -ne 0 ]; then
        echo "FAILED - Connection error or timeout $full_url "
        return 1
    fi

    # Split response into body and status code
    HTTP_STATUS=$(echo "$response" | tail -n1)
    BODY=$(echo "$response" | sed '$d')

    # Check HTTP status
    if [ "$HTTP_STATUS" != "200" ]; then
        echo "FAILED - HTTP Status: $HTTP_STATUS"
        return 1
    fi

    # Check if response contains HTML
    if ! printf '%s' "$BODY" | grep -q "<!DOCTYPE html>\|<html"; then
        echo "FAILED - Response is not HTML"
        return 1
    fi

    echo "OK"
    return 0
}

# Main function to test all URLs from the list
test_all_urls() {
    local url_file=$1
    local base_url=${2:-"http://localhost:8080"}
    local failed_count=0
    local total_count=0
    local start_time=$(date +%s)

    echo "Starting webpage tests..."
    echo "Base URL: $base_url"
	echo "Number of lines: $(wc -l < "$url_file")"
    echo "----------------------------------------"
	
    while IFS= read -r url || [ -n "$url" ]; do
        # Skip empty lines and comments
        [[ -z "$url" || "$url" =~ ^#.*$ ]] && continue
        
        ((total_count++))
        if ! check_webpage "$url" "$base_url"; then
            ((failed_count++))
        fi
    done < "$url_file"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "----------------------------------------"
    echo "Test Summary:"
    echo "Total tests: $total_count"
    echo "Failed tests: $failed_count"
    echo "Passed tests: $((total_count - failed_count))"
    echo "Duration: ${duration} seconds"

    return $failed_count
}

# Print usage information
usage() {
    echo "Usage: $0 [-f url_file] [-b base_url]"
    echo "Options:"
    echo "  -f url_file   Path to file containing URLs to test (required)"
    echo "  -b base_url   Base URL to prepend to test URLs (default: http://localhost:8080)"
    exit 1
}

# Main execution
main() {
    local url_file=""
    local base_url="http://localhost:8080"

    # Parse command line options
    while getopts ":f:b:h" opt; do
        case $opt in
            f) url_file="$OPTARG" ;;
            b) base_url="$OPTARG" ;;
            h) usage ;;
            \?) echo "Invalid option -$OPTARG" >&2; usage ;;
        esac
    done

    # Check if URL file is provided
    if [ -z "$url_file" ]; then
        echo "Error: URL file is required"
        usage
    fi

    # Check if URL file exists
    if [ ! -f "$url_file" ]; then
        echo "Error: URL list file not found: $url_file"
        exit 1
    fi
    
    # Run tests using the URL list
    if test_all_urls "$url_file" "$base_url"; then
        echo "All webpage tests passed!"
        exit 0
    else
        echo "Some webpage tests failed!"
        exit 1
    fi
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi