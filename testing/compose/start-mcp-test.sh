#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Manual-testing panel: generic "connect your MCP client" settings.
print_manual_panel() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       MCP MANUAL TESTING - connect a client       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Add an MCP server in your client with these settings:${NC}"
    echo ""
    echo -e "   Server URL        ${YELLOW}http://localhost:8080/mcp${NC}"
    echo -e "   Connection type   ${YELLOW}HTTP${NC} (streamable HTTP)"
    echo -e "   Authentication    ${YELLOW}OAuth 2.0${NC}"
    echo -e "   OAuth scopes      ${YELLOW}mcp.tools.read mcp.tools.write${NC}"
    echo -e "   OAuth client id   ${YELLOW}mcp-client${NC}  (public - leave the client secret blank)"
    echo ""
    echo -e "   ${BLUE}The client redirects you to a sign-in page; log in with:${NC}"
    echo -e "     ${YELLOW}mcpuser@stirling.local${NC} / ${YELLOW}mcppassword${NC}"
    echo ""
    echo -e "${BLUE}Stop:${NC} docker-compose -f docker-compose-keycloak-mcp.yml down -v"
    echo ""
}

# Manual API-key panel: mint a Stirling per-user key and print header-based client settings.
print_manual_panel_apikey() {
    local jwt key
    jwt=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"mcpuser@stirling.local","password":"mcppassword"}' \
        | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
    # Reuse the user's existing key if any; else create one.
    key=$(curl -s -X POST http://localhost:8080/api/v1/user/get-api-key \
        -H "Authorization: Bearer $jwt" \
        | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
    if [ -z "$key" ]; then
        key=$(curl -s -X POST http://localhost:8080/api/v1/user/update-api-key \
            -H "Authorization: Bearer $jwt" \
            | sed -n 's/.*"apiKey":"\([^"]*\)".*/\1/p')
    fi

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   MCP MANUAL TESTING - API KEY (no OAuth / no IdP) ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Add an MCP server in your client with these settings:${NC}"
    echo ""
    echo -e "   Server URL        ${YELLOW}http://localhost:8080/mcp${NC}"
    echo -e "   Connection type   ${YELLOW}HTTP${NC} (streamable HTTP)"
    echo -e "   Authentication    ${YELLOW}None${NC}  (no OAuth - just a header)"
    if [ -n "$key" ]; then
        echo -e "   Custom header     ${YELLOW}X-API-KEY: $key${NC}"
    else
        echo -e "   ${RED}(could not mint a key automatically; is the stack up in apikey mode?)${NC}"
    fi
    echo ""
    echo -e "   ${BLUE}No browser redirect, no IdP. The key maps to ${YELLOW}mcpuser@stirling.local${BLUE} and${NC}"
    echo -e "   ${BLUE}every call is audited as that user. Use this when a client's OAuth can't reach localhost.${NC}"
    echo ""
    echo -e "${BLUE}Stop:${NC} docker-compose -f docker-compose-keycloak-mcp.yml down -v"
    echo ""
}

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Stirling PDF + Keycloak MCP Test Environment   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

COMPOSE_UP_ARGS=(-d --build)
RUN_VALIDATE=false
MANUAL=false
APIKEY_MODE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --nobuild)
            COMPOSE_UP_ARGS=(-d)
            shift
            ;;
        --validate)
            RUN_VALIDATE=true
            shift
            ;;
        --manual)
            MANUAL=true
            shift
            ;;
        --apikey)
            # API-key manual testing mode (no OAuth/IdP), with a freshly minted key.
            APIKEY_MODE=true
            MANUAL=true
            export MCP_AUTH_MODE=apikey
            shift
            ;;
        --license-key)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Missing value for --license-key${NC}"
                exit 1
            fi
            export PREMIUM_KEY="$2"
            shift 2
            ;;
        --license-key=*)
            export PREMIUM_KEY="${1#*=}"
            shift
            ;;
        -k)
            if [[ -z "${2:-}" ]]; then
                echo -e "${RED}Missing value for -k${NC}"
                exit 1
            fi
            export PREMIUM_KEY="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--nobuild] [--validate] [--manual] [--apikey] [--license-key <KEY>]"
            echo ""
            echo "  --nobuild             Skip building images (use existing images)"
            echo "  --validate            Run validate-mcp-test.sh after the stack is up"
            echo "  --manual              Manual testing mode (OAuth): bring the stack up and print"
            echo "                        copy-paste client settings for the OAuth flow."
            echo "  --apikey              Manual testing mode (API key): bring Stirling up in apikey"
            echo "                        mode (no OAuth/IdP), mint a key, and print client settings."
            echo "                        Ideal for clients whose OAuth can't reach localhost."
            echo "  --license-key <KEY>   Premium license key (skips the interactive prompt)"
            echo "                        Equivalent to setting PREMIUM_KEY in the environment."
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Keycloak issuer hostname (must resolve on host + containers)
KEYCLOAK_HOST="${KEYCLOAK_HOST:-kubernetes.docker.internal}"
export KEYCLOAK_HOST

# Preflight: the host must resolve the issuer hostname.
if [ "${SKIP_MCP_PREFLIGHT:-false}" != "true" ]; then
    if ! curl -sf --connect-timeout 2 --max-time 3 "http://${KEYCLOAK_HOST}:9080/realms/stirling-mcp" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠ Cannot reach http://${KEYCLOAK_HOST}:9080 from this machine yet.${NC}"
        echo -e "${YELLOW}  That is expected before the stack is up. If validation later fails to${NC}"
        echo -e "${YELLOW}  resolve the host, add a hosts entry pointing ${KEYCLOAK_HOST} to 127.0.0.1:${NC}"
        echo ""
        echo -e "${BLUE}Windows:${NC}  C:\\Windows\\System32\\drivers\\etc\\hosts"
        echo -e "${BLUE}macOS/Linux:${NC}  /etc/hosts"
        echo ""
        echo -e "${GREEN}127.0.0.1 ${KEYCLOAK_HOST}${NC}"
        echo ""
    fi
fi

# Prompt for license key (optional).
if [ -z "$PREMIUM_KEY" ]; then
    echo -e "${YELLOW}Enter license key (press Enter to use default test key):${NC}"
    read -r LICENSE_INPUT
    if [ -n "$LICENSE_INPUT" ]; then
        export PREMIUM_KEY="$LICENSE_INPUT"
        echo -e "${GREEN}✓ Using provided license key${NC}"
    else
        echo -e "${BLUE}Using default test license key${NC}"
    fi
    echo ""
fi

echo -e "${YELLOW}▶ Starting Keycloak (MCP) containers...${NC}"
docker-compose -f docker-compose-keycloak-mcp.yml up "${COMPOSE_UP_ARGS[@]}" keycloak-mcp-db keycloak-mcp

echo ""
echo -e "${YELLOW}▶ Waiting for Keycloak (MCP)...${NC}"
MAX_WAIT=180
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:9080/realms/stirling-mcp > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Keycloak is ready${NC}"
        break
    fi
    echo -n "."
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}✗ Keycloak failed to start${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}▶ Starting Stirling PDF (MCP resource server)...${NC}"
docker-compose -f docker-compose-keycloak-mcp.yml up "${COMPOSE_UP_ARGS[@]}" stirling-pdf-mcp

echo ""
echo -e "${YELLOW}▶ Waiting for Stirling PDF...${NC}"
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:8080/api/v1/info/status 2>/dev/null | grep -q "UP"; then
        echo -e "${GREEN}✓ Stirling PDF is ready${NC}"
        break
    fi
    echo -n "."
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo -e "${RED}✗ Stirling PDF failed to start${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           MCP Test Environment Ready! ✓           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}🔑 Auth mode:${NC} ${GREEN}${MCP_AUTH_MODE:-oauth}${NC}"
echo ""
echo -e "${BLUE}📍 Services:${NC}"
echo -e "   Stirling PDF:   ${GREEN}http://localhost:8080${NC}"
echo -e "   MCP endpoint:   ${GREEN}http://localhost:8080/mcp${NC}"
if [ "$APIKEY_MODE" != true ]; then
    echo -e "   PRM metadata:   ${GREEN}http://localhost:8080/.well-known/oauth-protected-resource${NC}"
fi
echo -e "   Keycloak Admin: ${GREEN}http://${KEYCLOAK_HOST}:9080/admin${NC} (admin / admin)"
echo ""
echo -e "${BLUE}👤 Test user (exists in Keycloak AND as a Stirling account):${NC}"
echo -e "     Email:    ${GREEN}mcpuser@stirling.local${NC}"
echo -e "     Password: ${GREEN}mcppassword${NC}"
echo ""
if [ "$APIKEY_MODE" != true ]; then
    echo -e "${BLUE}👻 Negative-test user (valid Keycloak login, NO Stirling account):${NC}"
    echo -e "     Email:    ${GREEN}ghost@stirling.local${NC}"
    echo -e "     Password: ${GREEN}ghostpassword${NC}   (expect HTTP 403 at /mcp)"
    echo ""
    echo -e "${BLUE}🔐 OAuth clients:${NC}"
    echo -e "     public (for MCP clients): ${GREEN}mcp-client${NC} (authcode + PKCE, no secret)"
    echo -e "     confidential (scripts):   ${GREEN}mcp-test-client${NC} / ${GREEN}mcp-test-secret${NC}"
    echo ""
fi
if [ "$APIKEY_MODE" = true ]; then
    echo -e "${BLUE}🧪 Automated validation (apikey):${NC}"
    echo -e "   bash testing/compose/validate-mcp-apikey.sh"
else
    echo -e "${BLUE}🧪 Automated validation (no token 401, valid token 200, ghost 403):${NC}"
    echo -e "   bash testing/compose/validate-mcp-test.sh"
fi
echo ""
echo -e "${BLUE}🔌 Connect an MCP client:  re-run with ${GREEN}--manual${NC} (OAuth) or ${GREEN}--apikey${NC} (header).${NC}"
echo ""
echo -e "${BLUE}📊 View logs:${NC}"
echo -e "   docker-compose -f docker-compose-keycloak-mcp.yml logs -f"
echo ""
echo -e "${BLUE}⏹  Stop:${NC}"
echo -e "   docker-compose -f docker-compose-keycloak-mcp.yml down -v"
echo ""

if [ "$RUN_VALIDATE" = true ]; then
    echo -e "${YELLOW}▶ Running validation...${NC}"
    echo ""
    if [ "$APIKEY_MODE" = true ]; then
        bash "$SCRIPT_DIR/validate-mcp-apikey.sh"
    else
        bash "$SCRIPT_DIR/validate-mcp-test.sh"
    fi
fi

if [ "$APIKEY_MODE" = true ]; then
    print_manual_panel_apikey
elif [ "$MANUAL" = true ]; then
    print_manual_panel
else
    echo -e "${BLUE}💡 Tip:${NC} re-run with ${GREEN}--manual${NC} (OAuth) or ${GREEN}--apikey${NC} (API-key header) for client setup."
    echo ""
fi
