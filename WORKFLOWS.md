# Combined Workflows: Ancestry + Playwright MCP Servers

This guide demonstrates powerful workflows combining the Ancestry MCP server with the Playwright MCP server through Claude Code CLI.

## Overview

By using both servers together, you can:
- Research on Ancestry.com with specialized tools
- Use general browser automation for any website
- Cross-reference information across multiple genealogy sites
- Extract data from complex record images
- Automate repetitive research tasks
- Build comprehensive family histories

## Workflow Examples

### 1. Cross-Site Verification

**Goal**: Find a person on Ancestry and verify information on FamilySearch.

```
Step 1: Search Ancestry
> Use ancestry_search_person to find "James Wilson" born 1845 in Ohio

Step 2: Get detailed information
> Use ancestry_get_person_details for the first result

Step 3: Verify on FamilySearch
> Use Playwright to navigate to https://www.familysearch.org
> Search for the same person using Playwright's form filling
> Compare the birth/death dates and locations
> Take screenshots of matching records
```

**Why this works**: Ancestry server provides structured searches, Playwright handles sites without MCP servers.

---

### 2. Enhanced Record Extraction

**Goal**: Extract text from historical census records.

```
Step 1: Find person and records
> Use ancestry_search_person to find "Mary O'Brien" born 1880 Ireland
> Use ancestry_get_records to get attached census records

Step 2: Navigate to census images
> Use Playwright to navigate to the census record URL
> Wait for the image viewer to load
> Take a high-resolution screenshot

Step 3: Extract and organize
> Use OCR or AI vision on the screenshot
> Add extracted details to person's timeline
> Generate narrative with the new information
```

**Why this works**: Ancestry finds the records, Playwright captures detailed images.

---

### 3. Automated Family Tree Documentation

**Goal**: Document an entire family tree with screenshots and narratives.

```
Step 1: Get family tree structure
> Use ancestry_get_tree_view for "Robert Smith" with 4 generations

Step 2: For each person in the tree:
  a. Use ancestry_get_person_details to get basic info
  b. Use ancestry_get_timeline to get life events
  c. Use Playwright to navigate to their profile
  d. Take screenshots of key records
  e. Generate a historical narrative

Step 3: Compile documentation
> Create a markdown document with all narratives
> Include embedded screenshots
> Add citations and sources
```

**Why this works**: Automates hours of manual documentation work.

---

### 4. Multi-Source Research

**Goal**: Research a person across multiple genealogy platforms.

```
Step 1: Ancestry search
> Use ancestry_search_person for "Elizabeth Taylor" born 1910 Boston

Step 2: FamilySearch search
> Use Playwright to search FamilySearch.org
> Extract matching records

Step 3: FindAGrave search
> Use Playwright to search FindAGrave.com
> Find burial information and photos

Step 4: Newspaper archives
> Use Playwright to search newspapers.com
> Find obituaries and news articles

Step 5: Compile findings
> Generate comprehensive narrative with all sources
> Include proper citations
```

**Why this works**: No single site has all information; combining sources gives complete picture.

---

### 5. Immigration Story Research

**Goal**: Build a detailed immigration narrative with historical context.

```
Step 1: Find immigration records on Ancestry
> Use ancestry_search_person for immigrant ancestor
> Use ancestry_get_records to find passenger lists

Step 2: Research ship history
> Use Playwright to navigate to ship database websites
> Extract ship details (tonnage, route, conditions)
> Find historical images of the ship

Step 3: Research departure/arrival ports
> Use Playwright to search for historical information
> Find photos of the ports in that era
> Get immigration statistics for that time period

Step 4: Research destination
> Find information about immigrant communities
> Get historical context of the arrival location
> Research typical immigrant experiences

Step 5: Generate narrative
> Use generate_historical_narrative with all collected data
> Include personal story within historical context
> Add citations and source images
```

**Why this works**: Combines specific records with rich historical context.

---

### 6. Living History Timeline

**Goal**: Create a timeline showing personal events alongside world events.

```
Step 1: Extract personal timeline
> Use ancestry_get_timeline for the person

Step 2: For each major life event:
  a. Use Playwright to search Wikipedia for events that year
  b. Extract major historical events
  c. Use Playwright to search news archives
  d. Find local news from that time and place

Step 3: Compile parallel timeline
> Create markdown with two columns:
  - Personal events
  - World/local events
> Add context showing how history affected their life
```

**Why this works**: Brings history to life by connecting personal and world events.

---

### 7. Photo and Document Collection

**Goal**: Collect and organize all photos and documents for a family.

```
Step 1: Get family members
> Use ancestry_get_tree_view to get all family members

Step 2: For each person:
  a. Use Playwright to navigate to their profile
  b. Find attached photos and documents
  c. Download high-res versions
  d. Organize by person and type

Step 3: Create photo album
> Generate markdown document with all photos
> Add captions with person, date, location
> Include transcriptions of documents
```

**Why this works**: Preserves family history in organized, accessible format.

---

### 8. DNA Match Investigation

**Goal**: Research DNA matches to find common ancestors.

```
Step 1: Get match information
> Use Playwright to navigate to Ancestry DNA matches
> Extract match details (cM, relationship estimate)

Step 2: Explore match's tree
> Use ancestry_get_tree_view for the match's tree
> Find common surnames and locations

Step 3: Build comparison
> Use ancestry_get_tree_view for your tree
> Compare both trees to find common ancestors
> Use Playwright to research historical records for connections

Step 4: Document findings
> Create a report showing the connection
> Include supporting records
> Generate narrative of the shared family line
```

**Why this works**: Combines DNA data with genealogical research.

---

## Best Practices

### When to Use Each Server

**Use Ancestry Server when:**
- Searching Ancestry.com specifically
- Need structured genealogy data
- Want family tree navigation
- Generating historical narratives

**Use Playwright Server when:**
- Need to access any website
- Dealing with complex JavaScript interfaces
- Taking screenshots
- Extracting data from non-Ancestry sites
- Handling dynamic content

**Use Both Together when:**
- Cross-referencing multiple sources
- Automating complex research workflows
- Building comprehensive documentation
- Extracting and enhancing Ancestry data

### Performance Tips

1. **Batch operations**: Get all data from one server before switching to the other
2. **Cache results**: Store API responses to avoid re-fetching
3. **Be patient**: Browser automation takes time; plan for delays
4. **Use screenshots wisely**: They're useful but consume storage

### Error Handling

1. **Check login status** before long operations
2. **Verify URLs** before navigating with Playwright
3. **Have fallbacks** if selectors change
4. **Save progress** incrementally during long workflows

### Ethical Considerations

1. **Respect rate limits** on all sites
2. **Check terms of service** before scraping
3. **Verify data** from multiple sources when possible
4. **Cite sources** properly in all documentation
5. **Respect privacy** of living individuals

## Command Patterns

### Search and Verify Pattern

```
1. Search Ancestry for person
2. Get structured data
3. Use Playwright to verify on another site
4. Compare and reconcile differences
```

### Deep Dive Pattern

```
1. Find person on Ancestry
2. Get all basic information
3. Use Playwright to access detailed records
4. Extract additional information
5. Update and enhance narrative
```

### Automated Documentation Pattern

```
1. Get family tree structure
2. For each person:
   a. Get Ancestry data
   b. Capture screenshots with Playwright
   c. Generate narrative section
3. Compile into final document
```

## Common Issues and Solutions

### Issue: Login expires during long research

**Solution**: Check login status periodically, re-login if needed

```
> Use ancestry_login to refresh session
```

### Issue: Selectors change on website

**Solution**: Use Playwright's robust selectors

```
> Use Playwright with text selectors instead of CSS classes
> Example: "Click on 'Search' button" rather than ".search-btn"
```

### Issue: Too much data to process

**Solution**: Break into smaller chunks

```
> Process one generation at a time
> Save results after each person
> Use todo lists to track progress
```

## Advanced Techniques

### Parallel Research

Process multiple family lines simultaneously:

```
1. Get all direct ancestors
2. For each ancestor:
   - Start separate research threads
   - Collect data independently
   - Merge results at the end
```

### Smart Caching

Avoid re-fetching data:

```
1. Check if data already exists locally
2. Only fetch if missing or outdated
3. Store with timestamp
4. Refresh after N days
```

### Progressive Enhancement

Start simple, add detail incrementally:

```
Pass 1: Basic facts (names, dates)
Pass 2: Family relationships
Pass 3: Historical records
Pass 4: Photos and documents
Pass 5: Detailed narratives
```

## Resources

- [Ancestry MCP Tools Reference](README.md#available-tools)
- [Playwright MCP Documentation](https://github.com/microsoft/playwright-mcp)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

## Contributing Workflows

Have a useful workflow? Add it to this document!

1. Fork the repository
2. Add your workflow with clear steps
3. Include why it's useful
4. Submit a pull request
