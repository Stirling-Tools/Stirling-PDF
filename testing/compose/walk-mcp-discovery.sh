#!/bin/bash
# Walk the MCP OAuth discovery chain exactly like a spec-compliant client:
#   1. POST the MCP endpoint unauthenticated -> 401 + WWW-Authenticate resource_metadata
#   2. Fetch the advertised metadata URL AND the client-derived RFC 9728
#      path-inserted URL (clients use either; both must serve the real document)
#   3. Pick authorization_servers[0] and resolve its metadata via RFC 8414
#      path-aware discovery, falling back to OIDC discovery
#   4. Report authorize/token/registration endpoints; flag missing DCR support
#
# Usage: MCP_URL=https://host/mcp bash walk-mcp-discovery.sh
# Exits non-zero if discovery would strand a client (the fall-back-to-origin bug).

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
MCP_URL="${MCP_URL:-http://localhost:8080/mcp}"

PASS=0; FAIL=0; WARN=0
pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗ $1${NC}"; FAIL=$((FAIL + 1)); }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; WARN=$((WARN + 1)); }

PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
json_get() { # json_get <file> <expr>, e.g. '.get("authorization_servers",[None])[0]'
    "$PY" -c "import json,sys;d=json.load(open(sys.argv[1]));v=eval('d'+sys.argv[2]);print(v if v is not None else '')" "$1" "$2" 2>/dev/null
}

ORIGIN=$(echo "$MCP_URL" | sed -E 's#^(https?://[^/]+).*#\1#')
RESOURCE_PATH=$(echo "$MCP_URL" | sed -E 's#^https?://[^/]+##')

echo -e "${BLUE}MCP discovery walk for:${NC} $MCP_URL"
echo ""

echo -e "${YELLOW}[1] Unauthenticated challenge${NC}"
HDRS=$(curl -s -o /dev/null -D - --max-time 15 -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')
CODE=$(echo "$HDRS" | head -1 | grep -o '[0-9][0-9][0-9]' | head -1)
[ "$CODE" = "401" ] && pass "POST $MCP_URL -> 401" || fail "POST $MCP_URL -> $CODE (expected 401)"
ADVERTISED=$(echo "$HDRS" | tr -d '\r' | grep -i '^WWW-Authenticate:' | sed -n 's/.*resource_metadata="\([^"]*\)".*/\1/p')
if [ -n "$ADVERTISED" ]; then
    pass "WWW-Authenticate advertises resource_metadata: $ADVERTISED"
else
    fail "no resource_metadata in WWW-Authenticate header"
fi
echo ""

echo -e "${YELLOW}[2] Protected resource metadata (advertised + path-inserted)${NC}"
DERIVED="$ORIGIN/.well-known/oauth-protected-resource$RESOURCE_PATH"
AS_URL=""
for URL in "$ADVERTISED" "$DERIVED"; do
    [ -z "$URL" ] && continue
    BODY_FILE=$(mktemp)
    HTTP=$(curl -s -o "$BODY_FILE" -w "%{http_code}" --max-time 15 "$URL")
    if [ "$HTTP" != "200" ]; then
        fail "GET $URL -> $HTTP (expected 200)"
        continue
    fi
    AS=$(json_get "$BODY_FILE" '.get("authorization_servers",[None])[0]')
    RES=$(json_get "$BODY_FILE" '.get("resource")')
    if [ -n "$AS" ]; then
        pass "GET $URL -> resource=$RES, authorization_server=$AS"
        AS_URL="$AS"
    else
        fail "GET $URL has NO authorization_servers - a client using this URL falls back to $ORIGIN as its OAuth server"
    fi
done
echo ""

echo -e "${YELLOW}[3] Authorization server metadata (RFC 8414 / OIDC)${NC}"
if [ -z "$AS_URL" ]; then
    fail "no authorization server discovered; cannot continue"
else
    AS_ORIGIN=$(echo "$AS_URL" | sed -E 's#^(https?://[^/]+).*#\1#')
    AS_PATH=$(echo "$AS_URL" | sed -E 's#^https?://[^/]+##')
    ASM_FILE=$(mktemp)
    FOUND=""
    for CAND in \
        "$AS_ORIGIN/.well-known/oauth-authorization-server$AS_PATH" \
        "$AS_ORIGIN/.well-known/openid-configuration$AS_PATH" \
        "$AS_URL/.well-known/openid-configuration"; do
        HTTP=$(curl -s -o "$ASM_FILE" -w "%{http_code}" --max-time 15 "$CAND")
        ISS=$(json_get "$ASM_FILE" '.get("issuer")')
        if [ "$HTTP" = "200" ] && [ -n "$ISS" ]; then
            pass "AS metadata found at $CAND"
            FOUND=1
            break
        fi
    done
    if [ -z "$FOUND" ]; then
        fail "no AS metadata at any well-known location for $AS_URL"
    else
        AUTHZ=$(json_get "$ASM_FILE" '.get("authorization_endpoint")')
        TOKEN=$(json_get "$ASM_FILE" '.get("token_endpoint")')
        REG=$(json_get "$ASM_FILE" '.get("registration_endpoint")')
        SCOPES=$(json_get "$ASM_FILE" '.get("scopes_supported")')
        [ -n "$AUTHZ" ] && pass "authorization_endpoint: $AUTHZ" || fail "no authorization_endpoint"
        [ -n "$TOKEN" ] && pass "token_endpoint: $TOKEN" || fail "no token_endpoint"
        if [ -n "$REG" ]; then
            pass "registration_endpoint: $REG (dynamic client registration available)"
        else
            warn "no registration_endpoint - clients needing DCR (Claude etc.) cannot self-register; pre-register a client or enable DCR on the IdP"
        fi
        echo -e "    ${BLUE}scopes_supported:${NC} $SCOPES"
        case "$SCOPES" in
            *mcp.tools*) pass "IdP can issue mcp.tools.* scopes" ;;
            *) warn "IdP does not advertise mcp.tools.* scopes - run Stirling with MCP_SCOPESENABLED=false or add the scopes to the IdP" ;;
        esac
    fi
fi
echo ""

echo -e "${BLUE}Results: ${GREEN}$PASS passed${NC}, ${YELLOW}$WARN warnings${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] || exit 1
