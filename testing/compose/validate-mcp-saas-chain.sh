#!/bin/bash
# Validate MCP OAuth discovery when the saas profile is active, i.e. when the
# Supabase security chain coexists with the MCP chain. Guards the regression
# where /.well-known/oauth-protected-resource/<subpath> fell through to the
# Supabase chain's default Spring Security metadata filter and was served
# WITHOUT authorization_servers, sending MCP clients to Stirling for OAuth.
#
# Prereq: docker-compose -f docker-compose-saas.yml -f docker-compose-saas-mcp.override.yml up
# Env:    MCP_AUTH_ISSUERURI must match the issuer the stack was started with.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:8080}"
ISSUER="${MCP_AUTH_ISSUERURI:-https://auth.example.com}"
PRM_URL="$BASE_URL/.well-known/oauth-protected-resource"
MCP_URL="$BASE_URL/mcp"

PASS=0
FAIL=0
pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL + 1)); }

echo -e "${BLUE}Validating MCP discovery with the saas profile (two-chain interplay)${NC}"
echo -e "${BLUE}Issuer:${NC} $ISSUER"
echo ""

echo -e "${YELLOW}[0] Liveness${NC}"
if curl -sf "$BASE_URL/api/v1/info/status" 2>/dev/null | grep -q "UP"; then
    pass "Stirling PDF (saas flavor) is UP"
else
    fail "Stirling PDF is not UP at $BASE_URL"
fi
echo ""

echo -e "${YELLOW}[1] Root metadata document${NC}"
ROOT_CODE=$(curl -s -o /tmp/saas_prm_root.json -w "%{http_code}" "$PRM_URL")
ROOT_BODY=$(cat /tmp/saas_prm_root.json 2>/dev/null)
[ "$ROOT_CODE" = "200" ] && pass "GET $PRM_URL -> 200" || fail "GET $PRM_URL -> $ROOT_CODE"
if echo "$ROOT_BODY" | grep -q "\"authorization_servers\"" && echo "$ROOT_BODY" | grep -qF "$ISSUER"; then
    pass "root metadata advertises the configured authorization server"
else
    fail "root metadata missing authorization_servers/issuer: $ROOT_BODY"
fi
echo ""

echo -e "${YELLOW}[2] Path-inserted metadata document (the regression)${NC}"
SUB_CODE=$(curl -s -o /tmp/saas_prm_sub.json -w "%{http_code}" "$PRM_URL/mcp")
SUB_BODY=$(cat /tmp/saas_prm_sub.json 2>/dev/null)
[ "$SUB_CODE" = "200" ] && pass "GET $PRM_URL/mcp -> 200" || fail "GET $PRM_URL/mcp -> $SUB_CODE"
if echo "$SUB_BODY" | grep -q "\"authorization_servers\"" && echo "$SUB_BODY" | grep -qF "$ISSUER"; then
    pass "path-inserted metadata served by the MCP chain (authorization_servers present)"
else
    fail "path-inserted metadata fell through to the Supabase chain default filter: $SUB_BODY"
fi
if echo "$SUB_BODY" | grep -q "mcp.tools.read"; then
    pass "path-inserted metadata advertises mcp.tools scopes"
else
    fail "path-inserted metadata missing mcp.tools scopes"
fi
echo ""

echo -e "${YELLOW}[3] 401 challenge points at the path-inserted metadata URL${NC}"
HDRS=$(curl -s -o /dev/null -D - -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')
CODE=$(echo "$HDRS" | head -1 | grep -o '[0-9][0-9][0-9]')
[ "$CODE" = "401" ] && pass "POST /mcp with no token -> 401" || fail "POST /mcp no token -> $CODE (expected 401)"
if echo "$HDRS" | grep -i '^WWW-Authenticate:' | grep -q 'oauth-protected-resource/mcp'; then
    pass "WWW-Authenticate advertises resource_metadata at the path-inserted URL"
else
    fail "WWW-Authenticate header wrong: $(echo "$HDRS" | grep -i '^WWW-Authenticate:')"
fi
echo ""

echo -e "${YELLOW}[4] Chain isolation${NC}"
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/user/me")
if [ "$API_CODE" = "401" ] || [ "$API_CODE" = "403" ] || [ "$API_CODE" = "404" ]; then
    pass "Supabase chain still guards regular API routes ($API_CODE)"
else
    fail "Unexpected status on regular API route: $API_CODE"
fi
GARBAGE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer not-a-jwt" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')
[ "$GARBAGE" = "401" ] && pass "garbage bearer token at /mcp -> 401" || fail "garbage token -> $GARBAGE"
echo ""

echo -e "${BLUE}Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] || exit 1
