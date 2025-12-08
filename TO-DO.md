# TODO: Ancestry MCP Server

## Core Functionality
- [ ] Test and refine Ancestry.com selectors for current site structure
  - [ ] Verify login flow selectors
  - [ ] Test person search selectors
  - [ ] Validate profile detail selectors
  - [ ] Check family tree navigation selectors
  - [ ] Confirm records page selectors
  - [ ] Test timeline extraction selectors

## Browser Automation
- [ ] Add retry logic for failed page loads
- [ ] Implement better wait strategies (wait for specific elements instead of networkidle)
- [ ] Add screenshot capability for debugging
- [ ] Handle cookie consent/popup dialogs
- [ ] Implement session persistence (save cookies to avoid re-login)
- [ ] Add user-agent rotation to avoid detection
- [ ] Handle CAPTCHA detection and notification

## Error Handling
- [ ] Add comprehensive try-catch blocks
- [ ] Implement graceful degradation for missing elements
- [ ] Add timeout handling for slow pages
- [ ] Create error recovery strategies
- [ ] Add detailed error messages with debugging info
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
- [ ] Implement recursive tree traversal
- [ ] Add sibling extraction
- [ ] Get extended family (aunts, uncles, cousins)
- [ ] Export tree as JSON structure
- [ ] Calculate relationships between people
- [ ] Add tree statistics (total people, generations, etc.)

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
- [ ] Generate family narratives (multiple people)
- [ ] Create comparison narratives (siblings, generations)
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
- [ ] Export data to GEDCOM format
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

## Priority Order

### Phase 1 (Critical - Get it Working)
1. Test and fix all selectors with real Ancestry.com site
2. Verify login flow
3. Test basic search and profile extraction
4. Add essential error handling

### Phase 2 (Core Features)
1. Implement session persistence
2. Add comprehensive error handling
3. Enhance profile detail extraction
4. Improve family tree navigation

### Phase 3 (Historical Context)
1. Integrate web search for historical narratives
2. Add narrative templates
3. Implement timeline generation

### Phase 4 (Polish)
1. Add testing
2. Improve documentation
3. Performance optimization
4. Add caching

### Phase 5 (Advanced)
1. Additional genealogy site support
2. Advanced features (GEDCOM export, PDF reports)
3. Data validation and conflict detection
