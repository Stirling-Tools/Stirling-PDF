#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Validating SAML test environment...${NC}"
echo ""

# Check Keycloak health
echo -n "Checking Keycloak health... "
if curl -sf http://localhost:9080/health/ready > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Keycloak is not ready${NC}"
    exit 1
fi

# Check SAML realm
echo -n "Checking SAML realm... "
if curl -sf http://localhost:9080/realms/stirling-saml > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ SAML realm not found${NC}"
    exit 1
fi

# Check SAML metadata
echo -n "Checking SAML metadata endpoint... "
if curl -sf http://localhost:9080/realms/stirling-saml/protocol/saml/descriptor > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ SAML metadata not available${NC}"
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

# Check Stirling PDF SAML metadata
echo -n "Checking Stirling PDF SAML metadata... "
if curl -sf http://localhost:8080/saml2/service-provider-metadata/keycloak > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Stirling PDF SAML metadata not available${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All SAML environment checks passed!${NC}"
