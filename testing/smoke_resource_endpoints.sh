#!/bin/bash
# Smoke test for endpoints converted from StreamingResponseBody to Resource.
# Verifies that:
#   - Response status is 200
#   - Content-Length header matches actual body size
#   - Body is a valid PDF (starts with %PDF-)
#   - Multiple sequential requests all complete cleanly (no silent truncation)
#
# Run against a local bootRun on port 8088.

set -u

BASE_URL="${BASE_URL:-http://localhost:8088}"
TEST_PDF="${TEST_PDF:-testing/test_pdf_1.pdf}"
ITERATIONS="${ITERATIONS:-5}"
PASS=0
FAIL=0

if [ ! -f "$TEST_PDF" ]; then
    echo "ERROR: Test PDF not found at $TEST_PDF (run from repo root)"
    exit 1
fi

# hit_endpoint <label> <url> <form-args...>
# Sends the request, verifies 200, valid PDF magic, and Content-Length matches body.
hit_endpoint() {
    local label="$1"
    local url="$2"
    shift 2
    local out_headers; out_headers=$(mktemp)
    local out_body; out_body=$(mktemp)
    local http_code
    http_code=$(curl -sS -o "$out_body" -D "$out_headers" -w "%{http_code}" "$@" "$BASE_URL$url")
    local body_size; body_size=$(wc -c < "$out_body" | tr -d ' ')
    local cl
    cl=$(awk -v IGNORECASE=1 '/^content-length:/ {gsub(/\r/, "", $2); print $2; exit}' "$out_headers")
    local first_bytes
    first_bytes=$(head -c 5 "$out_body" | xxd -p 2>/dev/null || od -c -N5 "$out_body")

    if [ "$http_code" != "200" ]; then
        echo "  [FAIL] $label: HTTP $http_code"
        head -20 "$out_body"
        FAIL=$((FAIL+1))
    elif [ "${body_size}" = "0" ]; then
        echo "  [FAIL] $label: empty body"
        FAIL=$((FAIL+1))
    elif [ -n "$cl" ] && [ "$cl" != "$body_size" ]; then
        echo "  [FAIL] $label: Content-Length=$cl but body=$body_size bytes"
        FAIL=$((FAIL+1))
    elif ! head -c 5 "$out_body" | grep -q '%PDF-'; then
        echo "  [FAIL] $label: body does not start with %PDF- (first 5 bytes: $first_bytes)"
        FAIL=$((FAIL+1))
    else
        echo "  [OK]   $label: ${body_size}B, CL=${cl:-none}"
        PASS=$((PASS+1))
    fi
    rm -f "$out_headers" "$out_body"
}

echo "=== Smoke test: Resource-based streaming endpoints against $BASE_URL ==="
echo "PDF: $TEST_PDF"
echo "Iterations per endpoint: $ITERATIONS"
echo ""

for i in $(seq 1 "$ITERATIONS"); do
    echo "--- Iteration $i ---"
    hit_endpoint "rotate-pdf"       "/api/v1/general/rotate-pdf" \
        -F "fileInput=@${TEST_PDF}" -F "angle=90"
    hit_endpoint "remove-pages"     "/api/v1/general/remove-pages" \
        -F "fileInput=@${TEST_PDF}" -F "pageNumbers=1"
    hit_endpoint "scale-pages"      "/api/v1/general/scale-pages" \
        -F "fileInput=@${TEST_PDF}" -F "pageSize=A4"
    hit_endpoint "multi-page-layout" "/api/v1/general/multi-page-layout" \
        -F "fileInput=@${TEST_PDF}" -F "pagesPerSheet=2"
    hit_endpoint "crop"             "/api/v1/general/crop" \
        -F "fileInput=@${TEST_PDF}" -F "x=0" -F "y=0" -F "width=100" -F "height=100"
done

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
