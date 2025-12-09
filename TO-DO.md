# TODO: Ancestry MCP Server

## Recently Completed ✅
- [x] **GEDCOM File Support** - Full implementation with 12 tools for storytelling
- [x] **Storytelling Tools (Phase 2 Complete)** - Relationship explainer, life summary (4 styles), migration story, family saga, sibling comparison
- [x] **Security Fix** - Updated MCP SDK from 0.6.0 to 1.24.3 (fixed DNS rebinding vulnerability)
- [x] **Session Persistence** - Saves login cookies to `.ancestry-session.json`
- [x] **Screenshot Debugging** - Automatically captures screenshots on errors
- [x] **Popup Handling** - Detects and closes cookie consent dialogs
- [x] **Retry Logic** - Automatic retry with exponential backoff for failed operations
- [x] **Error Handling** - Comprehensive try-catch blocks with detailed error messages
- [x] **Graceful Degradation** - Continues operation when some elements are missing
- [x] **Documentation** - Updated README with all GEDCOM storytelling tools

## Storytelling & Narrative Features (HIGH PRIORITY)
*Focus: Help AI models parse genealogy data and create compelling stories for users*

### Interactive Q&A Tools
- [ ] **gedcom_ask_about_person** - Answer natural language questions about a person (e.g., "Where did they live?", "How many children?")
- [x] **gedcom_relationship_explainer** - Calculate and explain relationships between any two people with narrative description
- [x] **gedcom_life_summary** - Generate different narrative styles (brief, detailed, chronological, thematic)

### Multi-Person Narratives
- [x] **gedcom_family_saga** - Generate chronological narrative spanning multiple family members
- [x] **gedcom_sibling_comparison** - Compare and contrast life experiences of siblings
- [ ] **gedcom_generational_comparison** - Compare experiences across generations (parent vs child)
- [x] **gedcom_migration_story** - Trace family movements over generations with narrative context

### Context Enrichment
- [ ] **gedcom_enrich_events** - Add historical/cultural context to specific life events
- [ ] **gedcom_occupation_context** - Explain what their occupation meant in that era
- [ ] **gedcom_location_history** - Get historical info about places they lived
- [ ] **gedcom_era_context** - Describe what life was like during their lifetime

### Timeline Tools
- [ ] **gedcom_timeline_comparison** - Compare timelines of multiple people side-by-side
- [ ] **gedcom_family_timeline** - Create combined timeline for an entire family unit
- [ ] **gedcom_event_significance** - Explain significance of events in historical context

## Core Functionality
- [ ] Test and refine Ancestry.com selectors for current site structure
  - [ ] Verify login flow selectors
  - [ ] Test person search selectors
  - [ ] Validate profile detail selectors
  - [ ] Check family tree navigation selectors
  - [ ] Confirm records page selectors
  - [ ] Test timeline extraction selectors

## Browser Automation
- [x] Add retry logic for failed page loads
- [x] Implement better wait strategies (wait for specific elements instead of networkidle)
- [x] Add screenshot capability for debugging
- [x] Handle cookie consent/popup dialogs
- [x] Implement session persistence (save cookies to avoid re-login)
- [ ] Add user-agent rotation to avoid detection
- [ ] Handle CAPTCHA detection and notification

## Error Handling
- [x] Add comprehensive try-catch blocks
- [x] Implement graceful degradation for missing elements
- [x] Add timeout handling for slow pages
- [x] Create error recovery strategies
- [x] Add detailed error messages with debugging info
- [ ] Implement logging system (file-based logs)

## Authentication
- [ ] Test login flow with real credentials
- [ ] Handle two-factor authentication if enabled
- [ ] Add session validation checks
- [ ] Implement automatic re-login on session expiration
- [ ] Add option for cookie-based authentication

## Search Improvements
- [ ] Add fuzzy search capabilities
- [ ] Implement search result filtering
- [ ] Add pagination support for large result sets
- [ ] Include search result ranking/relevance scores
- [ ] Add advanced search options (residence, relatives, etc.)

## Profile Details Enhancement
- [ ] Extract all available life events
- [ ] Get attached photos and documents
- [ ] Extract DNA match information (if available)
- [ ] Get residence history
- [ ] Extract military records
- [ ] Parse occupation information
- [ ] Get immigration records

## Family Tree Features
- [x] Implement recursive tree traversal (GEDCOM ancestors/descendants)
- [x] Add sibling extraction (via GEDCOM family tool)
- [ ] Get extended family (aunts, uncles, cousins) - partial via GEDCOM
- [x] Export tree as JSON structure (GEDCOM tools return JSON)
- [ ] Calculate relationships between people (basic parent/child done, need full relationship calculator)
- [x] Add tree statistics (total people, generations, etc.) - shown in gedcom_load

## Records Management
- [ ] Parse different record types (census, birth, death, marriage)
- [ ] Extract text from record images (OCR)
- [ ] Download record images
- [ ] Filter records by type
- [ ] Add record source citations

## Timeline & Events
- [ ] Sort events chronologically
- [ ] Calculate ages at each event
- [ ] Group related events
- [ ] Add event categorization
- [ ] Create visual timeline representation
- [ ] Export timeline to various formats

## Historical Narrative Generation
- [x] Basic narrative generation implemented (works for both web scraping and GEDCOM)
- [ ] Integrate web search for historical context
  - [ ] Search for major events during person's lifetime
  - [ ] Get regional history for birth/death locations
  - [ ] Find historical context for immigration patterns
  - [ ] Research occupation history and economic conditions
- [ ] Add narrative templates for different scenarios
  - [ ] Immigration stories
  - [ ] Military service narratives
  - [ ] Pioneer/settlement stories
  - [ ] Urban vs rural experiences
- [ ] Include statistical/demographic context
- [ ] Add cultural and social context
- [ ] Generate family narratives (multiple people) - **See Storytelling section above**
- [ ] Create comparison narratives (siblings, generations) - **See Storytelling section above**
- [ ] Add citation support for sources used

## Performance
- [ ] Implement caching for frequently accessed pages
- [ ] Add request throttling to respect rate limits
- [ ] Optimize parallel requests where possible
- [ ] Reduce memory footprint
- [ ] Add progress indicators for long operations

## Testing
- [ ] Create unit tests for core functions
- [ ] Add integration tests with mock Ancestry pages
- [ ] Test error scenarios
- [ ] Performance benchmarking
- [ ] Add test fixtures for common scenarios

## Documentation
- [ ] Add JSDoc comments to all functions
- [ ] Create detailed API documentation
- [ ] Add more usage examples
- [ ] Create video tutorial
- [ ] Document common issues and solutions
- [ ] Add architecture diagrams

## Additional Features
- [x] Import data from GEDCOM format (parse-gedcom library)
- [ ] Export data to GEDCOM format (from web scraping)
- [ ] Generate PDF reports
- [ ] Create family group sheets
- [ ] Add photo organization tools
- [ ] Implement data backup functionality
- [ ] Add conflict detection (duplicate people, inconsistent dates)
- [ ] Create data validation tools
- [ ] Add hints and suggestions system
- [ ] Implement smart record matching

## Configuration
- [ ] Add config file support (beyond env vars)
- [ ] Allow custom selector configurations
- [ ] Add feature flags
- [ ] Support multiple Ancestry accounts
- [ ] Add proxy support
- [ ] Allow custom browser options

## Monitoring & Observability
- [ ] Add structured logging
- [ ] Implement metrics collection
- [ ] Add health check endpoint
- [ ] Create dashboard for monitoring usage
- [ ] Track tool usage statistics

## Security
- [ ] Implement credential encryption
- [ ] Add secure credential storage options
- [ ] Audit for security vulnerabilities
- [ ] Add input validation and sanitization
- [ ] Implement rate limiting per user

## Compliance
- [ ] Review Ancestry.com Terms of Service compliance
- [ ] Add respect for robots.txt
- [ ] Implement proper attribution
- [ ] Add privacy policy for any stored data
- [ ] Document data retention policies

## Nice to Have
- [ ] Support for other genealogy sites (FamilySearch, MyHeritage)
- [ ] DNA analysis integration
- [ ] Map visualization of migration patterns
- [ ] Automated research suggestions
- [ ] Collaboration features (share findings)
- [ ] Integration with other MCP servers
- [ ] Mobile app companion
- [ ] Voice interface support

## Deployment
- [ ] Create Docker container
- [ ] Add installation script
- [ ] Create release pipeline
- [ ] Add update mechanism
- [ ] Create deployment documentation

## Known Issues to Fix
- [ ] Handle login redirects properly
- [ ] Fix potential race conditions in page loads
- [ ] Handle rate limiting gracefully
- [ ] Fix memory leaks in long-running sessions

---

## Priority Order (Updated for Storytelling Focus)

### Phase 1 ✅ COMPLETE - Foundation
1. ✅ GEDCOM file support
2. ✅ Security fixes
3. ✅ Basic narrative generation
4. ✅ Session persistence and error handling

### Phase 2 ✅ MOSTLY COMPLETE - Storytelling Tools
**Goal: Help AI models create compelling stories from genealogy data**
1. ✅ **gedcom_relationship_explainer** - Calculate how people are related with narrative explanation
2. ✅ **gedcom_life_summary** - Multiple narrative styles (brief/detailed/chronological/thematic)
3. ✅ **gedcom_family_saga** - Multi-person chronological narratives
4. ✅ **gedcom_sibling_comparison** - Compare life experiences of siblings
5. ✅ **gedcom_migration_story** - Track family movements over generations

### Phase 3 - Context Enrichment
1. Integrate web search for historical context
2. **gedcom_occupation_context** - Explain occupations in historical context
3. **gedcom_location_history** - Historical info about places
4. **gedcom_era_context** - What life was like during their lifetime
5. Add narrative templates (immigration, military, pioneer stories)

### Phase 4 - Interactive Features
1. **gedcom_ask_about_person** - Natural language Q&A about individuals
2. **gedcom_timeline_comparison** - Side-by-side timeline comparisons
3. **gedcom_generational_comparison** - Compare parent vs child experiences
4. Timeline and event significance tools

### Phase 5 - Web Scraping Enhancement
1. Test and fix all Ancestry.com selectors
2. Verify login flow with real credentials
3. Enhanced profile detail extraction
4. Records and timeline extraction improvements

### Phase 6 - Advanced Features
1. PDF report generation
2. Export to GEDCOM from web scraping
3. Data validation and conflict detection
4. Testing and performance optimization
