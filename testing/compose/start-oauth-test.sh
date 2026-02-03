#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Stirling PDF + Keycloak OAuth Test Environment  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Prompt for license key (optional)
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

echo -e "${YELLOW}▶ Starting OAuth test containers...${NC}"
docker-compose -f docker-compose-keycloak-oauth.yml up -d

echo ""
echo -e "${YELLOW}▶ Waiting for Keycloak (OAuth)...${NC}"
MAX_WAIT=180
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:9080/realms/stirling-oauth > /dev/null 2>&1; then
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
echo -e "${GREEN}║          OAuth Test Environment Ready! ✓          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Services:${NC}"
echo -e "   Stirling PDF:   ${GREEN}http://localhost:8080${NC}"
echo -e "   Keycloak Admin: ${GREEN}http://localhost:9080/admin${NC}"
echo ""
echo -e "${BLUE}🔑 Keycloak Admin:${NC}"
echo -e "   Username: ${GREEN}admin${NC}"
echo -e "   Password: ${GREEN}admin${NC}"
echo ""
echo -e "${BLUE}👥 Test Users (OAuth):${NC}"
echo -e "   ${YELLOW}Regular User:${NC}"
echo -e "     Email:    ${GREEN}oauthuser@example.com${NC}"
echo -e "     Password: ${GREEN}oauthpassword${NC}"
echo ""
echo -e "   ${YELLOW}Admin User:${NC}"
echo -e "     Email:    ${GREEN}oauthadmin@example.com${NC}"
echo -e "     Password: ${GREEN}oauthadminpass${NC}"
echo ""
echo -e "${BLUE}🧪 Test OAuth:${NC}"
echo -e "   1. Go to ${GREEN}http://localhost:8080${NC}"
echo -e "   2. Click 'Login' and select OAuth2"
echo -e "   3. Login with test credentials"
echo ""
echo -e "${BLUE}📊 View logs:${NC}"
echo -e "   docker-compose -f docker-compose-keycloak-oauth.yml logs -f"
echo ""
echo -e "${BLUE}⏹  Stop:${NC}"
echo -e "   docker-compose -f docker-compose-keycloak-oauth.yml down -v"
echo ""
