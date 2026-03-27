# Agent Handoff Guide - Ancestry MCP Server

## Project Overview
Building an MCP (Model Context Protocol) server that interfaces with Ancestry.com to search for genealogy records and compile historical information about individuals.

## Current Status

### What's Working
1. ✅ **MCP Server Setup** - Server runs and connects to Claude Code
2. ✅ **Browser Automation** - Playwright browser launches successfully
3. ✅ **Login Flow** - Can navigate to Ancestry.com login page
4. ✅ **Search Form** - Successfully fills in search form fields:
   - First name: `input[name="txtfirstname"]`
   - Last name: `input[name="sfsLastNameExactModule"]`
   - Birth year: `#sfs_EstBirthYearExact`
5. ✅ **Navigation** - Search submits and reaches results page
6. ✅ **Screenshots** - Debug screenshots save to `/tmp/ancestry-results.png`

### Current Problem: Result Extraction
**Issue**: Search works and results page loads (46,118 results visible in screenshot), but JavaScript selector returns 0 results.

**Evidence**:
- Screenshot at `/tmp/ancestry-results.png` shows results displayed correctly
- Page shows "All results for Iva Mae Halm" with "1-20 of 46,118"
- Result #3 is the target: "Iva M Halm, born 23 Dec 1934, died 11 Mar 2012"

**Root Cause**: The CSS/DOM selectors in `page.evaluate()` aren't matching Ancestry's HTML structure.

**Selectors Tried** (all failed):
- `[role="result"]` - returned 0
- `.searchResult, article` - returned 0
- `li[role="listitem"]` - returned 0

## Next Steps

### Immediate Priority: Fix Result Extraction

1. **Inspect the actual HTML structure**:
   ```bash
   # HTML saved to: /tmp/ancestry-results.html
   # Open it and find the actual selectors for result items
   open /tmp/ancestry-results.html
   ```

2. **Look for these patterns** in the HTML:
   - Container divs/sections that wrap each result
   - Class names on result items
   - Data attributes (data-*)
   - Unique IDs or aria-labels

3. **Update the selector** in `index.js` line 399-431:
   ```javascript
   // Current (broken) code:
   const resultContainers = document.querySelectorAll('li[role="listitem"]');

   // Replace with correct selector from HTML inspection
   ```

4. **Test extraction patterns**:
   - Name: Look for text matching "Name" label
   - Birth: Look for text matching "Birth" label
   - Death: Look for text matching "Death" label
   - Collection: Link text (usually an h2 or h3)
   - URL: href from the collection link

### Login Verification
**Potential Issue**: Results may be blurred if not properly logged in.

**Check**:
1. Verify login is successful (added checks at line 275-285)
2. Check if results in screenshot show blurred/hidden data
3. Look for "xxx xxxx" placeholders indicating hidden data

**Debug**:
```bash
# Check MCP server logs for:
# "[DEBUG] Login successful!"
# "[DEBUG] After login, URL is: ..."
```

## File Locations

### Important Files
- **Main server**: `/Users/corytrimm/Documents/GitHub/local-mcp-server-ancestry/index.js`
- **Debug screenshot**: `/tmp/ancestry-results.png`
- **Debug HTML**: `/tmp/ancestry-results.html`
- **Config**: Environment variables for `ANCESTRY_USERNAME` and `ANCESTRY_PASSWORD`

### Key Code Sections in index.js

#### Login (lines 249-298)
- Navigates to signin page
- Fills username/password
- Verifies successful login
- Timeout: 60 seconds

#### Search (lines 300-455)
- Fills search form
- Handles 3-step modal dialog
- Extracts results (BROKEN - needs fixing)
- Returns formatted summary

#### Result Extraction (lines 394-431)
**THIS IS WHERE THE BUG IS** - needs correct selectors

## Testing Guide

### How to Test Changes

1. **Make code changes** to `index.js`

2. **Restart MCP server**:
   ```bash
   # User runs: /exit then restarts Claude Code
   # Or: /mcp to reconnect
   ```

3. **Run test search**:
   ```javascript
   mcp__ancestry__ancestry_search_person({
     firstName: "Iva Mae",
     lastName: "Halm",
     birthYear: "1934",
     deathYear: "2012"
   })
   ```

4. **Check results**:
   - Should return ~10 results
   - Each should have: name, birth, death, residence, collection, url
   - Target result: "Iva M Halm" born Dec 23 1934, died Mar 11 2012

5. **Debug files**:
   - Screenshot: `open /tmp/ancestry-results.png`
   - HTML: `open /tmp/ancestry-results.html`

### Example Successful Output
```
Found 10 results for Iva Mae Halm (b. 1934) (d. 2012)

Top 10 results:

1. Iva M Halm
   Collection: U.S., Find a Grave® Index, 1600s-Current
   Birth: 23 Dec 1934 Philadelphia, Pennsylvania
   Death: 11 Mar 2012 Louisville, Stark County, Ohio
   Residence: N/A
   URL: https://www.ancestry.com/...

2. [next result]
...
```

## Optimization Notes

### Response Size (Important!)
- Original response was ~12.7k tokens (too large)
- **Limit to 10 results** (not 20)
- **Only return essential fields**: name, birth, death, residence
- **Skip hidden data**: ignore fields with "xxx xxxx"
- **Use formatted text**: not verbose JSON

### Modal Dialog Handling (lines 337-386)
The search triggers a 3-step "Improve your results" modal:
- **Step 1**: Location (fill if provided, else "I don't know")
- **Step 2**: Birth year (fill if provided, else "I don't know")
- **Step 3**: Relatives (always click "Search" button)

## Known Issues

1. **Enter key vs Click**: Changed to use `keyboard.press('Enter')` instead of clicking search button (more reliable)

2. **Timeout settings**: All set to 60 seconds with `domcontentloaded` instead of `networkidle`

3. **Death year**: Removed from initial form (was causing timeouts with "Show more options" flow)

## Environment Requirements

- Node.js with Playwright installed
- Chrome/Chromium browser
- Environment variables:
  - `ANCESTRY_USERNAME` - Ancestry.com account email
  - `ANCESTRY_PASSWORD` - Ancestry.com account password

## User Context

**User's Goal**: Search for their grandmother "Iva Mae Halm (Jensen)" who was born in 1934 and died in 2012, and compile historical information about her.

**Why This Matters**: The user wants to use Claude Code with MCP servers to automate genealogy research and create historical narratives.

## Quick Win: HTML Inspection Script

To quickly find the right selectors, run this in the HTML file:

```javascript
// Open /tmp/ancestry-results.html in browser console
document.querySelectorAll('*').forEach(el => {
  const text = el.textContent;
  if (text.includes('Iva M Halm') && text.length < 500) {
    console.log('Found result container:', el.tagName, el.className, el);
  }
});
```

This will show you the actual container elements holding the results.

## Success Criteria

✅ Search returns 10 results
✅ Each result has name, birth, death extracted
✅ URLs are valid Ancestry.com record links
✅ Response is < 5k tokens
✅ Target result (Iva M Halm 1934-2012) is in top 10

Good luck! The hard part (navigation, login, form filling) is done. Just need to fix the selector and you're golden.
