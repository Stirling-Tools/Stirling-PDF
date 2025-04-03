#!/bin/bash

# Function to check a single endpoint
check_endpoint() {
  local endpoint=$(echo "$1" | tr -d '\r') # Remove carriage returns
  local base_url=$(echo "$2" | tr -d '\r')
  local full_url="${base_url}${endpoint}"
  local timeout=10
  local result_file="$3"
  local api_key="$4"

  # Use curl to fetch the endpoint with timeout

  response=$(curl -s -w "\n%{http_code}" --max-time $timeout \
  -H "accept: */*" \
  -H "Content-Type: multipart/form-data" \
  -F "additional_field=" \
  "$full_url")
  if [ $? -ne 0 ]; then
    echo "FAILED - Connection error or timeout $full_url" >> "$result_file"
    return 1
  fi

  # Split response into body and status code
  HTTP_STATUS=$(echo "$response" | tail -n1)
  BODY=$(echo "$response" | sed '$d')

  # Check HTTP status
  if [ "$HTTP_STATUS" != "403" ]; then
    echo "FAILED - HTTP Status: $HTTP_STATUS - $full_url" >> "$result_file"
    return 1
  fi

  echo "OK - $full_url" >> "$result_file"
  return 0
}

# Function to test an endpoint and update counters
test_endpoint() {
  local endpoint="$1"
  local base_url="$2"
  local tmp_dir="$3"
  local endpoint_index="$4"
  local api_key="$5"
  local result_file="${tmp_dir}/result_${endpoint_index}.txt"

  if ! check_endpoint "$endpoint" "$base_url" "$result_file" "$api_key"; then
    echo "1" > "${tmp_dir}/failed_${endpoint_index}"
  else
    echo "0" > "${tmp_dir}/failed_${endpoint_index}"
  fi
}

# Main function to test all endpoints from the list in parallel
test_all_endpoints() {
  local endpoint_file="$1"
  local base_url="${2:-"http://localhost:8080"}"
  local api_key="$3"
  local max_parallel="${4:-10}"  # Default to 10 parallel processes
  local failed_count=0
  local total_count=0
  local start_time=$(date +%s)
  local tmp_dir=$(mktemp -d)
  local active_jobs=0
  local endpoint_index=0

  echo "Starting endpoint tests..."
  echo "Base URL: $base_url"
  echo "Number of lines: $(wc -l < "$endpoint_file")"
  echo "Max parallel jobs: $max_parallel"
  echo "----------------------------------------"

  # Process each endpoint
  while IFS= read -r endpoint || [ -n "$endpoint" ]; do
    # Skip empty lines and comments
    [[ -z "$endpoint" || "$endpoint" =~ ^#.*$ ]] && continue

    ((total_count++))
    ((endpoint_index++))

    # Run the check in background
    test_endpoint "$endpoint" "$base_url" "$tmp_dir" "$endpoint_index" "$api_key" &

    # Track the job
    ((active_jobs++))

    # If we've reached max_parallel, wait for a job to finish
    if [ $active_jobs -ge $max_parallel ]; then
      wait -n  # Wait for any child process to exit
      ((active_jobs--))
    fi
  done < "$endpoint_file"

  # Wait for remaining jobs to finish
  wait

  # Print results in order and count failures
  for i in $(seq 1 $endpoint_index); do
    if [ -f "${tmp_dir}/result_${i}.txt" ]; then
      cat "${tmp_dir}/result_${i}.txt"
    fi

    if [ -f "${tmp_dir}/failed_${i}" ]; then
      failed_count=$((failed_count + $(cat "${tmp_dir}/failed_${i}")))
    fi
  done

  # Clean up
  rm -rf "$tmp_dir"

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
  echo "Usage: $0 [-f endpoint_file] [-b base_url] [-k api_key] [-p max_parallel]"
  echo "Options:"
  echo "  -f endpoint_file Path to file containing endpoints to test (required)"
  echo "  -b base_url      Base URL to prepend to test endpoints (default: http://localhost:8080)"
  echo "  -k api_key       API key to use for authentication (required)"
  echo "  -p max_parallel  Maximum number of parallel requests (default: 10)"
  exit 1
}

# Main execution
main() {
  local endpoint_file=""
  local base_url="http://localhost:8080"
  local api_key="123456789"
  local max_parallel=10

  # Parse command line options
  while getopts ":f:b:h" opt; do
    case $opt in
      f) endpoint_file="$OPTARG" ;;
      b) base_url="$OPTARG" ;;
      h) usage ;;
      \?) echo "Invalid option -$OPTARG" >&2; usage ;;
    esac
  done

  # Check if endpoint file is provided
  if [ -z "$endpoint_file" ]; then
    echo "Error: Endpoint file is required"
    usage
  fi

  # Check if endpoint file exists
  if [ ! -f "$endpoint_file" ]; then
    echo "Error: Endpoint list file not found: $endpoint_file"
    exit 1
  fi

  # Check if API key is provided
  if [ -z "$api_key" ]; then
    echo "Error: API key is required"
    usage
  fi

  # Run tests using the endpoint list
  if test_all_endpoints "$endpoint_file" "$base_url" "$api_key" "$max_parallel"; then
    echo "All endpoint tests passed!"
    exit 0
  else
    echo "Some endpoint tests failed!"
    exit 1
  fi
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
