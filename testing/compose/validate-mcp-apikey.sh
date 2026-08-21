#!/bin/bash
# Validate the MCP server in apikey auth mode (curl + real MCP SDK client), then restore oauth.
# Runs every check and exits non-zero on any failure.

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SCRIPT_DIR/docker-compose-keycloak-mcp.yml"
CHECK_DIR="$SCRIPT_DIR/mcp-client-check"
MCP_URL="http://localhost:8080/mcp"
RPC_LIST='{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

PASS=0; FAIL=0
pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL + 1)); }

# Wait on the container healthcheck. Returns 0 once healthy, 1 after the timeout.
wait_up() {
    local w=0
    while [ $w -lt 360 ]; do
        if [ "$(docker inspect -f '{{.State.Health.Status}}' stirling-pdf-mcp-test 2>/dev/null)" = "healthy" ]; then
            echo ""
            return 0
        fi
        sleep 5; w=$((w + 5)); echo -n "."
    done
    echo ""
    return 1
}

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Validating MCP - API-KEY mode (+ real client) ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}▶ Recreating Stirling in apikey mode...${NC}"
MCP_AUTH_MODE=apikey PREMIUM_KEY="${PREMIUM_KEY:-}" \
    docker compose -f "$COMPOSE" up -d --no-build --force-recreate stirling-pdf-mcp >/dev/null 2>&1
if ! wait_up; then
    fail "Stirling did not become healthy in apikey mode"
    echo -e "${RED}Aborting.${NC}"; exit 1
fi
# In apikey mode the OAuth metadata is not served (404, or 401 from the app chain).
META_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/.well-known/oauth-protected-resource)
if [ "$META_CODE" = "404" ] || [ "$META_CODE" = "401" ]; then
    pass "apikey mode active (OAuth metadata not served -> $META_CODE)"
else
    fail "expected OAuth metadata absent in apikey mode, got $META_CODE"
fi

echo -e "${YELLOW}▶ Minting a Stirling API key for mcpuser...${NC}"
JWT=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"mcpuser@stirling.local","password":"mcppassword"}' \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [ -n "$JWT" ]; then
    pass "logged in as mcpuser (got a session token)"
else
    fail "could not log in as mcpuser - cannot mint an API key"
fi
APIKEY=$(curl -s -X POST http://localhost:8080/api/v1/user/get-api-key \
    -H "Authorization: Bearer $JWT" | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
if [ -z "$APIKEY" ]; then
    APIKEY=$(curl -s -X POST http://localhost:8080/api/v1/user/update-api-key \
        -H "Authorization: Bearer $JWT" | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
fi
if [ -n "$APIKEY" ]; then
    pass "minted an API key for mcpuser"
else
    fail "could not mint an API key"
fi
echo ""

echo -e "${YELLOW}[1] curl checks (apikey)${NC}"
NO_KEY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" -H "Content-Type: application/json" -d "$RPC_LIST")
[ "$NO_KEY" = "401" ] && pass "no key -> 401" || fail "no key -> $NO_KEY (expected 401)"
BAD_KEY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" -H "Content-Type: application/json" -H "X-API-KEY: not-a-real-key" -d "$RPC_LIST")
[ "$BAD_KEY" = "401" ] && pass "bad key -> 401" || fail "bad key -> $BAD_KEY (expected 401)"
if [ -n "$APIKEY" ]; then
    OK_CODE=$(curl -s -o /tmp/mcp_apikey_list.json -w "%{http_code}" -X POST "$MCP_URL" -H "Content-Type: application/json" -H "X-API-KEY: $APIKEY" -d "$RPC_LIST")
    if [ "$OK_CODE" = "200" ] && grep -q "stirling_describe_operation" /tmp/mcp_apikey_list.json; then
        pass "valid X-API-KEY -> 200 + tools listed"
    else
        fail "valid X-API-KEY -> $OK_CODE (tools listed? check body)"
    fi
    rm -f /tmp/mcp_apikey_list.json
fi
echo ""

echo -e "${YELLOW}[2] Real MCP SDK client (apikey / X-API-KEY)${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "   ${YELLOW}(node not installed - skipping real-client check)${NC}"
elif [ -z "$APIKEY" ]; then
    fail "skipping real-client check - no API key"
else
    [ -d "$CHECK_DIR/node_modules" ] || (cd "$CHECK_DIR" && npm install --silent --no-fund --no-audit >/dev/null 2>&1)
    if MODE=apikey MCP_URL="$MCP_URL" MCP_APIKEY="$APIKEY" node "$CHECK_DIR/check.mjs"; then
        pass "official MCP SDK client connected + validated (apikey)"
    else
        fail "official MCP SDK client could not validate the server (apikey)"
    fi
fi
echo ""

echo -e "${YELLOW}[3] Real operation execution (rotate-pdf, inline file)${NC}"
SAMPLE_PDF="$SCRIPT_DIR/../../app/common/src/test/resources/example.pdf"
if [ -z "$APIKEY" ]; then
    fail "skipping execution check - no API key"
elif [ ! -f "$SAMPLE_PDF" ]; then
    fail "sample PDF not found at $SAMPLE_PDF"
else
    B64=$(base64 -w0 "$SAMPLE_PDF" 2>/dev/null || base64 "$SAMPLE_PDF" | tr -d '\n')
    EXEC_RPC=$(printf '{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"stirling_pages","arguments":{"operation":"rotate-pdf","fileName":"example.pdf","parameters":{"angle":90},"file":"%s"}}}' "$B64")
    EXEC=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" -H "X-API-KEY: $APIKEY" -d "$EXEC_RPC")
    if echo "$EXEC" | grep -q '"isError":true'; then
        fail "rotate-pdf returned isError: $(printf '%s' "$EXEC" | head -c 300)"
    elif echo "$EXEC" | grep -q 'fileId='; then
        pass "rotate-pdf processed a real PDF over MCP and returned a result fileId"
    else
        fail "rotate-pdf returned no result fileId: $(printf '%s' "$EXEC" | head -c 300)"
    fi
fi
echo ""

echo -e "${YELLOW}▶ Restoring oauth mode...${NC}"
PREMIUM_KEY="${PREMIUM_KEY:-}" docker compose -f "$COMPOSE" up -d --no-build --force-recreate stirling-pdf-mcp >/dev/null 2>&1
wait_up && pass "restored oauth mode" || fail "Stirling not healthy after restoring oauth"
echo ""

echo -e "${BLUE}────────────────────────────────────────────────────${NC}"
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}API-key mode checks passed! ($PASS passed)${NC}"; exit 0
else
    echo -e "${RED}API-key mode validation failed: $FAIL failed, $PASS passed.${NC}"; exit 1
fi
