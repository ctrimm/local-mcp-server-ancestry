# Quick Start Guide

Get up and running with the Ancestry MCP Server in 5 minutes.

## Two Setup Options

**Option A: Claude Code CLI with Dual MCP Servers** (Recommended)
- Most powerful setup
- Ancestry + Playwright MCP servers working together
- See [Dual Server Setup](#dual-server-setup-claude-code-cli) below

**Option B: Claude Desktop (Single Server)**
- Simpler setup
- Just Ancestry MCP server
- See [Claude Desktop Setup](#claude-desktop-setup) below

---

## Dual Server Setup (Claude Code CLI)

Get both Ancestry and Playwright MCP servers running together.

### Prerequisites

- Node.js 18+ installed
- Active Ancestry.com subscription
- Claude Code CLI installed

### Setup Steps

#### 1. Install Ancestry Server

```bash
cd local-mcp-server-ancestry
npm install
npx playwright install chromium
```

#### 2. Create MCP Configuration

Copy the example config:

```bash
cp mcp-config-example.json ~/.config/claude-code/mcp.json
```

Edit `~/.config/claude-code/mcp.json` and update:
- Replace `/REPLACE/WITH/ABSOLUTE/PATH/TO/` with actual path to this directory
- Add your Ancestry.com credentials

#### 3. Start Claude Code

```bash
claude-code
```

Both servers will start automatically!

#### 4. Test Both Servers

```
> List available MCP tools
```

You should see tools from both ancestry and playwright servers.

### Example Dual Server Workflows

**Genealogy Research with Enhanced Browser Control:**

```
> Login to Ancestry and search for "John Smith" born 1850 in New York

> Get details of the first result

> Use Playwright to navigate to the census record link and take a screenshot

> Extract text from the screenshot and add it to the person's timeline
```

**Automated Family Tree Documentation:**

```
> Search Ancestry for "Mary Johnson" born 1920

> Get her family tree for 3 generations

> For each person found, use Playwright to navigate to their profile
  and capture screenshots of important records

> Generate a comprehensive family history narrative
```

### What You Can Do with Dual Servers

**Ancestry Server:**
- Search genealogy databases
- Extract family relationships
- Get historical records
- Generate narratives

**Playwright Server:**
- Navigate any website
- Fill forms automatically
- Take screenshots
- Extract data from complex pages
- Handle JavaScript-heavy sites

**Combined:**
- Research on Ancestry, verify on other genealogy sites
- Extract data from record images
- Build comprehensive family histories
- Automate repetitive research tasks

📖 **See [CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md) for complete details**

---

## Claude Desktop Setup

### Prerequisites

- Node.js 18+ installed
- Active Ancestry.com subscription
- Claude Desktop app

### Setup Steps

### 1. Install Dependencies

```bash
cd local-mcp-server-ancestry
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

## Upgrading to Dual Server Setup

Already using Claude Desktop? Upgrade to Claude Code CLI for dual server support:

1. Install Claude Code CLI
2. Follow [CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md)
3. Migrate your Ancestry credentials to the MCP config
4. Get access to both Ancestry + Playwright tools!

Happy researching! 🌳
