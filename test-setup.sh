#!/bin/bash

# Test Setup Script for Dual MCP Server Configuration
# This script helps verify your setup is correct

set -e

echo "=================================="
echo "Dual MCP Server Setup Test"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Node.js installed
echo -n "✓ Checking Node.js installation... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}OK${NC} ($NODE_VERSION)"
else
    echo -e "${RED}FAILED${NC}"
    echo "  Node.js not found. Install from https://nodejs.org"
    exit 1
fi

# Test 2: npm installed
echo -n "✓ Checking npm installation... "
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}OK${NC} ($NPM_VERSION)"
else
    echo -e "${RED}FAILED${NC}"
    echo "  npm not found. Install Node.js from https://nodejs.org"
    exit 1
fi

# Test 3: npx installed
echo -n "✓ Checking npx installation... "
if command -v npx &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "  npx not found. Update npm: npm install -g npm@latest"
    exit 1
fi

# Test 4: Check if node_modules exists
echo -n "✓ Checking Ancestry server dependencies... "
if [ -d "node_modules" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}MISSING${NC}"
    echo "  Run: npm install"
    exit 1
fi

# Test 5: Check if @modelcontextprotocol/sdk is installed
echo -n "✓ Checking MCP SDK... "
if [ -d "node_modules/@modelcontextprotocol" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "  MCP SDK not found. Run: npm install"
    exit 1
fi

# Test 6: Check if playwright is installed
echo -n "✓ Checking Playwright... "
if [ -d "node_modules/playwright" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "  Playwright not found. Run: npm install"
    exit 1
fi

# Test 7: Check if Playwright browsers are installed
echo -n "✓ Checking Playwright browsers... "
if npx playwright --version &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC}"
    echo "  Playwright browsers might not be installed. Run: npx playwright install chromium"
fi

# Test 8: Check for MCP config file
echo -n "✓ Checking MCP config file... "
MCP_CONFIG_PATH="$HOME/.config/claude-code/mcp.json"
if [ -f "$MCP_CONFIG_PATH" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}MISSING${NC}"
    echo "  Config file not found at: $MCP_CONFIG_PATH"
    echo "  Copy mcp-config-example.json and configure with your credentials"
fi

# Test 9: Validate MCP config is valid JSON
if [ -f "$MCP_CONFIG_PATH" ]; then
    echo -n "✓ Validating MCP config JSON... "
    if python3 -m json.tool "$MCP_CONFIG_PATH" > /dev/null 2>&1 || node -e "JSON.parse(require('fs').readFileSync('$MCP_CONFIG_PATH'))" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Config file contains invalid JSON. Check syntax."
    fi
fi

# Test 10: Check if Playwright MCP server is accessible
echo -n "✓ Checking Playwright MCP server availability... "
if npx --yes @playwright/mcp@latest --version &> /dev/null 2>&1 || timeout 5 npx --yes @playwright/mcp@latest --help &> /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC}"
    echo "  Could not verify Playwright MCP server. It will be downloaded on first use."
fi

# Test 11: Check environment variables
echo ""
echo "Credential Configuration:"
if [ -n "$ANCESTRY_USERNAME" ] && [ -n "$ANCESTRY_PASSWORD" ]; then
    echo -e "  ${GREEN}✓${NC} Environment variables set"
    echo "    ANCESTRY_USERNAME: $ANCESTRY_USERNAME"
    echo "    ANCESTRY_PASSWORD: ******"
elif [ -f "$MCP_CONFIG_PATH" ]; then
    echo -e "  ${GREEN}✓${NC} Using credentials from MCP config file"
else
    echo -e "  ${YELLOW}!${NC} No credentials configured"
    echo "    Set ANCESTRY_USERNAME and ANCESTRY_PASSWORD in:"
    echo "    - Environment variables, OR"
    echo "    - MCP config file ($MCP_CONFIG_PATH)"
fi

echo ""
echo "=================================="
echo -e "${GREEN}Setup Test Complete!${NC}"
echo "=================================="
echo ""
echo "Next Steps:"
echo "1. Ensure MCP config is set up at: $MCP_CONFIG_PATH"
echo "2. Add your Ancestry credentials to the config"
echo "3. Start Claude Code CLI to use both servers"
echo ""
echo "See CLAUDE_CODE_SETUP.md for detailed configuration instructions."
echo ""
