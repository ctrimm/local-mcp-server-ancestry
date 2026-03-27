# Ancestry.com MCP Server

A Model Context Protocol (MCP) server for exploring genealogy data on Ancestry.com. This server provides tools to search for people, extract family tree information, and generate historical narratives.

## Features

- **Authentication**: Login to Ancestry.com using credentials
- **Person Search**: Search for individuals by name, dates, and location
- **Profile Details**: Extract detailed information from person profiles
- **Family Tree Navigation**: Explore family relationships across generations
- **Historical Records**: Access attached records and documents
- **Timeline Extraction**: Get chronological life events
- **Narrative Generation**: Create historical narratives with contextual information

## New: Dual MCP Server Setup with Claude Code

**🎯 Recommended Setup**: Use this server alongside Microsoft's Playwright MCP server for powerful combined capabilities!

Claude Code can orchestrate both:
- **This Ancestry server** for genealogy-specific tools
- **Playwright MCP server** for general browser automation

See **[CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md)** for the complete dual-server configuration guide.

### Quick Dual Setup

1. Install this server: `npm install`
2. Copy `mcp-config-example.json` and configure with your Ancestry credentials
3. Place config at `~/.config/claude-code/mcp.json`
4. Start Claude Code CLI - both servers will be available!

## Installation

```bash
npm install
```

## Configuration

### For Claude Code CLI (Recommended)

See **[CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md)** for complete instructions on setting up both Ancestry and Playwright MCP servers.

### For Claude Desktop

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": ["/path/to/ancestry-mcp-server/index.js"],
      "env": {
        "ANCESTRY_USERNAME": "your-username@email.com",
        "ANCESTRY_PASSWORD": "your-password"
      }
    }
  }
}
```

### For Other MCP Clients

Set environment variables:
```bash
export ANCESTRY_USERNAME="your-username@email.com"
export ANCESTRY_PASSWORD="your-password"
```

## Available Tools

### `ancestry_login`
Login to Ancestry.com using configured credentials.

```json
{}
```

### `ancestry_search_person`
Search for a person by name and optional criteria.

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "birthYear": "1850",
  "deathYear": "1920",
  "location": "New York"
}
```

### `ancestry_get_person_details`
Get detailed information about a person from their profile.

```json
{
  "profileUrl": "https://www.ancestry.com/family-tree/person/tree/..."
}
```

### `ancestry_get_tree_view`
Explore family tree relationships.

```json
{
  "treeUrl": "https://www.ancestry.com/family-tree/tree/...",
  "generations": 3
}
```

### `ancestry_get_records`
Get historical records attached to a person.

```json
{
  "profileUrl": "https://www.ancestry.com/family-tree/person/tree/..."
}
```

### `ancestry_get_timeline`
Extract timeline of life events.

```json
{
  "profileUrl": "https://www.ancestry.com/family-tree/person/tree/..."
}
```

### `generate_historical_narrative`
Generate a narrative story about a person's life with historical context.

```json
{
  "personData": {
    "name": "John Smith",
    "birthDate": "1850-03-15",
    "birthPlace": "New York, NY",
    "deathDate": "1920-12-01",
    "deathPlace": "Boston, MA",
    "events": [
      {
        "type": "Marriage",
        "date": "1875-06-20",
        "location": "New York, NY"
      },
      {
        "type": "Immigration",
        "date": "1848-01-10",
        "location": "Ellis Island, NY"
      }
    ]
  },
  "includeWorldEvents": true,
  "includeRegionalHistory": true
}
```

## Usage Examples

### With Claude Desktop

Once configured, you can use natural language:

```
"Search for John Smith born around 1850 in New York"
"Get the family tree for this person"
"Create a narrative about their life with historical context"
```

### Programmatic Usage

```javascript
// The MCP server runs as a subprocess
// Tools are called via the MCP protocol
```

## Architecture

- **Playwright**: Headless browser automation for Ancestry.com navigation
- **MCP SDK**: Standard protocol for tool communication
- **Node.js**: Runtime environment

## Security Notes

- Credentials are stored in your local MCP config file
- The server runs locally on your machine
- Browser automation is performed in headless mode
- No data is sent to external services (except Ancestry.com)

## Limitations

- Requires active Ancestry.com subscription
- Web scraping may be affected by site updates
- Rate limiting may apply
- Some features require specific subscription tiers

## Development

The server uses Playwright selectors that may need updating if Ancestry.com changes their HTML structure. Check `index.js` for selector definitions.

## Troubleshooting

**Login fails**: Verify credentials in config file
**Selectors not working**: Ancestry.com may have changed their HTML structure
**Browser crashes**: Check Playwright installation: `npx playwright install chromium`

## License

MIT

## Contributing

This is a personal project. Feel free to fork and customize for your needs.
