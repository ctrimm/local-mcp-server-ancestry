# Ancestry.com MCP Server

A Model Context Protocol (MCP) server for exploring genealogy data from both Ancestry.com (via web scraping) and GEDCOM files. This server provides tools to search for people, extract family tree information, and generate rich historical narratives.

## Features

### Ancestry.com Web Scraping (Playwright-based)
- **Authentication**: Login to Ancestry.com using credentials with session persistence
- **Person Search**: Search for individuals by name, dates, and location with fallback selectors
- **Profile Details**: Extract detailed information from person profiles
- **Family Tree Navigation**: Explore family relationships across generations
- **Historical Records**: Access attached records and documents
- **Timeline Extraction**: Get chronological life events

### GEDCOM File Support (Recommended)
- **Load GEDCOM Files**: Parse standard GEDCOM 5.5.1 files from Ancestry.com exports
- **Fast Search**: Search for people by name, birth year, death year
- **Person Details**: Get complete information about individuals
- **Ancestors**: Retrieve parents, grandparents, great-grandparents (configurable generations)
- **Descendants**: Retrieve children, grandchildren, great-grandchildren
- **Family Groups**: Get parents, spouses, and children together
- **No ToS Violations**: Works entirely offline with your exported data

### Historical Narrative Generation
Create rich, imaginative historical narratives with:
  - Detailed historical context by era and location
  - Major world events during the person's lifetime
  - Age calculations for all life events
  - Period-appropriate storytelling and language
  - Philosophical reflections on their life journey
  - Works with both web-scraped data and GEDCOM files

## Reliability Features

- **Retry Logic**: Automatic retry with exponential backoff for failed operations
- **Session Persistence**: Saves login cookies to avoid repeated authentication
- **Multiple Selectors**: Falls back to alternative CSS selectors when site structure changes
- **Error Handling**: Comprehensive error catching with detailed error messages
- **Screenshot Debugging**: Automatically captures screenshots when errors occur
- **Popup Handling**: Detects and closes cookie consent dialogs automatically
- **Graceful Degradation**: Continues operation even when some elements are missing

## Installation

```bash
npm install
```

## Configuration

### For Claude Desktop

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Option 1: GEDCOM File (Recommended - No ToS Issues)
```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": ["/path/to/ancestry-mcp-server/index.js"],
      "env": {
        "GEDCOM_FILE": "/path/to/your/family-tree.ged"
      }
    }
  }
}
```

#### Option 2: Web Scraping (Personal Use Only)
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

#### Option 3: Both (Maximum Flexibility)
```json
{
  "mcpServers": {
    "ancestry": {
      "command": "node",
      "args": ["/path/to/ancestry-mcp-server/index.js"],
      "env": {
        "GEDCOM_FILE": "/path/to/your/family-tree.ged",
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

### GEDCOM Tools

#### `gedcom_load`
Load and parse a GEDCOM file. Required before using other GEDCOM tools.

```json
{
  "filePath": "/path/to/family-tree.ged"
}
```
*Note: If `GEDCOM_FILE` env var is set, filePath is optional*

#### `gedcom_search_person`
Search for people in the GEDCOM file.

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "birthYear": "1850",
  "deathYear": "1920"
}
```

#### `gedcom_get_person`
Get complete details about a specific person.

```json
{
  "individualId": "@I123@"
}
```

#### `gedcom_get_ancestors`
Get ancestors (parents, grandparents, etc.).

```json
{
  "individualId": "@I123@",
  "generations": 3
}
```

#### `gedcom_get_descendants`
Get descendants (children, grandchildren, etc.).

```json
{
  "individualId": "@I123@",
  "generations": 3
}
```

#### `gedcom_get_family`
Get immediate family (parents, spouse, children).

```json
{
  "individualId": "@I123@"
}
```

#### `gedcom_generate_narrative`
Generate a rich historical narrative from GEDCOM data.

```json
{
  "individualId": "@I123@",
  "includeWorldEvents": true,
  "includeRegionalHistory": true
}
```

#### `gedcom_relationship_explainer`
Calculate and explain the relationship between two people with a narrative description.

```json
{
  "person1Id": "@I123@",
  "person2Id": "@I456@"
}
```

**Output includes:**
- Relationship type (parent, child, sibling, cousin, etc.)
- Degree of separation
- Connection path showing how they're related
- Narrative explanation

#### `gedcom_life_summary`
Generate a life summary in different narrative styles.

```json
{
  "individualId": "@I123@",
  "style": "brief"
}
```

**Available styles:**
- **brief**: 1-2 paragraph summary with key facts
- **detailed**: Comprehensive summary organized by life phases (Early Life, Life Events, Later Life)
- **chronological**: Timeline-focused view with ages at each event
- **thematic**: Organized by themes (Origins, Family, Migration, Occupation & Service, Later Life)

#### `gedcom_migration_story`
Trace family movements and migrations across generations with rich geographic narrative.

```json
{
  "startingPersonId": "@I123@",
  "generations": 4,
  "direction": "ancestors"
}
```

**Parameters:**
- **generations**: Number of generations to trace (default: 4)
- **direction**: "ancestors" (backward in time), "descendants" (forward in time), or "both"

**Output includes:**
- Migration summary by generation
- Detailed migration stories for each person
- Migration patterns and insights
- Most common locations
- Immigration/emigration trends

#### `gedcom_family_saga`
Generate a chronological narrative spanning multiple family members, weaving their stories together.

```json
{
  "familyIds": ["@I123@", "@I456@", "@I789@"],
  "focusPersonId": "@I123@"
}
```

**Output includes:**
- Chronological timeline organized by decade
- Individual life stories
- Family connections and relationships
- Overview of the time period covered

#### `gedcom_sibling_comparison`
Compare and contrast the life experiences of siblings.

```json
{
  "siblingIds": ["@I123@", "@I456@", "@I789@"]
}
```

**Output includes:**
- Quick comparison table (birth/death years, lifespan, birthplace)
- Similarities analysis (shared experiences, common patterns)
- Differences analysis (lifespan variance, locations, family size, occupations)
- Individual life paths for each sibling

## How to Export GEDCOM from Ancestry.com

1. Log in to Ancestry.com
2. Go to your family tree
3. Click "Trees" in the top menu
4. Select "Download tree" from the dropdown
5. Choose "GEDCOM" format
6. Save the .ged file to your computer
7. Use the file path in your MCP server configuration

## Usage Examples

### With Claude Desktop

Once configured, you can use natural language:

**Using GEDCOM files:**
```
"Load my GEDCOM file"
"Search for John Smith in the GEDCOM"
"Get the ancestors of @I123@"
"Create a narrative about @I123@'s life"
"How are @I123@ and @I456@ related?"
"Give me a brief summary of @I123@'s life"
"Show me a chronological timeline for @I123@"
"Trace the migration story for @I123@ going back 4 generations"
"Create a family saga for @I123@, @I456@, and @I789@"
"Compare the lives of siblings @I123@ and @I456@"
```

**Using Ancestry.com web scraping:**
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

**Login fails**:
- Verify credentials in config file
- Check for screenshots in the server directory (screenshot-login-*.png)
- Session cookies are saved in `.ancestry-session.json` - delete this file to force fresh login

**Selectors not working**:
- The server uses multiple fallback selectors to handle site changes
- Check screenshots (screenshot-*.png) to see what the page looks like
- Selectors may still need updating if Ancestry.com made major changes

**Browser crashes**:
- Check Playwright installation: `npx playwright install chromium`
- Try running with `headless: false` in index.js for debugging

**Connection issues**:
- The server automatically retries failed requests 3 times with exponential backoff
- Check console error messages for details

## License

MIT

## Contributing

This is a personal project. Feel free to fork and customize for your needs.
