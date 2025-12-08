# Quick Start Guide

Get up and running with the Ancestry MCP Server in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Active Ancestry.com subscription
- Claude Desktop app (or another MCP-compatible client)

## Setup Steps

### 1. Install Dependencies

```bash
cd ancestry-mcp-server
npm install
```

This will install:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `playwright` - Browser automation

### 2. Install Playwright Browser

```bash
npx playwright install chromium
```

### 3. Configure Claude Desktop

Edit your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": [
        "/FULL/PATH/TO/ancestry-mcp-server/index.js"
      ],
      "env": {
        "ANCESTRY_USERNAME": "your-email@example.com",
        "ANCESTRY_PASSWORD": "your-actual-password"
      }
    }
  }
}
```

**Important**: Replace `/FULL/PATH/TO/` with the actual absolute path!

### 4. Restart Claude Desktop

Completely quit and restart Claude Desktop for the config to load.

### 5. Test the Connection

In Claude Desktop, try saying:

```
"Login to my Ancestry account"
```

You should see a success message if everything is configured correctly.

## First Searches

Try these commands:

```
"Search for John Smith born around 1850 in New York"
```

```
"Get details about the first person in the results"
```

```
"Show me the family tree for this person"
```

## Creating Narratives

Once you have person data:

```
"Create a historical narrative for this person including world events during their lifetime"
```

## Troubleshooting

### Server doesn't appear in Claude

1. Check config file syntax (valid JSON)
2. Verify the path to index.js is absolute
3. Ensure credentials are correct
4. Look for errors in Claude Desktop Developer Tools (Help > Developer Tools)

### Login fails

1. Double-check credentials
2. Try logging in manually at ancestry.com to verify
3. Check if 2FA is enabled (currently not supported)
4. Look at server logs for specific errors

### Selectors don't work

Ancestry.com may have changed their HTML structure. See TODO.md for selector updates needed.

### Browser crashes

```bash
# Reinstall Playwright browsers
npx playwright install --force chromium
```

## Next Steps

1. Read the full README.md for all available tools
2. Check TODO.md for features in development
3. Customize selectors if needed (index.js)
4. Consider contributing improvements!

## Example Workflow

1. **Search**: "Find my ancestor John Smith born 1850"
2. **Explore**: "Get the full profile of the first result"
3. **Family**: "Show me his family tree for 3 generations"
4. **Records**: "What historical records are attached to his profile?"
5. **Story**: "Create a narrative about his life with historical context"

## Support

- Check README.md for detailed documentation
- Review TODO.md for known issues
- Open issues on GitHub (if published)

## Tips

- Be specific with search criteria for better results
- Family tree exploration can be slow - be patient
- Historical narratives are templates - enhance with web search
- Save interesting findings as you work

Happy researching! 🌳
