#!/bin/bash
# Validate the Keycloak MCP OAuth2 resource-server path end-to-end against a real Keycloak.
# Runs every check (no set -e) and exits non-zero if anything failed.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_HOST="${KEYCLOAK_HOST:-kubernetes.docker.internal}"
REALM="stirling-mcp"
CLIENT_ID="mcp-test-client"
CLIENT_SECRET="mcp-test-secret"
MCP_URL="http://localhost:8080/mcp"
PRM_URL="http://localhost:8080/.well-known/oauth-protected-resource"

PASS=0
FAIL=0
pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL + 1)); }

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Validating MCP Test Environment          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Pick a Keycloak base URL that resolves from this host (both share KC_HOSTNAME issuer).
KC_BASE="http://${KEYCLOAK_HOST}:9080"
if ! curl -sf --max-time 3 "$KC_BASE/realms/$REALM" >/dev/null 2>&1; then
    KC_BASE="http://localhost:9080"
fi
TOKEN_URL="$KC_BASE/realms/$REALM/protocol/openid-connect/token"
echo -e "${BLUE}Using Keycloak base:${NC} $KC_BASE"
echo ""

# liveness
echo -e "${YELLOW}[0] Liveness${NC}"
if curl -sf "$KC_BASE/realms/$REALM" > /dev/null 2>&1; then
    pass "Keycloak realm '$REALM' reachable"
else
    fail "Keycloak realm '$REALM' not reachable - is the stack up?"
fi
if curl -sf "$KC_BASE/realms/$REALM/.well-known/openid-configuration" > /dev/null 2>&1; then
    pass "Keycloak OIDC discovery reachable"
else
    fail "Keycloak OIDC discovery not reachable"
fi
if curl -sf http://localhost:8080/api/v1/info/status 2>/dev/null | grep -q "UP"; then
    pass "Stirling PDF is UP"
else
    fail "Stirling PDF is not UP"
fi
echo ""

# protected-resource metadata (RFC 9728)
echo -e "${YELLOW}[1] Protected-resource metadata (RFC 9728)${NC}"
PRM=$(curl -s -o /tmp/mcp_prm.json -w "%{http_code}" "$PRM_URL")
PRM_BODY=$(cat /tmp/mcp_prm.json 2>/dev/null)
if [ "$PRM" = "200" ]; then
    pass "GET $PRM_URL -> 200 (publicly discoverable)"
else
    fail "GET $PRM_URL -> $PRM (expected 200)"
fi
if echo "$PRM_BODY" | grep -q '"resource"'; then
    pass "metadata advertises a 'resource' id"
else
    fail "metadata missing 'resource' id"
fi
if echo "$PRM_BODY" | grep -q "realms/$REALM"; then
    pass "metadata points clients at the Keycloak authorization server"
else
    fail "metadata missing the Keycloak authorization server (realms/$REALM)"
fi
if echo "$PRM_BODY" | grep -q "mcp.tools"; then
    pass "metadata advertises mcp.tools scopes"
else
    fail "metadata missing mcp.tools scopes"
fi

# RFC 9728 path-inserted form: clients derive {origin}/.well-known/oauth-protected-resource/mcp
# for a resource at /mcp. This must serve the SAME customized metadata; a default document here
# (no authorization_servers) makes clients fall back to treating Stirling as its own AS.
PRM_SUB=$(curl -s -o /tmp/mcp_prm_sub.json -w "%{http_code}" "${PRM_URL}/mcp")
PRM_SUB_BODY=$(cat /tmp/mcp_prm_sub.json 2>/dev/null)
if [ "$PRM_SUB" = "200" ]; then
    pass "GET ${PRM_URL}/mcp -> 200 (RFC 9728 path-inserted form)"
else
    fail "GET ${PRM_URL}/mcp -> $PRM_SUB (expected 200)"
fi
if echo "$PRM_SUB_BODY" | grep -q "realms/$REALM"; then
    pass "path-inserted metadata advertises the Keycloak authorization server"
else
    fail "path-inserted metadata missing authorization_servers (filter-chain fall-through regression)"
fi
WWW_AUTH=$(curl -s -o /dev/null -D - -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | grep -i '^WWW-Authenticate:')
if echo "$WWW_AUTH" | grep -q 'oauth-protected-resource/mcp'; then
    pass "401 WWW-Authenticate advertises the path-inserted metadata URL"
else
    fail "401 WWW-Authenticate lacks the path-inserted metadata URL: $WWW_AUTH"
fi
echo ""

# unauthenticated access is rejected
echo -e "${YELLOW}[2] Unauthenticated requests are rejected${NC}"
RPC_LIST='{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
NO_TOKEN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" -d "$RPC_LIST")
if [ "$NO_TOKEN" = "401" ]; then
    pass "POST /mcp with no token -> 401"
else
    fail "POST /mcp with no token -> $NO_TOKEN (expected 401)"
fi
BAD_TOKEN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer not-a-real-jwt" -d "$RPC_LIST")
if [ "$BAD_TOKEN" = "401" ]; then
    pass "POST /mcp with garbage token -> 401"
else
    fail "POST /mcp with garbage token -> $BAD_TOKEN (expected 401)"
fi
echo ""

# fetch a real user token from Keycloak (password grant)
echo -e "${YELLOW}[3] Fetch a real access token from Keycloak (mcpuser)${NC}"
get_token() {
    # $1 username, $2 password -> access_token (empty on failure)
    curl -s -X POST "$TOKEN_URL" \
        --data-urlencode "grant_type=password" \
        --data-urlencode "client_id=$CLIENT_ID" \
        --data-urlencode "client_secret=$CLIENT_SECRET" \
        --data-urlencode "username=$1" \
        --data-urlencode "password=$2" \
        --data-urlencode "scope=openid email mcp.tools.read mcp.tools.write" \
        | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
USER_TOKEN=$(get_token "mcpuser@stirling.local" "mcppassword")
if [ -n "$USER_TOKEN" ]; then
    pass "Obtained access token for mcpuser@stirling.local"
else
    fail "Could not obtain access token for mcpuser@stirling.local (check Keycloak/client)"
fi
echo ""

# authenticated tools/list (account-binding succeeds)
echo -e "${YELLOW}[4] Authenticated MCP access (provisioned user)${NC}"
if [ -n "$USER_TOKEN" ]; then
    LIST_CODE=$(curl -s -o /tmp/mcp_list.json -w "%{http_code}" -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" -d "$RPC_LIST")
    LIST_BODY=$(cat /tmp/mcp_list.json 2>/dev/null)
    if [ "$LIST_CODE" = "200" ]; then
        pass "POST /mcp tools/list with valid token -> 200"
    else
        fail "POST /mcp tools/list with valid token -> $LIST_CODE (expected 200)"
    fi
    for t in stirling_describe_operation stirling_convert stirling_pages stirling_misc stirling_security; do
        if echo "$LIST_BODY" | grep -q "\"$t\""; then
            pass "tools/list advertises $t"
        else
            fail "tools/list missing $t"
        fi
    done
else
    fail "Skipping authenticated checks - no user token"
fi
echo ""

# tools/call stirling_describe_operation
echo -e "${YELLOW}[5] Deep schema via stirling_describe_operation${NC}"
if [ -n "$USER_TOKEN" ]; then
    OP=$(echo "$LIST_BODY" | grep -oE '"enum":\[[^]]+\]' | head -1 | grep -oE '"[^"]+"' | sed -n '2p' | tr -d '"')
    if [ -n "$OP" ]; then
        echo -e "    ${BLUE}using operation:${NC} $OP"
        DESC_RPC="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"stirling_describe_operation\",\"arguments\":{\"operation\":\"$OP\"}}}"
        DESC_CODE=$(curl -s -o /tmp/mcp_desc.json -w "%{http_code}" -X POST "$MCP_URL" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $USER_TOKEN" -d "$DESC_RPC")
        DESC_BODY=$(cat /tmp/mcp_desc.json 2>/dev/null)
        if [ "$DESC_CODE" = "200" ] && echo "$DESC_BODY" | grep -q "parametersSchema"; then
            pass "describe_operation('$OP') returned a parameters schema"
        else
            fail "describe_operation('$OP') -> $DESC_CODE (no parametersSchema in body)"
        fi
    else
        fail "Could not extract an operation id from tools/list (no enabled ops?)"
    fi
else
    fail "Skipping describe check - no user token"
fi
echo ""

# account-binding: valid Keycloak user with no Stirling account -> 403
echo -e "${YELLOW}[6] Account-binding rejects users without a Stirling account${NC}"
GHOST_TOKEN=$(get_token "ghost@stirling.local" "ghostpassword")
if [ -n "$GHOST_TOKEN" ]; then
    pass "Obtained a valid Keycloak token for ghost@stirling.local"
    GHOST_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $GHOST_TOKEN" -d "$RPC_LIST")
    if [ "$GHOST_CODE" = "403" ]; then
        pass "Valid token, no Stirling account -> 403 (account-binding enforced)"
    else
        fail "ghost user -> $GHOST_CODE (expected 403)"
    fi
else
    fail "Could not obtain a token for ghost@stirling.local (cannot test account-binding)"
fi
echo ""

# hardening: bad tokens & endpoint isolation
echo -e "${YELLOW}[7] Hardening - bad tokens & endpoint isolation${NC}"

b64url() { printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '='; }

# unsigned alg:none token must be rejected
NONE_JWT="$(b64url '{"alg":"none","typ":"JWT"}').$(b64url '{"sub":"mcpuser","iss":"http://kubernetes.docker.internal:9080/realms/stirling-mcp","aud":"http://localhost:8080/mcp","email":"mcpuser@stirling.local","scope":"mcp.tools.read mcp.tools.write","exp":9999999999}')."
NONE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $NONE_JWT" -d "$RPC_LIST")
if [ "$NONE_CODE" = "401" ] || [ "$NONE_CODE" = "400" ]; then
    pass "Unsigned alg:none token -> $NONE_CODE (rejected; a real signature is required)"
else
    fail "alg:none token -> $NONE_CODE (expected 400/401)"
fi

# valid token minted for a different audience must be rejected (RFC 8707)
WRONG_AUD=$(curl -s -X POST "$TOKEN_URL" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=other-client" \
    --data-urlencode "username=mcpuser@stirling.local" \
    --data-urlencode "password=mcppassword" \
    --data-urlencode "scope=openid email" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [ -n "$WRONG_AUD" ]; then
    WA_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
        -H "Content-Type: application/json" -H "Authorization: Bearer $WRONG_AUD" -d "$RPC_LIST")
    if [ "$WA_CODE" = "401" ]; then
        pass "Valid token, wrong audience -> 401 (RFC 8707 audience binding)"
    else
        fail "wrong-audience token -> $WA_CODE (expected 401)"
    fi
else
    fail "Could not mint a wrong-audience token from other-client"
fi

if [ -n "$USER_TOKEN" ]; then
    # the /mcp guard covers every method: GET without a token -> 401
    GET_NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$MCP_URL")
    if [ "$GET_NOAUTH" = "401" ]; then
        pass "GET /mcp with no token -> 401 (chain guards all methods, not just POST)"
    else
        fail "GET /mcp no token -> $GET_NOAUTH (expected 401)"
    fi

    # unknown JSON-RPC method is refused with -32601
    UNK=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" \
        -d '{"jsonrpc":"2.0","id":9,"method":"admin/deleteEverything"}')
    if echo "$UNK" | grep -q "32601"; then
        pass "Unknown JSON-RPC method -> error -32601 (not dispatched)"
    else
        fail "Unknown method not rejected as expected: $UNK"
    fi

    # isolation: the MCP token must not unlock admin endpoints
    ADM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET \
        "http://localhost:8080/api/v1/admin/settings" \
        -H "Authorization: Bearer $USER_TOKEN")
    if [ "$ADM_CODE" = "401" ] || [ "$ADM_CODE" = "403" ] || [ "$ADM_CODE" = "302" ]; then
        pass "MCP token on /api/v1/admin/settings -> $ADM_CODE (no cross-endpoint access)"
    else
        fail "MCP token reached an admin endpoint -> $ADM_CODE (expected 401/403/302)"
    fi
else
    fail "Skipping method/isolation checks - no user token"
fi
echo ""

# regression checks
echo -e "${YELLOW}[8] Regression checks${NC}"
if [ -n "$USER_TOKEN" ]; then
    # a PDF category tool must return an honest error (isError), not a fake success
    CAT=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" \
        -d '{"jsonrpc":"2.0","id":81,"method":"tools/call","params":{"name":"stirling_security","arguments":{"operation":"add-password"}}}')
    if echo "$CAT" | grep -q '"isError":true'; then
        pass "category tool returns isError, not a fake success"
    else
        fail "category tool did not return isError: $CAT"
    fi

    # malformed JSON -> JSON-RPC parse error (-32700) envelope
    MAL=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" -d '{ not valid json ')
    if echo "$MAL" | grep -q "32700"; then
        pass "malformed JSON -> -32700 envelope"
    else
        fail "malformed JSON not enveloped as -32700: $MAL"
    fi

    # valid JSON but wrong shape -> invalid request (-32600)
    WS=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" -d '{"hello":"world"}')
    if echo "$WS" | grep -q "32600"; then
        pass "wrong-shape JSON -> -32600"
    else
        fail "wrong-shape JSON wrong error code: $WS"
    fi

    # initialize echoes the client protocolVersion (negotiation)
    INIT=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" \
        -d '{"jsonrpc":"2.0","id":82,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}')
    if echo "$INIT" | grep -q '"protocolVersion":"2025-03-26"'; then
        pass "initialize negotiates the client's protocolVersion"
    else
        fail "initialize did not echo client protocolVersion: $INIT"
    fi
else
    fail "Skipping regression checks - no user token"
fi

# chunked body (no Content-Length) over the cap -> 413, pre-auth
CHUNK=$( { printf '{"jsonrpc":"2.0","id":1,"method":"x","params":"'; head -c 300000 /dev/zero | tr '\0' A; printf '"}'; } \
    | curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
        -H "Content-Type: application/json" -H "Transfer-Encoding: chunked" --data-binary @- )
if [ "$CHUNK" = "413" ]; then
    pass "chunked oversized body -> 413"
else
    fail "chunked oversized body -> $CHUNK (expected 413)"
fi

# behind a proxy, the 401 resource_metadata URL must honour X-Forwarded-*
WWW=$(curl -s -D - -o /dev/null -X POST "$MCP_URL" -H "Content-Type: application/json" \
    -H "X-Forwarded-Proto: https" -H "X-Forwarded-Host: mcp.example.com" -d "$RPC_LIST" \
    | tr -d '\r' | grep -i "^www-authenticate:")
if echo "$WWW" | grep -q "https://mcp.example.com/.well-known/oauth-protected-resource"; then
    pass "401 resource_metadata honours X-Forwarded-*"
else
    fail "resource_metadata ignored forwarded headers: $WWW"
fi
echo ""

# CORS for browser-based MCP clients
echo -e "${YELLOW}[9] CORS (browser MCP clients)${NC}"
ORIGIN="http://127.0.0.1:6274"
PF=$(curl -s -D - -o /dev/null -X OPTIONS "$MCP_URL" \
    -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type" | tr -d '\r')
PF_CODE=$(printf '%s' "$PF" | sed -n 's#^HTTP/[0-9.]* \([0-9][0-9][0-9]\).*#\1#p' | head -1)
if printf '%s' "$PF_CODE" | grep -qE '^2'; then
    pass "OPTIONS /mcp preflight -> $PF_CODE (not 401 - browsers can call /mcp)"
else
    fail "OPTIONS /mcp preflight -> $PF_CODE (expected 2xx)"
fi
if printf '%s' "$PF" | grep -qi "access-control-allow-origin"; then
    pass "preflight advertises Access-Control-Allow-Origin"
else
    fail "preflight missing Access-Control-Allow-Origin"
fi
if curl -s -D - -o /dev/null -H "Origin: $ORIGIN" "$PRM_URL" | tr -d '\r' | grep -qi "access-control-allow-origin"; then
    pass "protected-resource metadata sends Access-Control-Allow-Origin (browser-readable)"
else
    fail "metadata missing Access-Control-Allow-Origin (browser can't read discovery)"
fi
echo ""

# real MCP client (official @modelcontextprotocol/sdk)
echo -e "${YELLOW}[10] Real MCP SDK client (not just curl)${NC}"
CHECK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mcp-client-check"
if ! command -v node >/dev/null 2>&1; then
    echo -e "   ${YELLOW}(node not installed - skipping real-client check)${NC}"
elif [ -z "$USER_TOKEN" ]; then
    fail "skipping real-client check - no user token"
else
    if [ ! -d "$CHECK_DIR/node_modules" ]; then
        echo "   installing MCP SDK (first run)..."
        (cd "$CHECK_DIR" && npm install --silent --no-fund --no-audit >/dev/null 2>&1)
    fi
    if MODE=oauth MCP_URL="$MCP_URL" MCP_BEARER="$USER_TOKEN" node "$CHECK_DIR/check.mjs"; then
        pass "official MCP SDK client connected + validated over streamable HTTP (oauth)"
    else
        fail "official MCP SDK client could not validate the server (oauth)"
    fi
fi
echo ""

# real operation execution (rotate a real PDF, inline)
echo -e "${YELLOW}[11] Real operation execution (rotate-pdf, inline file)${NC}"
SAMPLE_PDF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../app/common/src/test/resources/example.pdf"
if [ -z "$USER_TOKEN" ]; then
    fail "skipping execution check - no user token"
elif [ ! -f "$SAMPLE_PDF" ]; then
    fail "sample PDF not found at $SAMPLE_PDF"
else
    B64=$(base64 -w0 "$SAMPLE_PDF" 2>/dev/null || base64 "$SAMPLE_PDF" | tr -d '\n')
    EXEC_RPC=$(printf '{"jsonrpc":"2.0","id":91,"method":"tools/call","params":{"name":"stirling_pages","arguments":{"operation":"rotate-pdf","fileName":"example.pdf","parameters":{"angle":90},"file":"%s"}}}' "$B64")
    EXEC=$(curl -s -X POST "$MCP_URL" -H "Content-Type: application/json" \
        -H "Authorization: Bearer $USER_TOKEN" -d "$EXEC_RPC")
    if echo "$EXEC" | grep -q '"isError":true'; then
        fail "rotate-pdf returned isError: $(printf '%s' "$EXEC" | head -c 300)"
    elif echo "$EXEC" | grep -q 'fileId='; then
        pass "rotate-pdf processed a real PDF over MCP and returned a result fileId"
    else
        fail "rotate-pdf returned no result fileId: $(printf '%s' "$EXEC" | head -c 300)"
    fi
fi
echo ""

# summary
rm -f /tmp/mcp_prm.json /tmp/mcp_list.json /tmp/mcp_desc.json 2>/dev/null
echo -e "${BLUE}────────────────────────────────────────────────────${NC}"
if [ "$FAIL" -eq 0 ]; then
    echo -e "${GREEN}All MCP environment checks passed! ($PASS passed)${NC}"
    exit 0
else
    echo -e "${RED}MCP validation failed: $FAIL failed, $PASS passed.${NC}"
    exit 1
fi
