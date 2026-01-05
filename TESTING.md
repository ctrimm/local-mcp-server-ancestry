# Testing the Ancestry MCP Server

## Quick Test Checklist

After making code changes, follow these steps to test:

### 1. Restart the MCP Server

If running in Claude Code:
```
/mcp restart
```

Or exit and restart Claude Code entirely.

### 2. Test Login

```
Use the ancestry_login tool to log in to Ancestry
```

Expected output:
```
Successfully logged in to Ancestry.com
```

Check logs for:
- `[DEBUG] Login successful!`
- `[DEBUG] After login, URL is: ...` (should not contain 'signin')

### 3. Test Search

```
Use ancestry_search_person with:
- firstName: "Iva Mae"
- lastName: "Halm"
- birthYear: "1934"
- deathYear: "2012"
```

Expected output:
```
Found 10 results for Iva Mae Halm (b. 1934) (d. 2012)

Top 10 results:

1. Iva M Halm
   Collection: U.S., Find a Grave® Index, 1600s-Current
   Birth: 23 Dec 1934
   Death: 11 Mar 2012
   Residence: Louisville, Ohio
   URL: https://www.ancestry.com/...
```

Check logs for:
- `[DEBUG] Starting search - logged in status: true`
- `[DEBUG] Navigating to advanced search page...`
- `[DEBUG] Filling first name: Iva Mae`
- `[DEBUG] Found X elements with selector: ...`
- `[DEBUG] Extracted X results successfully`
- `[DEBUG] First result sample: { ... }`

### 4. Check Debug Files

```bash
# View screenshot
open /tmp/ancestry-results.png

# View HTML
open /tmp/ancestry-results.html
```

Verify:
- Screenshot shows results page with data visible
- Results are NOT blurred (indicates login worked)
- HTML contains result elements

### 5. Test Other Functions

Once search works, test:

```
# Get person details
Use ancestry_get_person_details with the URL from a search result

# Get timeline
Use ancestry_get_timeline with a profile URL

# Get records
Use ancestry_get_records with a profile URL
```

## Common Issues and Solutions

### Issue: "0 results extracted"

**Symptoms:**
- Search completes but returns 0 results
- Screenshot shows results ARE visible
- Logs show: `[DEBUG] Found 0 elements with selector: ...`

**Solution:**
1. Check `/tmp/ancestry-results.html` for actual HTML structure
2. Look for result container elements
3. Update selectors in `index.js` lines 430-444
4. The new multi-selector strategy should handle this automatically

**Debug:**
```bash
# Open HTML in browser and run in console:
document.querySelectorAll('a[href*="/collections/"]').length
# Should show number of collection links found

# Find parent containers:
document.querySelectorAll('a[href*="/collections/"]')[0].parentElement
```

### Issue: "Login appears to have failed"

**Symptoms:**
- URL still contains 'signin' after login attempt
- Results are blurred in screenshot

**Solution:**
1. Verify credentials in environment:
   ```bash
   echo $ANCESTRY_USERNAME
   echo $ANCESTRY_PASSWORD
   ```
2. Try logging in manually at ancestry.com with same credentials
3. Check if 2FA is enabled (currently not supported)
4. Look for CAPTCHA in screenshot

### Issue: "Timeout" errors

**Symptoms:**
- Errors like "Timeout 60000ms exceeded"
- Operations fail to complete

**Solution:**
1. Check internet connection
2. Verify Ancestry.com is accessible
3. Increase timeout values in code (currently 60s)
4. Switch from `networkidle` to `domcontentloaded` (already done)

### Issue: Modal dialog problems

**Symptoms:**
- Search hangs after pressing Enter
- Logs show modal dialog errors

**Solution:**
- Modal handling is implemented (lines 339-391)
- If it fails, check if Ancestry changed modal structure
- May need to update button text selectors

### Issue: Selectors not matching

**Symptoms:**
- Functions return empty data
- Logs show extraction errors

**Solution:**
1. Ancestry.com updates their HTML frequently
2. Check debug screenshot to see what's visible
3. Save HTML and inspect actual structure
4. Update selectors to match current structure
5. The new multi-selector strategy tries 7+ different patterns

## Debug Logging

All functions now include extensive debug logging:

- `[DEBUG]` - Normal debug information
- `[WARNING]` - Potential issues that might affect results
- `[ERROR]` - Actual errors
- `[BROWSER ERROR]` - JavaScript errors from the browser page

Enable in Claude Code with verbose mode or check MCP server stderr output.

## Testing Different Scenarios

### Test Case 1: Person with Many Results
```javascript
{
  firstName: "John",
  lastName: "Smith",
  birthYear: "1850"
}
```
Expected: Many results (10+), should extract top 10

### Test Case 2: Person with Few Results
```javascript
{
  firstName: "Iva Mae",
  lastName: "Halm",
  birthYear: "1934"
}
```
Expected: Specific results, target person should be in top 10

### Test Case 3: No Birth Year
```javascript
{
  firstName: "Mary",
  lastName: "Johnson"
}
```
Expected: Very broad results, modal should prompt for more info

### Test Case 4: With Location
```javascript
{
  firstName: "James",
  lastName: "Wilson",
  birthYear: "1845",
  location: "Ohio"
}
```
Expected: Filtered results for Ohio region

## Performance Notes

- Search typically takes 10-20 seconds (page loads, modal, extraction)
- Login takes 5-10 seconds
- Profile details take 5-10 seconds
- Screenshot/HTML save adds ~2 seconds

## Success Criteria

✅ Login completes without errors
✅ Search returns 10 results (or fewer if < 10 exist)
✅ Each result has at least collection name or person name
✅ URLs are valid Ancestry.com links
✅ Response is readable and formatted
✅ Debug files are created and show data
✅ No timeout errors
✅ Results match what's visible in screenshot

## Next Steps After Successful Test

1. Remove or reduce debug logging for production
2. Implement remaining tools (get_person_details improvements)
3. Add caching to avoid re-login
4. Implement session persistence
5. Add more robust error recovery

## Need Help?

- Check AGENT_HANDOFF.md for detailed problem description
- Check DEBUG_CHECKLIST.md for quick fixes
- Review logs for specific error messages
- Inspect debug files (screenshot and HTML)
