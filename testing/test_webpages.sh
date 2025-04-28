#!/bin/bash

# Function to check a single webpage
check_webpage() {
  local url=$(echo "$1" | tr -d '\r') # Remove carriage returns
  local base_url=$(echo "$2" | tr -d '\r')
  local full_url="${base_url}${url}"
  local timeout=10
  local result_file="$3"

  # Use curl to fetch the page with timeout
  response=$(curl -s -w "\n%{http_code}" --max-time $timeout "$full_url")
  if [ $? -ne 0 ]; then
    echo "FAILED - Connection error or timeout $full_url" >> "$result_file"
    return 1
  fi

  # Split response into body and status code
  HTTP_STATUS=$(echo "$response" | tail -n1)
  BODY=$(echo "$response" | sed '$d')

  # Check HTTP status
  if [ "$HTTP_STATUS" != "200" ]; then
    echo "FAILED - HTTP Status: $HTTP_STATUS - $full_url" >> "$result_file"
    return 1
  fi

  # Check if response contains HTML
  if ! grep -q "<!DOCTYPE html>\|<html" <<< "$BODY"; then
    echo "FAILED - Response is not HTML - $full_url" >> "$result_file"
    return 1
  fi

  echo "OK - $full_url" >> "$result_file"
  return 0
}

# Function to test a URL and update counters
test_url() {
  local url="$1"
  local base_url="$2"
  local tmp_dir="$3"
  local url_index="$4"
  local result_file="${tmp_dir}/result_${url_index}.txt"

  if ! check_webpage "$url" "$base_url" "$result_file"; then
    echo "1" > "${tmp_dir}/failed_${url_index}"
  else
    echo "0" > "${tmp_dir}/failed_${url_index}"
  fi
}

# Main function to test all URLs from the list in parallel
test_all_urls() {
  local url_file="$1"
  local base_url="${2:-"http://localhost:8080"}"
  local max_parallel="${3:-10}"  # Default to 10 parallel processes
  local failed_count=0
  local total_count=0
  local start_time=$(date +%s)
  local tmp_dir=$(mktemp -d)
  local active_jobs=0
  local url_index=0

  echo "Starting webpage tests..."
  echo "Base URL: $base_url"
  echo "Number of lines: $(wc -l < "$url_file")"
  echo "Max parallel jobs: $max_parallel"
  echo "----------------------------------------"

  # Process each URL
  while IFS= read -r url || [ -n "$url" ]; do
    # Skip empty lines and comments
    [[ -z "$url" || "$url" =~ ^#.*$ ]] && continue

    ((total_count++))
    ((url_index++))

    # Run the check in background
    test_url "$url" "$base_url" "$tmp_dir" "$url_index" &

    # Track the job
    ((active_jobs++))

    # If we've reached max_parallel, wait for a job to finish
    if [ $active_jobs -ge $max_parallel ]; then
      wait -n  # Wait for any child process to exit
      ((active_jobs--))
    fi
  done < "$url_file"

  # Wait for remaining jobs to finish
  wait

  # Print results in order and count failures
  for i in $(seq 1 $url_index); do
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
  echo "Usage: $0 [-f url_file] [-b base_url] [-p max_parallel]"
  echo "Options:"
  echo "  -f url_file    Path to file containing URLs to test (required)"
  echo "  -b base_url    Base URL to prepend to test URLs (default: http://localhost:8080)"
  echo "  -p max_parallel Maximum number of parallel requests (default: 10)"
  exit 1
}

# Main execution
main() {
  local url_file=""
  local base_url="http://localhost:8080"
  local max_parallel=10

  # Parse command line options
  while getopts ":f:b:p:h" opt; do
    case $opt in
      f) url_file="$OPTARG" ;;
      b) base_url="$OPTARG" ;;
      p) max_parallel="$OPTARG" ;;
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
  if test_all_urls "$url_file" "$base_url" "$max_parallel"; then
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
