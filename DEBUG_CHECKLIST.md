# Quick Debug Checklist

## The Problem in 3 Lines
- ✅ Search works, results page loads with 46k results
- ❌ Result extraction returns 0 results
- 🔍 Wrong CSS selectors in `page.evaluate()` at line 399

## Fix It in 5 Steps

### 1. Open the saved HTML
```bash
open /tmp/ancestry-results.html
```

### 2. Find the result container selector
Right-click on a result item → Inspect → note the element tag and classes

### 3. Update line 399 in index.js
Replace:
```javascript
const resultContainers = document.querySelectorAll('li[role="listitem"]');
```

With the correct selector you found.

### 4. Restart MCP server
User runs: `/mcp` to reconnect

### 5. Test
```javascript
mcp__ancestry__ancestry_search_person({
  firstName: "Iva Mae",
  lastName: "Halm",
  birthYear: "1934"
})
```

## Expected Result
```
Found 10 results for Iva Mae Halm (b. 1934)

Top 10 results:

1. Iva M Halm
   Collection: U.S., Find a Grave® Index
   Birth: 23 Dec 1934 Philadelphia, Pennsylvania
   Death: 11 Mar 2012 Louisville, Ohio
   ...
```

## If Still Broken

Check these in order:

1. **Login issue?**
   - Look at screenshot: `/tmp/ancestry-results.png`
   - Are results blurred/hidden?
   - Check logs for: "[DEBUG] Login successful!"

2. **Wrong page?**
   - Check logs for: "[DEBUG] Page URL: ..."
   - Should be: `ancestry.com/search/?name=...`

3. **Selector still wrong?**
   - Use browser console on the HTML file:
   ```javascript
   // Find what contains the results
   document.querySelectorAll('*').forEach(el => {
     if (el.textContent.includes('Iva M Halm') && el.textContent.length < 500) {
       console.log(el.tagName, el.className, el.getAttribute('role'));
     }
   });
   ```

## Files to Check
- Code: `index.js` lines 394-431
- Screenshot: `/tmp/ancestry-results.png`
- HTML: `/tmp/ancestry-results.html`
- Logs: MCP server stderr (shown in terminal)

## Key Insight
The screenshot proves the search WORKS and results ARE THERE.
This is purely a DOM selector issue. Nothing else.
