#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Validating OAuth test environment...${NC}"
echo ""

# Check Keycloak health
echo -n "Checking Keycloak health... "
if curl -sf http://localhost:9080/health/ready > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Keycloak is not ready${NC}"
    exit 1
fi

# Check OAuth realm
echo -n "Checking OAuth realm... "
if curl -sf http://localhost:9080/realms/stirling-oauth > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ OAuth realm not found${NC}"
    exit 1
fi

# Check OIDC configuration
echo -n "Checking OIDC configuration endpoint... "
if curl -sf http://localhost:9080/realms/stirling-oauth/.well-known/openid-configuration > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ OIDC configuration not available${NC}"
    exit 1
fi

# Check Stirling PDF
echo -n "Checking Stirling PDF status... "
if curl -sf http://localhost:8080/api/v1/info/status 2>/dev/null | grep -q "UP"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Stirling PDF is not ready${NC}"
    exit 1
fi

# Check OAuth login endpoint
echo -n "Checking OAuth login endpoint... "
if curl -sf http://localhost:8080/oauth2/authorization/keycloak > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ OAuth login endpoint not available${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All OAuth environment checks passed!${NC}"
