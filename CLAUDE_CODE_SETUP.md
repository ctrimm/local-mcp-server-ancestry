# Claude Code Setup - Dual MCP Server Configuration

This guide shows how to configure Claude Code CLI to use both the Ancestry MCP server and Microsoft's Playwright MCP server simultaneously.

## Overview

Claude Code will orchestrate between two MCP servers:
- **Ancestry MCP Server** - Ancestry.com-specific genealogy tools
- **Playwright MCP Server** - General browser automation capabilities

## Prerequisites

1. Node.js installed (v18 or higher recommended)
2. Claude Code CLI installed
3. Ancestry.com account with active subscription

## Installation

### 1. Install Ancestry MCP Server

```bash
cd /path/to/local-mcp-server-ancestry
npm install
```

### 2. Install Playwright MCP Server

Microsoft's Playwright MCP server is installed via npx (no separate installation needed):

```bash
# Verify it's available
npx @playwright/mcp@latest --help
```

## Configuration for Claude Code CLI

### MCP Configuration File

Claude Code uses an MCP configuration file to manage multiple servers. Create or update your MCP config:

**Location**: `~/.config/claude-code/mcp.json` (Linux/macOS) or `%APPDATA%\claude-code\mcp.json` (Windows)

```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": ["/absolute/path/to/local-mcp-server-ancestry/index.js"],
      "env": {
        "ANCESTRY_USERNAME": "your-username@email.com",
        "ANCESTRY_PASSWORD": "your-password"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

**Important**: Replace `/absolute/path/to/local-mcp-server-ancestry/index.js` with the actual absolute path to your ancestry server.

### Alternative: Using Environment Variables

You can also set credentials via environment variables:

```bash
export ANCESTRY_USERNAME="your-username@email.com"
export ANCESTRY_PASSWORD="your-password"
```

Then simplify the config:

```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": ["/absolute/path/to/local-mcp-server-ancestry/index.js"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

## Usage with Claude Code

Once configured, Claude Code can access tools from both servers:

### Ancestry-Specific Tools

```
claude-code> Search for John Smith born around 1850 in New York on Ancestry

claude-code> Get the family tree for the first result

claude-code> Create a historical narrative about their life
```

### General Browser Automation (Playwright)

```
claude-code> Navigate to example.com and take a screenshot

claude-code> Fill out the form on this page

claude-code> Click the submit button and wait for the response
```

### Combined Workflows

```
claude-code> Search Ancestry for Mary Johnson born 1920,
then use the browser to navigate to the census record
and extract additional details not shown in the summary
```

## Available Tools

### Ancestry MCP Server Tools

1. `ancestry_login` - Login to Ancestry.com
2. `ancestry_search_person` - Search for people by name/dates/location
3. `ancestry_get_person_details` - Get detailed profile information
4. `ancestry_get_tree_view` - Explore family tree relationships
5. `ancestry_get_records` - Get historical records attached to a person
6. `ancestry_get_timeline` - Extract chronological life events
7. `generate_historical_narrative` - Create narrative stories with historical context

### Playwright MCP Server Tools

The Microsoft Playwright MCP server provides browser automation tools:
- Navigate to URLs
- Click elements
- Fill forms
- Take screenshots
- Execute JavaScript
- Handle browser contexts
- And more...

See [Playwright MCP documentation](https://github.com/microsoft/playwright-mcp) for full tool list.

## Verifying Setup

### Check MCP Servers are Running

```bash
# Start Claude Code and check available tools
claude-code

# In Claude Code, ask:
> List all available MCP tools
```

You should see tools from both servers listed.

### Test Each Server

```bash
# Test Ancestry server
> Use ancestry_login to log in to Ancestry

# Test Playwright server
> Navigate to https://example.com using Playwright
```

## Troubleshooting

### Ancestry Server Issues

**Problem**: "ANCESTRY_USERNAME and ANCESTRY_PASSWORD must be set"
- **Solution**: Verify credentials are in MCP config or environment variables

**Problem**: "Login failed"
- **Solution**: Check credentials are correct, try logging in manually to verify account status

**Problem**: Selectors not working
- **Solution**: Ancestry.com may have updated their HTML structure; selectors in `index.js` may need updating

### Playwright Server Issues

**Problem**: "Command not found: npx"
- **Solution**: Install Node.js from https://nodejs.org

**Problem**: Browser fails to launch
- **Solution**: Run `npx playwright install chromium`

**Problem**: Permission denied
- **Solution**: Ensure npx has execute permissions

### General MCP Issues

**Problem**: Servers not appearing in Claude Code
- **Solution**:
  - Check MCP config file path is correct
  - Verify JSON syntax is valid
  - Restart Claude Code
  - Check Claude Code logs for errors

**Problem**: Path issues
- **Solution**: Use absolute paths, not relative paths in config

## Security Notes

- **Credentials are stored locally** in your MCP config file or environment variables
- **All processing happens locally** on your machine
- **No data is sent externally** except to Ancestry.com for the ancestry server
- **Browser automation is local** - Playwright runs on your machine

## Architecture

```
┌─────────────────────────────────────┐
│       Claude Code CLI               │
│                                     │
│  Orchestrates and coordinates       │
│  between multiple MCP servers       │
└───────────┬─────────────┬───────────┘
            │             │
    ┌───────▼──────┐  ┌──▼────────────┐
    │   Ancestry   │  │  Playwright   │
    │  MCP Server  │  │  MCP Server   │
    │              │  │               │
    │ - Playwright │  │ - Browser     │
    │   instance   │  │   automation  │
    │ - Ancestry   │  │ - General web │
    │   selectors  │  │   tasks       │
    └──────────────┘  └───────────────┘
```

## Next Steps

- Read [QUICKSTART.md](QUICKSTART.md) for example workflows
- Check [README.md](README.md) for detailed tool documentation
- See [TO-DO.md](TO-DO.md) for planned enhancements

## Support

For issues:
- Ancestry MCP Server: This repository
- Playwright MCP Server: https://github.com/microsoft/playwright-mcp
- Claude Code: Anthropic documentation

## License

MIT
