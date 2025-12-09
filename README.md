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

#### `gedcom_generational_comparison`
Compare experiences across generations (parent vs child, grandparent vs grandchild).

```json
{
  "olderGenerationId": "@I123@",
  "youngerGenerationId": "@I456@"
}
```

**Output includes:**
- Comparison table with key statistics
- Historical context (era differences, geographic changes)
- Life circumstances comparison (longevity, family size, migration)
- Generational changes identified

#### `gedcom_ask_about_person`
Answer natural language questions about a person.

```json
{
  "individualId": "@I123@",
  "question": "Where did they live?"
}
```

**Supported question types:**
- Birth/Death: "When was X born?", "Where did they die?"
- Marriage: "Did they marry?", "When did they get married?"
- Children: "How many children did they have?"
- Locations: "Where did they live?"
- Age/Lifespan: "How old were they?", "How long did they live?"
- Occupation: "What did they do for work?"
- Migration: "Did they immigrate?"
- Parents: "Who were their parents?"

#### `gedcom_location_history`
Returns structured JSON data about places where a person lived. The LLM uses this to provide rich historical context.

```json
{
  "individualId": "@I123@"
}
```

**Returns JSON with:**
- `locationCount`: Number of unique locations
- `uniqueLocations`: Array of location names
- `chronologicalEvents`: Array of events with location, type, date, year

**Design note:** Returns data only - Claude provides historical context about these places using its knowledge.

#### `gedcom_era_context`
Returns structured JSON with lifetime data. The LLM uses this to describe what life was like during their era.

```json
{
  "individualId": "@I123@"
}
```

**Returns JSON with:**
- `birthYear`, `deathYear`, `lifespan`
- `birthPlace`, `deathPlace`
- `allEvents`: Array of all life events with dates and locations

**Design note:** Returns data only - Claude provides historical context about their era, major events, technology, and social conditions using its knowledge.

#### `gedcom_family_statistics`
Get aggregate statistics across the entire family tree. Returns JSON with analytics that require processing all individuals.

```json
{}
```

**Returns JSON with:**
- `totalPeople`, `totalFamilies`: Overall counts
- `genderDistribution`: Male, female, and unknown counts
- `lifespanAnalysis`: Average lifespan and data points
- `mostCommonNames`: Top 10 most frequent first names with counts
- `mostCommonLocations`: Top 10 most frequent event locations with counts
- `migrationStatistics`: People with multiple locations and migration percentage
- `familySizeAnalysis`: Average children per family
- `dataCompleteness`: Percentage of people with birth dates, death dates, and birth places

**Design note:** Provides aggregate analytics the LLM cannot compute on its own. The LLM interprets patterns and trends.

#### `gedcom_date_range_analysis`
Analyze temporal patterns in the family tree. Returns JSON with date ranges, generation spans, and distribution metrics.

```json
{}
```

**Returns JSON with:**
- `overallDateRange`: Earliest/latest years, time span, estimated generations
- `birthDateRange`: Earliest/latest births, total with birth dates
- `deathDateRange`: Earliest/latest deaths, total with death dates
- `birthsByCentury`: Distribution of births by century
- `birthsByDecade`: Distribution of births by decade

**Design note:** Provides temporal analysis data. The LLM uses this to understand the historical scope of the tree.

#### `gedcom_find_people`
Search for people matching specific criteria. Returns JSON array of individuals matching the filters.

```json
{
  "birthLocation": "New York",
  "birthYearStart": 1850,
  "birthYearEnd": 1900,
  "hasMilitary": true,
  "hasMigration": true,
  "missingBirthDate": false,
  "missingDeathDate": false
}
```

**Available filters:**
- `birthLocation`: Partial match on birth location (e.g., "New York")
- `deathLocation`: Partial match on death location
- `birthYearStart`: Minimum birth year
- `birthYearEnd`: Maximum birth year
- `hasMilitary`: Filter to people with military service (true/false)
- `hasMigration`: Filter to people with multiple locations (true/false)
- `missingBirthDate`: Filter to people missing birth dates (true/false)
- `missingDeathDate`: Filter to people missing death dates (true/false)

**Returns JSON with:**
- `matchCount`: Number of matches found
- `filters`: Echo of the filters used
- `matches`: Array of matching individuals with id, name, birth/death data, and locations

**Design note:** Provides filtered search results. All parameters are optional - omit to skip that filter.

#### `gedcom_find_common_ancestor`
Find the most recent common ancestor(s) of two people. Returns JSON with ancestor details and relationship paths.

```json
{
  "person1Id": "@I123@",
  "person2Id": "@I456@"
}
```

**Returns JSON with:**
- `person1`, `person2`: Names and IDs of the two people
- `mostRecentCommonAncestor`: The MRCA with paths from each person and generation counts
- `allCommonAncestors`: All common ancestors sorted by proximity
- `totalCommonAncestors`: Count of all common ancestors

**Design note:** Computes ancestry paths the LLM cannot traverse. The LLM interprets the relationship significance.

#### `gedcom_validate_data`
Validate data quality and find inconsistencies. Returns JSON with validation issues found.

```json
{
  "checkDates": true,
  "checkAges": true,
  "checkDuplicates": true
}
```

**Validation checks:**
- **Date inconsistencies** (if checkDates=true): Death before birth, events before birth, events after death
- **Age inconsistencies** (if checkAges=true): Unrealistic lifespans (>120 years), marriage too young (<12), children born when parent was too young (<12) or too old (>60)
- **Potential duplicates** (if checkDuplicates=true): Same name with similar birth years (within 5 years)

**Returns JSON with:**
- `totalIssues`: Count of all issues
- `errorCount`, `warningCount`, `infoCount`: Issues by severity
- `issuesByType`: Breakdown by issue type
- `issues`: Array of all issues with type, severity, individual ID, name, and description

**Design note:** All parameters are optional and default to true. Provides data quality analysis the LLM uses to identify genealogy research problems.

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
"Compare parent @I123@ with child @I456@ across generations"
"When was @I123@ born?" (Q&A tool)
"How many children did @I123@ have?" (Q&A tool)
"Tell me about the places where @I123@ lived"
"What was life like during @I123@'s lifetime?"
"Show me family statistics across the entire tree"
"Analyze the date ranges in my family tree"
"Find all people born in New York between 1850 and 1900"
"Find people with military service"
"Who is the common ancestor of @I123@ and @I456@?"
"Validate the data quality in my family tree"
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
