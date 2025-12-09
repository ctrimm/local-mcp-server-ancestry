#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import parseGedcom from 'parse-gedcom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Ancestry.com MCP Server
 * Provides tools for exploring genealogy data and creating historical narratives
 */

class AncestryMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ancestry-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;

    // Get credentials from environment variables
    this.username = process.env.ANCESTRY_USERNAME;
    this.password = process.env.ANCESTRY_PASSWORD;

    // GEDCOM file support
    this.gedcomFilePath = process.env.GEDCOM_FILE;
    this.gedcomData = null;
    this.gedcomIndex = null; // Index for fast lookups

    // Retry configuration
    this.maxRetries = 3;
    this.retryDelay = 2000; // Start with 2 seconds

    // Session persistence
    this.sessionFile = path.join(__dirname, '.ancestry-session.json');

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Retry a function with exponential backoff
   */
  async retryWithBackoff(fn, context = '') {
    let lastError;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.error(`[Retry ${attempt + 1}/${this.maxRetries}] ${context} failed: ${error.message}`);

        if (attempt < this.maxRetries - 1) {
          console.error(`Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }
    throw new Error(`${context} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(name = 'debug') {
    try {
      const screenshotPath = path.join(__dirname, `screenshot-${name}-${Date.now()}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      console.error(`Failed to take screenshot: ${error.message}`);
      return null;
    }
  }

  /**
   * Handle common popups and cookie consent dialogs
   */
  async handlePopups() {
    try {
      // Try to close cookie consent
      const cookieButtons = [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("I Accept")',
        '[data-testid="cookie-accept"]',
        '.cookie-accept',
      ];

      for (const selector of cookieButtons) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click({ timeout: 1000 });
            console.error('Closed cookie consent dialog');
            await this.sleep(500);
            break;
          }
        } catch (e) {
          // Ignore if button not found
        }
      }
    } catch (error) {
      // Silently fail - popups are optional
    }
  }

  /**
   * Save session cookies
   */
  async saveSession() {
    try {
      const cookies = await this.context.cookies();
      await fs.writeFile(this.sessionFile, JSON.stringify(cookies, null, 2));
      console.error('Session saved');
    } catch (error) {
      console.error(`Failed to save session: ${error.message}`);
    }
  }

  /**
   * Load session cookies
   */
  async loadSession() {
    try {
      const data = await fs.readFile(this.sessionFile, 'utf-8');
      const cookies = JSON.parse(data);
      await this.context.addCookies(cookies);
      console.error('Session loaded');
      return true;
    } catch (error) {
      console.error('No saved session found');
      return false;
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'ancestry_login',
          description: 'Login to Ancestry.com using credentials from config',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'ancestry_search_person',
          description: 'Search for a person on Ancestry.com by name and optional birth/death years',
          inputSchema: {
            type: 'object',
            properties: {
              firstName: {
                type: 'string',
                description: 'First name of the person',
              },
              lastName: {
                type: 'string',
                description: 'Last name of the person',
              },
              birthYear: {
                type: 'string',
                description: 'Birth year (optional)',
              },
              deathYear: {
                type: 'string',
                description: 'Death year (optional)',
              },
              location: {
                type: 'string',
                description: 'Location (optional)',
              },
            },
            required: ['firstName', 'lastName'],
          },
        },
        {
          name: 'ancestry_get_person_details',
          description: 'Get detailed information about a person from their profile page',
          inputSchema: {
            type: 'object',
            properties: {
              profileUrl: {
                type: 'string',
                description: 'URL of the person\'s Ancestry profile',
              },
            },
            required: ['profileUrl'],
          },
        },
        {
          name: 'ancestry_get_tree_view',
          description: 'Get a view of the family tree for a person',
          inputSchema: {
            type: 'object',
            properties: {
              treeUrl: {
                type: 'string',
                description: 'URL of the family tree',
              },
              generations: {
                type: 'number',
                description: 'Number of generations to explore (default: 2)',
              },
            },
            required: ['treeUrl'],
          },
        },
        {
          name: 'ancestry_get_records',
          description: 'Get historical records attached to a person',
          inputSchema: {
            type: 'object',
            properties: {
              profileUrl: {
                type: 'string',
                description: 'URL of the person\'s profile',
              },
            },
            required: ['profileUrl'],
          },
        },
        {
          name: 'ancestry_get_timeline',
          description: 'Extract timeline events for a person',
          inputSchema: {
            type: 'object',
            properties: {
              profileUrl: {
                type: 'string',
                description: 'URL of the person\'s profile',
              },
            },
            required: ['profileUrl'],
          },
        },
        {
          name: 'generate_historical_narrative',
          description: 'Generate a historical narrative for a person based on their life events and historical context. Uses web search to gather historical information about the time period and region.',
          inputSchema: {
            type: 'object',
            properties: {
              personData: {
                type: 'object',
                description: 'Object containing person information (name, birth/death dates, locations, events)',
                properties: {
                  name: { type: 'string' },
                  birthDate: { type: 'string' },
                  birthPlace: { type: 'string' },
                  deathDate: { type: 'string' },
                  deathPlace: { type: 'string' },
                  events: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        date: { type: 'string' },
                        location: { type: 'string' },
                      },
                    },
                  },
                },
              },
              includeWorldEvents: {
                type: 'boolean',
                description: 'Whether to include major world events during their lifetime (default: true)',
              },
              includeRegionalHistory: {
                type: 'boolean',
                description: 'Whether to include regional history and context (default: true)',
              },
            },
            required: ['personData'],
          },
        },
        {
          name: 'gedcom_load',
          description: 'Load and parse a GEDCOM file from the specified path. This makes the genealogy data available for other GEDCOM tools.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the GEDCOM file (optional if GEDCOM_FILE env var is set)',
              },
            },
            required: [],
          },
        },
        {
          name: 'gedcom_search_person',
          description: 'Search for people in the loaded GEDCOM file by name, dates, or location',
          inputSchema: {
            type: 'object',
            properties: {
              firstName: {
                type: 'string',
                description: 'First name to search for',
              },
              lastName: {
                type: 'string',
                description: 'Last name to search for',
              },
              birthYear: {
                type: 'string',
                description: 'Birth year (approximate match)',
              },
              deathYear: {
                type: 'string',
                description: 'Death year (approximate match)',
              },
            },
            required: [],
          },
        },
        {
          name: 'gedcom_get_person',
          description: 'Get complete details about a specific person from the GEDCOM file',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID (e.g., "@I123@")',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_get_ancestors',
          description: 'Get ancestors of a person (parents, grandparents, etc.) from GEDCOM',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              generations: {
                type: 'number',
                description: 'Number of generations to retrieve (default: 3)',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_get_descendants',
          description: 'Get descendants of a person (children, grandchildren, etc.) from GEDCOM',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              generations: {
                type: 'number',
                description: 'Number of generations to retrieve (default: 3)',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_get_family',
          description: 'Get immediate family (parents, spouse(s), children) for a person from GEDCOM',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_generate_narrative',
          description: 'Generate a rich historical narrative for a person using data from GEDCOM file',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              includeWorldEvents: {
                type: 'boolean',
                description: 'Include major world events (default: true)',
              },
              includeRegionalHistory: {
                type: 'boolean',
                description: 'Include regional history (default: true)',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_relationship_explainer',
          description: 'Calculate and explain the relationship between two people in the GEDCOM file with a narrative description',
          inputSchema: {
            type: 'object',
            properties: {
              person1Id: {
                type: 'string',
                description: 'The GEDCOM individual ID of the first person',
              },
              person2Id: {
                type: 'string',
                description: 'The GEDCOM individual ID of the second person',
              },
            },
            required: ['person1Id', 'person2Id'],
          },
        },
        {
          name: 'gedcom_life_summary',
          description: 'Generate a life summary for a person in different narrative styles (brief, detailed, chronological, thematic)',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              style: {
                type: 'string',
                description: 'Narrative style: "brief" (1-2 paragraphs), "detailed" (comprehensive), "chronological" (timeline-focused), "thematic" (organized by life themes)',
                enum: ['brief', 'detailed', 'chronological', 'thematic'],
              },
            },
            required: ['individualId', 'style'],
          },
        },
        {
          name: 'gedcom_migration_story',
          description: 'Trace family movements and migrations across generations, creating a rich narrative of geographic journey',
          inputSchema: {
            type: 'object',
            properties: {
              startingPersonId: {
                type: 'string',
                description: 'The GEDCOM individual ID to start the migration story from',
              },
              generations: {
                type: 'number',
                description: 'Number of generations to trace (default: 4)',
              },
              direction: {
                type: 'string',
                description: 'Direction to trace: "ancestors" (backward in time), "descendants" (forward in time), or "both"',
                enum: ['ancestors', 'descendants', 'both'],
              },
            },
            required: ['startingPersonId'],
          },
        },
        {
          name: 'gedcom_family_saga',
          description: 'Generate a chronological narrative spanning multiple family members, weaving their stories together',
          inputSchema: {
            type: 'object',
            properties: {
              familyIds: {
                type: 'array',
                description: 'Array of GEDCOM individual IDs to include in the saga',
                items: {
                  type: 'string',
                },
              },
              focusPersonId: {
                type: 'string',
                description: 'Optional: ID of person to center the narrative around',
              },
            },
            required: ['familyIds'],
          },
        },
        {
          name: 'gedcom_sibling_comparison',
          description: 'Compare and contrast the life experiences of siblings, highlighting similarities and differences',
          inputSchema: {
            type: 'object',
            properties: {
              siblingIds: {
                type: 'array',
                description: 'Array of GEDCOM individual IDs of siblings to compare',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['siblingIds'],
          },
        },
        {
          name: 'gedcom_generational_comparison',
          description: 'Compare experiences across generations (parent vs child, grandparent vs grandchild), showing how life changed over time',
          inputSchema: {
            type: 'object',
            properties: {
              olderGenerationId: {
                type: 'string',
                description: 'The GEDCOM individual ID of the older generation person (parent/grandparent)',
              },
              youngerGenerationId: {
                type: 'string',
                description: 'The GEDCOM individual ID of the younger generation person (child/grandchild)',
              },
            },
            required: ['olderGenerationId', 'youngerGenerationId'],
          },
        },
        {
          name: 'gedcom_ask_about_person',
          description: 'Answer natural language questions about a person (e.g., "Where did they live?", "How many children?", "When did they marry?")',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              question: {
                type: 'string',
                description: 'Natural language question about the person',
              },
            },
            required: ['individualId', 'question'],
          },
        },
        {
          name: 'gedcom_location_history',
          description: 'Get historical information about places where a person lived, providing geographic and historical context',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
            },
            required: ['individualId'],
          },
        },
        {
          name: 'gedcom_era_context',
          description: 'Describe what life was like during a person\'s lifetime, including major historical events and social conditions',
          inputSchema: {
            type: 'object',
            properties: {
              individualId: {
                type: 'string',
                description: 'The GEDCOM individual ID',
              },
              includeWorldEvents: {
                type: 'boolean',
                description: 'Include major world events during their lifetime (default: true)',
              },
            },
            required: ['individualId'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'ancestry_login':
            return await this.login();
          
          case 'ancestry_search_person':
            return await this.searchPerson(args);
          
          case 'ancestry_get_person_details':
            return await this.getPersonDetails(args.profileUrl);
          
          case 'ancestry_get_tree_view':
            return await this.getTreeView(args.treeUrl, args.generations || 2);
          
          case 'ancestry_get_records':
            return await this.getRecords(args.profileUrl);
          
          case 'ancestry_get_timeline':
            return await this.getTimeline(args.profileUrl);
          
          case 'generate_historical_narrative':
            return await this.generateNarrative(args);

          // GEDCOM tools
          case 'gedcom_load':
            return await this.loadGedcom(args.filePath);

          case 'gedcom_search_person':
            return await this.gedcomSearchPerson(args);

          case 'gedcom_get_person':
            return await this.gedcomGetPerson(args.individualId);

          case 'gedcom_get_ancestors':
            return await this.gedcomGetAncestors(args.individualId, args.generations || 3);

          case 'gedcom_get_descendants':
            return await this.gedcomGetDescendants(args.individualId, args.generations || 3);

          case 'gedcom_get_family':
            return await this.gedcomGetFamily(args.individualId);

          case 'gedcom_generate_narrative':
            return await this.gedcomGenerateNarrative(args);

          case 'gedcom_relationship_explainer':
            return await this.gedcomRelationshipExplainer(args.person1Id, args.person2Id);

          case 'gedcom_life_summary':
            return await this.gedcomLifeSummary(args.individualId, args.style);

          case 'gedcom_migration_story':
            return await this.gedcomMigrationStory(args.startingPersonId, args.generations || 4, args.direction || 'ancestors');

          case 'gedcom_family_saga':
            return await this.gedcomFamilySaga(args.familyIds, args.focusPersonId);

          case 'gedcom_sibling_comparison':
            return await this.gedcomSiblingComparison(args.siblingIds);

          case 'gedcom_generational_comparison':
            return await this.gedcomGenerationalComparison(args.olderGenerationId, args.youngerGenerationId);

          case 'gedcom_ask_about_person':
            return await this.gedcomAskAboutPerson(args.individualId, args.question);

          case 'gedcom_location_history':
            return await this.gedcomLocationHistory(args.individualId);

          case 'gedcom_era_context':
            return await this.gedcomEraContext(args.individualId, args.includeWorldEvents !== false);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async initBrowser() {
    if (!this.browser) {
      try {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        this.context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        this.page = await this.context.newPage();

        // Set default timeout
        this.page.setDefaultTimeout(30000);

        console.error('Browser initialized successfully');
      } catch (error) {
        throw new Error(`Failed to initialize browser: ${error.message}`);
      }
    }
  }

  async login() {
    if (!this.username || !this.password) {
      throw new Error('ANCESTRY_USERNAME and ANCESTRY_PASSWORD must be set in environment');
    }

    await this.initBrowser();

    // Try loading saved session first
    const sessionLoaded = await this.loadSession();
    if (sessionLoaded) {
      // Verify session is still valid
      try {
        await this.page.goto('https://www.ancestry.com', { timeout: 15000 });
        await this.handlePopups();

        // Check if we're logged in
        const isStillLoggedIn = await this.page.evaluate(() => {
          return !window.location.href.includes('signin');
        });

        if (isStillLoggedIn) {
          this.isLoggedIn = true;
          console.error('Using saved session');
          return {
            content: [
              {
                type: 'text',
                text: 'Successfully logged in using saved session',
              },
            ],
          };
        }
      } catch (error) {
        console.error('Saved session invalid, logging in fresh');
      }
    }

    // Perform fresh login with retry
    return await this.retryWithBackoff(async () => {
      try {
        await this.page.goto('https://www.ancestry.com/account/signin', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await this.handlePopups();

        // Wait for login form
        await this.page.waitForSelector('input[name="username"], input[type="email"]', {
          timeout: 10000,
        });

        // Fill in login form (try multiple selectors)
        const usernameInput = await this.page.$('input[name="username"]') || await this.page.$('input[type="email"]');
        const passwordInput = await this.page.$('input[name="password"]') || await this.page.$('input[type="password"]');

        if (!usernameInput || !passwordInput) {
          await this.takeScreenshot('login-form-not-found');
          throw new Error('Could not find login form fields');
        }

        await usernameInput.fill(this.username);
        await passwordInput.fill(this.password);

        // Click sign in
        const submitButton = await this.page.$('button[type="submit"]') || await this.page.$('button:has-text("Sign In")');
        if (!submitButton) {
          await this.takeScreenshot('submit-button-not-found');
          throw new Error('Could not find submit button');
        }

        await submitButton.click();

        // Wait for navigation
        await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        await this.sleep(2000); // Give time for redirect

        // Check for login errors
        const errorElement = await this.page.$('.error, .alert-danger, [role="alert"]');
        if (errorElement) {
          const errorText = await errorElement.textContent();
          await this.takeScreenshot('login-error');
          throw new Error(`Login error: ${errorText}`);
        }

        this.isLoggedIn = true;
        await this.saveSession();

        console.error('Fresh login successful');

        return {
          content: [
            {
              type: 'text',
              text: 'Successfully logged in to Ancestry.com',
            },
          ],
        };
      } catch (error) {
        await this.takeScreenshot('login-failed');
        throw error;
      }
    }, 'Login');
  }

  async searchPerson(args) {
    await this.ensureLoggedIn();

    const { firstName, lastName, birthYear, deathYear, location } = args;

    return await this.retryWithBackoff(async () => {
      try {
        // Go to search page
        await this.page.goto('https://www.ancestry.com/search/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });

        await this.handlePopups();
        await this.sleep(1000);

        // Try multiple selector patterns for the search form
        const firstNameInput = await this.page.$('input[name="firstname"]') ||
          await this.page.$('input[name="first_name"]') ||
          await this.page.$('input[placeholder*="First"]');

        const lastNameInput = await this.page.$('input[name="lastname"]') ||
          await this.page.$('input[name="last_name"]') ||
          await this.page.$('input[placeholder*="Last"]');

        if (!firstNameInput || !lastNameInput) {
          await this.takeScreenshot('search-form-not-found');
          throw new Error('Could not find search form - selectors may be outdated');
        }

        // Fill search form
        await firstNameInput.fill(firstName);
        await lastNameInput.fill(lastName);

        if (birthYear) {
          const birthInput = await this.page.$('input[name="birth"]') || await this.page.$('input[name="birth_year"]');
          if (birthInput) await birthInput.fill(birthYear);
        }
        if (deathYear) {
          const deathInput = await this.page.$('input[name="death"]') || await this.page.$('input[name="death_year"]');
          if (deathInput) await deathInput.fill(deathYear);
        }
        if (location) {
          const locationInput = await this.page.$('input[name="location"]') || await this.page.$('input[name="residence"]');
          if (locationInput) await locationInput.fill(location);
        }

        // Submit search
        const submitButton = await this.page.$('button[type="submit"]') || await this.page.$('button:has-text("Search")');
        if (!submitButton) {
          await this.takeScreenshot('search-submit-not-found');
          throw new Error('Could not find search submit button');
        }

        await submitButton.click();
        await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        await this.sleep(2000);

        // Extract search results with fallback selectors
        const results = await this.page.evaluate(() => {
          const selectors = ['.searchResult', '.result-item', '[data-test="search-result"]', '.search-result'];
          let resultElements = [];

          for (const selector of selectors) {
            resultElements = document.querySelectorAll(selector);
            if (resultElements.length > 0) break;
          }

          if (resultElements.length === 0) {
            return [];
          }

          return Array.from(resultElements).slice(0, 10).map(el => {
            const nameEl = el.querySelector('.name, .person-name, [data-test="name"], h3, h4');
            const birthEl = el.querySelector('.birth, .birth-date, [data-test="birth"]');
            const deathEl = el.querySelector('.death, .death-date, [data-test="death"]');
            const linkEl = el.querySelector('a');

            return {
              name: nameEl?.textContent?.trim() || '',
              birth: birthEl?.textContent?.trim() || '',
              death: deathEl?.textContent?.trim() || '',
              url: linkEl?.href || '',
            };
          });
        });

        if (results.length === 0) {
          await this.takeScreenshot('no-results');
          console.error('No search results found - selectors may need updating');
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ results, count: results.length }, null, 2),
            },
          ],
        };
      } catch (error) {
        await this.takeScreenshot('search-failed');
        throw error;
      }
    }, 'Search Person');
  }

  async getPersonDetails(profileUrl) {
    await this.ensureLoggedIn();

    try {
      await this.page.goto(profileUrl, { waitUntil: 'networkidle' });

      const details = await this.page.evaluate(() => {
        const data = {
          name: '',
          birth: {},
          death: {},
          parents: [],
          spouses: [],
          children: [],
          facts: [],
        };

        // Extract name
        const nameEl = document.querySelector('.personName');
        if (nameEl) data.name = nameEl.textContent.trim();

        // Extract vital information
        const birthEl = document.querySelector('[data-test="birth"]');
        if (birthEl) {
          data.birth = {
            date: birthEl.querySelector('.date')?.textContent?.trim(),
            place: birthEl.querySelector('.place')?.textContent?.trim(),
          };
        }

        const deathEl = document.querySelector('[data-test="death"]');
        if (deathEl) {
          data.death = {
            date: deathEl.querySelector('.date')?.textContent?.trim(),
            place: deathEl.querySelector('.place')?.textContent?.trim(),
          };
        }

        // Extract family relationships
        document.querySelectorAll('.familyMember').forEach(member => {
          const type = member.getAttribute('data-relation');
          const name = member.querySelector('.name')?.textContent?.trim();
          const url = member.querySelector('a')?.href;
          
          if (type === 'parent' && name) {
            data.parents.push({ name, url });
          } else if (type === 'spouse' && name) {
            data.spouses.push({ name, url });
          } else if (type === 'child' && name) {
            data.children.push({ name, url });
          }
        });

        // Extract life facts
        document.querySelectorAll('.lifeFact').forEach(fact => {
          data.facts.push({
            type: fact.getAttribute('data-type'),
            date: fact.querySelector('.date')?.textContent?.trim(),
            place: fact.querySelector('.place')?.textContent?.trim(),
            description: fact.querySelector('.description')?.textContent?.trim(),
          });
        });

        return data;
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get person details: ${error.message}`);
    }
  }

  async getTreeView(treeUrl, generations = 2) {
    await this.ensureLoggedIn();

    try {
      await this.page.goto(treeUrl, { waitUntil: 'networkidle' });

      // This would need to be customized based on Ancestry's tree structure
      const treeData = await this.page.evaluate((gens) => {
        // Extract tree structure up to N generations
        const extractPerson = (element, depth) => {
          if (depth > gens || !element) return null;
          
          return {
            name: element.querySelector('.personName')?.textContent?.trim(),
            birth: element.querySelector('.birthYear')?.textContent?.trim(),
            death: element.querySelector('.deathYear')?.textContent?.trim(),
            url: element.querySelector('a')?.href,
            parents: Array.from(element.querySelectorAll('.parent')).map(p => 
              extractPerson(p, depth + 1)
            ).filter(Boolean),
          };
        };

        const rootPerson = document.querySelector('.rootPerson');
        return extractPerson(rootPerson, 0);
      }, generations);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(treeData, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get tree view: ${error.message}`);
    }
  }

  async getRecords(profileUrl) {
    await this.ensureLoggedIn();

    try {
      await this.page.goto(profileUrl, { waitUntil: 'networkidle' });

      // Navigate to records tab
      const recordsTab = await this.page.$('a[href*="records"]');
      if (recordsTab) {
        await recordsTab.click();
        await this.page.waitForLoadState('networkidle');
      }

      const records = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('.record')).map(record => ({
          type: record.querySelector('.recordType')?.textContent?.trim(),
          title: record.querySelector('.title')?.textContent?.trim(),
          date: record.querySelector('.date')?.textContent?.trim(),
          location: record.querySelector('.location')?.textContent?.trim(),
          collection: record.querySelector('.collection')?.textContent?.trim(),
          url: record.querySelector('a')?.href,
        }));
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ records, count: records.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get records: ${error.message}`);
    }
  }

  async getTimeline(profileUrl) {
    await this.ensureLoggedIn();

    try {
      await this.page.goto(profileUrl, { waitUntil: 'networkidle' });

      const timeline = await this.page.evaluate(() => {
        const events = [];
        
        // Extract all timeline events
        document.querySelectorAll('.timelineEvent').forEach(event => {
          events.push({
            date: event.querySelector('.date')?.textContent?.trim(),
            type: event.getAttribute('data-event-type'),
            description: event.querySelector('.description')?.textContent?.trim(),
            location: event.querySelector('.location')?.textContent?.trim(),
            age: event.querySelector('.age')?.textContent?.trim(),
          });
        });

        // Sort by date
        events.sort((a, b) => {
          const dateA = new Date(a.date || '1900');
          const dateB = new Date(b.date || '1900');
          return dateA - dateB;
        });

        return events;
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ timeline, count: timeline.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get timeline: ${error.message}`);
    }
  }

  async generateNarrative(args) {
    const { personData, includeWorldEvents = true, includeRegionalHistory = true } = args;

    try {
      // Extract key information
      const { name, birthDate, birthPlace, deathDate, deathPlace, events = [] } = personData;

      // Parse dates for age calculations
      const birthYear = birthDate ? parseInt(birthDate.match(/\d{4}/)?.[0]) : null;
      const deathYear = deathDate ? parseInt(deathDate.match(/\d{4}/)?.[0]) : null;
      const lifespan = birthYear && deathYear ? deathYear - birthYear : null;

      let narrative = `# The Life and Times of ${name}\n\n`;
      narrative += `*A narrative woven from historical records and the echoes of a life lived*\n\n`;

      // Birth section with rich context
      if (birthDate && birthPlace) {
        narrative += `## The Dawn of a Journey\n\n`;
        const birthDecade = birthYear ? Math.floor(birthYear / 10) * 10 : null;

        narrative += `In the ${this.describeEra(birthYear)}, on ${birthDate}, `;
        narrative += `${name} entered the world in ${birthPlace}. `;

        if (includeRegionalHistory && birthPlace && birthYear) {
          narrative += this.generateBirthContext(birthPlace, birthYear);
        }

        // Add decade flavor
        if (birthDecade) {
          narrative += `\n\nThe ${birthDecade}s were `;
          narrative += this.getDecadeDescription(birthDecade);
          narrative += ` For a child born in this era, `;
          narrative += this.getChildhoodContext(birthDecade, birthPlace);
        }
        narrative += `\n\n`;
      }

      // Major life events with storytelling
      if (events.length > 0) {
        narrative += `## The Chapters of a Life\n\n`;
        const sortedEvents = this.sortEventsByDate(events);

        sortedEvents.forEach((event, index) => {
          const eventYear = event.date ? parseInt(event.date.match(/\d{4}/)?.[0]) : null;
          const ageAtEvent = birthYear && eventYear ? eventYear - birthYear : null;

          narrative += `### ${this.getOrdinal(index + 1)} Chapter: ${event.type}\n\n`;

          if (event.date) {
            narrative += `📅 **${event.date}**`;
            if (ageAtEvent !== null) {
              narrative += ` (Age ${ageAtEvent})`;
            }
            narrative += `\n`;
          }
          if (event.location) {
            narrative += `📍 **${event.location}**\n`;
          }

          narrative += `\n${this.generateEventNarrative(event, ageAtEvent, eventYear)}\n\n`;
        });
      }

      // Historical timeline
      if (includeWorldEvents && birthYear && deathYear) {
        narrative += `## Living Through History\n\n`;
        narrative += `Between ${birthYear} and ${deathYear}, `;
        narrative += `${name} witnessed ${lifespan} years of human history unfold. `;
        narrative += `This was an era of tremendous change:\n\n`;

        const historicalEvents = this.getHistoricalEvents(birthYear, deathYear);
        historicalEvents.forEach(event => {
          const ageAtEvent = event.year - birthYear;
          narrative += `- **${event.year}** (Age ${ageAtEvent}): ${event.description}\n`;
        });
        narrative += `\n`;
      }

      // Life summary and reflection
      if (birthYear && deathYear) {
        narrative += `## A Life Remembered\n\n`;
        narrative += `${name} lived for ${lifespan} years, `;
        narrative += `spanning nearly ${Math.ceil(lifespan / 10)} decades of profound change. `;

        if (birthPlace && deathPlace) {
          if (birthPlace !== deathPlace) {
            narrative += `Their journey took them from ${birthPlace} to ${deathPlace}, `;
            narrative += `a testament to the mobility and restlessness that defined their generation. `;
          } else {
            narrative += `They remained rooted in ${birthPlace} throughout their life, `;
            narrative += `witnessing the transformation of their homeland across the decades. `;
          }
        }

        narrative += `\n\n`;
        narrative += this.generateLifePhilosophy(lifespan, birthYear, deathYear);
      }

      // Death section with dignity
      if (deathDate && deathPlace) {
        narrative += `## The Final Chapter\n\n`;
        narrative += `On ${deathDate}, ${name}'s earthly journey concluded in ${deathPlace}. `;

        if (lifespan) {
          narrative += `They had lived to see `;
          if (lifespan < 40) {
            narrative += `the spring of life, though their time was cut short. `;
          } else if (lifespan < 60) {
            narrative += `the fullness of middle age, a life of purpose and meaning. `;
          } else if (lifespan < 80) {
            narrative += `the wisdom of old age, carrying memories spanning generations. `;
          } else {
            narrative += `an extraordinary length of years, a living bridge between eras. `;
          }
        }

        narrative += `Their story, preserved in records and memories, continues to echo through time.\n\n`;
      }

      // Closing reflection
      narrative += `---\n\n`;
      narrative += `> *"Every life is a universe of experiences, dreams, struggles, and triumphs. `;
      narrative += `Through the fragments preserved in genealogical records, we glimpse the human spirit `;
      narrative += `that animated ${name}'s journey through this world."*\n\n`;
      narrative += `*This narrative was imaginatively reconstructed from historical records, blending `;
      narrative += `documented facts with period-appropriate context to honor ${name}'s memory.*\n`;

      return {
        content: [
          {
            type: 'text',
            text: narrative,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to generate narrative: ${error.message}`);
    }
  }

  // Helper functions for narrative generation

  describeEra(year) {
    if (!year) return 'a time long past';
    if (year < 1500) return 'medieval times';
    if (year < 1700) return 'early modern era';
    if (year < 1800) return 'age of enlightenment';
    if (year < 1850) return 'early 19th century';
    if (year < 1900) return 'Victorian era';
    if (year < 1920) return 'turn of the century';
    if (year < 1950) return 'early 20th century';
    if (year < 1980) return 'mid-20th century';
    if (year < 2000) return 'late 20th century';
    return 'dawn of the new millennium';
  }

  generateBirthContext(place, year) {
    const contexts = [];

    // Regional context based on place
    if (place.includes('New York') || place.includes('NY')) {
      if (year < 1900) {
        contexts.push('New York was rapidly transforming into America\'s greatest metropolis, drawing immigrants from across the world.');
      } else {
        contexts.push('New York stood as the beating heart of American commerce and culture.');
      }
    } else if (place.includes('California') || place.includes('CA')) {
      if (year < 1850) {
        contexts.push('California was on the cusp of the Gold Rush, about to transform from frontier to boomtown.');
      } else {
        contexts.push('California represented the American dream of westward expansion and new beginnings.');
      }
    } else if (place.includes('England') || place.includes('London')) {
      contexts.push('England was at the height of its imperial power, with the sun never setting on the British Empire.');
    } else if (place.includes('Ireland')) {
      contexts.push('Ireland was a land of green hills and ancient traditions, though often struggling under difficult circumstances.');
    } else if (place.includes('Germany') || place.includes('German')) {
      contexts.push('Germany was a land of intellectual ferment and industrial might, shaping the modern world.');
    } else {
      contexts.push(`${place} was a community where families put down roots and futures were built one generation at a time.`);
    }

    return contexts.join(' ');
  }

  getDecadeDescription(decade) {
    const descriptions = {
      1700: 'a time of colonial expansion and growing tensions between empires.',
      1710: 'marked by scientific discovery and the early stirrings of industrialization.',
      1720: 'characterized by agricultural innovation and expanding global trade.',
      1730: 'seeing the Great Awakening and renewed religious fervor.',
      1740: 'a period of war and political upheaval across Europe.',
      1750: 'witnessing the Seven Years\' War and colonial conflicts.',
      1760: 'on the brink of revolutionary change in America and beyond.',
      1770: 'the decade of the American Revolution and birth of a nation.',
      1780: 'consolidating the gains of revolution and building new governments.',
      1790: 'seeing the French Revolution reshape the political landscape.',
      1800: 'the dawn of a new century filled with promise and peril.',
      1810: 'marked by the Napoleonic Wars and their global impact.',
      1820: 'a time of westward expansion and manifest destiny.',
      1830: 'seeing the rise of railways and the telegraph.',
      1840: 'marked by massive immigration and industrial growth.',
      1850: 'on the eve of civil conflict in America.',
      1860: 'torn by the Civil War and the struggle for human freedom.',
      1870: 'an era of Reconstruction and industrial explosion.',
      1880: 'the Gilded Age of robber barons and technological marvels.',
      1890: 'closing the frontier and opening global markets.',
      1900: 'the dawn of the modern age with automobiles and electricity.',
      1910: 'building toward the Great War that would reshape everything.',
      1920: 'the Roaring Twenties of jazz, prosperity, and social change.',
      1930: 'darkened by the Great Depression and rising totalitarianism.',
      1940: 'consumed by World War II and the atomic age.',
      1950: 'the postwar boom and the dawn of the Space Age.',
      1960: 'revolutionary times of social upheaval and cultural transformation.',
      1970: 'questioning old certainties and seeking new directions.',
      1980: 'marked by technological revolution and the Cold War\'s end.',
      1990: 'ushering in the digital age and globalization.',
      2000: 'entering a new millennium of connectivity and rapid change.',
    };

    return descriptions[decade] || 'a time of change and continuity, as all times are.';
  }

  getChildhoodContext(decade, place) {
    if (decade < 1850) {
      return 'life would be shaped by manual labor, tight-knit communities, and the rhythms of agricultural life.';
    } else if (decade < 1900) {
      return 'childhood meant witnessing the transformation from agrarian to industrial society.';
    } else if (decade < 1950) {
      return 'growing up meant experiencing the dramatic changes of wars, depressions, and technological revolution.';
    } else {
      return 'the world was changing faster than ever before, with new possibilities emerging each year.';
    }
  }

  generateEventNarrative(event, age, year) {
    const narratives = [];

    switch (event.type?.toLowerCase()) {
      case 'birth':
        narratives.push('A new life began, full of infinite possibility and unknown destiny.');
        break;
      case 'marriage':
        narratives.push(`Two lives joined together, creating a partnership that would face whatever the future held.`);
        if (age) {
          narratives.push(`At age ${age}, ${this.getMarriageContext(age)}`);
        }
        break;
      case 'immigration':
        narratives.push('A momentous decision to leave behind the familiar and journey to unknown shores in search of a better life.');
        narratives.push('This act of courage would echo through generations.');
        break;
      case 'census':
        narratives.push(`Counted among the residents of ${event.location || 'their community'}, this snapshot captures a moment in their daily life.`);
        break;
      case 'military':
      case 'draft':
        narratives.push('Called to serve their country in uniform, joining countless others in the cause.');
        break;
      case 'death':
        narratives.push('The final rest came, and a life\'s journey reached its conclusion.');
        break;
      default:
        narratives.push(`This moment marked an important milestone in their life's journey.`);
    }

    return narratives.join(' ');
  }

  getMarriageContext(age) {
    if (age < 18) return 'marriage came early, as was common in that era.';
    if (age < 25) return 'they joined their life with another at a typical age for the times.';
    if (age < 35) return 'they found their life partner with some maturity and experience.';
    return 'they married later in life, bringing wisdom and perspective to the union.';
  }

  sortEventsByDate(events) {
    return events.sort((a, b) => {
      const dateA = a.date ? new Date(a.date.match(/\d{4}/)?.[0] || '1900') : new Date(0);
      const dateB = b.date ? new Date(b.date.match(/\d{4}/)?.[0] || '1900') : new Date(0);
      return dateA - dateB;
    });
  }

  getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  getHistoricalEvents(birthYear, deathYear) {
    const majorEvents = [
      { year: 1776, description: 'American Declaration of Independence - birth of a new nation' },
      { year: 1789, description: 'French Revolution begins, reshaping European politics' },
      { year: 1803, description: 'Louisiana Purchase doubles the size of the United States' },
      { year: 1812, description: 'War of 1812 between America and Britain' },
      { year: 1825, description: 'Erie Canal opens, transforming American commerce' },
      { year: 1848, description: 'California Gold Rush begins, drawing thousands westward' },
      { year: 1861, description: 'American Civil War begins' },
      { year: 1865, description: 'Civil War ends, slavery abolished' },
      { year: 1869, description: 'Transcontinental Railroad completed' },
      { year: 1876, description: 'Telephone invented by Alexander Graham Bell' },
      { year: 1879, description: 'Electric light bulb perfected by Thomas Edison' },
      { year: 1886, description: 'Statue of Liberty dedicated in New York Harbor' },
      { year: 1898, description: 'Spanish-American War expands American influence' },
      { year: 1903, description: 'Wright Brothers achieve powered flight' },
      { year: 1914, description: 'World War I begins in Europe' },
      { year: 1918, description: 'World War I ends; Spanish Flu pandemic' },
      { year: 1920, description: 'Women gain the right to vote in America' },
      { year: 1929, description: 'Stock Market Crash; Great Depression begins' },
      { year: 1939, description: 'World War II begins in Europe' },
      { year: 1941, description: 'Pearl Harbor; America enters World War II' },
      { year: 1945, description: 'World War II ends; Atomic age begins' },
      { year: 1950, description: 'Korean War begins' },
      { year: 1957, description: 'Space Age begins with Sputnik' },
      { year: 1963, description: 'President Kennedy assassinated' },
      { year: 1969, description: 'First humans walk on the Moon' },
      { year: 1989, description: 'Berlin Wall falls; Cold War ends' },
      { year: 2001, description: 'September 11 attacks reshape the world' },
    ];

    return majorEvents.filter(event => event.year >= birthYear && event.year <= deathYear);
  }

  generateLifePhilosophy(lifespan, birthYear, deathYear) {
    let philosophy = '';

    const centurySpan = Math.floor(deathYear / 100) - Math.floor(birthYear / 100);

    if (centurySpan > 0) {
      philosophy += `Remarkably, ${name} lived across the boundary of centuries, `;
      philosophy += `seeing the world transform in ways previous generations could never have imagined. `;
    }

    if (lifespan > 70) {
      philosophy += `To have lived so long was to carry within oneself a library of memories, `;
      philosophy += `a living connection to a vanished world. `;
    }

    philosophy += `Each day was a thread in the great tapestry of human experience, `;
    philosophy += `woven together with countless others to create the pattern we call history.`;

    return philosophy;
  }

  async ensureLoggedIn() {
    if (!this.isLoggedIn) {
      await this.login();
    }
  }

  // ========== GEDCOM Methods ==========

  /**
   * Load and parse a GEDCOM file
   */
  async loadGedcom(filePath) {
    try {
      const path = filePath || this.gedcomFilePath;

      if (!path) {
        throw new Error('No GEDCOM file path provided. Set GEDCOM_FILE environment variable or pass filePath parameter.');
      }

      console.error(`Loading GEDCOM file: ${path}`);
      const gedcomContent = await fs.readFile(path, 'utf-8');

      this.gedcomData = parseGedcom.parse(gedcomContent);
      this.buildGedcomIndex();

      const individualCount = this.gedcomIndex.individuals.size;
      const familyCount = this.gedcomIndex.families.size;

      return {
        content: [
          {
            type: 'text',
            text: `Successfully loaded GEDCOM file!\n\nIndividuals: ${individualCount}\nFamilies: ${familyCount}\n\nYou can now use other gedcom_ tools to explore the data.`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to load GEDCOM file: ${error.message}`);
    }
  }

  /**
   * Build an index of individuals and families for fast lookup
   */
  buildGedcomIndex() {
    this.gedcomIndex = {
      individuals: new Map(),
      families: new Map(),
    };

    if (!this.gedcomData || !this.gedcomData.children) {
      return;
    }

    for (const record of this.gedcomData.children) {
      if (record.tag === 'INDI' && record.pointer) {
        this.gedcomIndex.individuals.set(record.pointer, record);
      } else if (record.tag === 'FAM' && record.pointer) {
        this.gedcomIndex.families.set(record.pointer, record);
      }
    }

    console.error(`Indexed ${this.gedcomIndex.individuals.size} individuals and ${this.gedcomIndex.families.size} families`);
  }

  /**
   * Extract name from GEDCOM individual record
   */
  extractName(individual) {
    const nameTag = individual.children?.find(c => c.tag === 'NAME');
    if (!nameTag) return 'Unknown';

    const fullName = nameTag.data || '';
    return fullName.replace(/\//g, '').trim(); // Remove GEDCOM name delimiters
  }

  /**
   * Extract events from GEDCOM individual
   */
  extractEvents(individual) {
    const events = [];

    if (!individual.children) return events;

    const eventTags = ['BIRT', 'DEAT', 'MARR', 'BURI', 'CHR', 'BAPM', 'GRAD', 'EMIG', 'IMMI', 'NATU', 'RESI', 'CENS', 'OCCU', 'MILI'];

    for (const child of individual.children) {
      if (eventTags.includes(child.tag)) {
        const event = {
          type: this.getEventTypeName(child.tag),
          date: '',
          location: '',
        };

        if (child.children) {
          const dateTag = child.children.find(c => c.tag === 'DATE');
          const placeTag = child.children.find(c => c.tag === 'PLAC');

          if (dateTag) event.date = dateTag.data || '';
          if (placeTag) event.location = placeTag.data || '';
        }

        events.push(event);
      }
    }

    return events;
  }

  /**
   * Get friendly event type name
   */
  getEventTypeName(tag) {
    const names = {
      'BIRT': 'Birth',
      'DEAT': 'Death',
      'MARR': 'Marriage',
      'BURI': 'Burial',
      'CHR': 'Christening',
      'BAPM': 'Baptism',
      'GRAD': 'Graduation',
      'EMIG': 'Emigration',
      'IMMI': 'Immigration',
      'NATU': 'Naturalization',
      'RESI': 'Residence',
      'CENS': 'Census',
      'OCCU': 'Occupation',
      'MILI': 'Military',
    };
    return names[tag] || tag;
  }

  /**
   * Search for people in GEDCOM
   */
  async gedcomSearchPerson(args) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const { firstName, lastName, birthYear, deathYear } = args;
    const results = [];

    for (const [id, individual] of this.gedcomIndex.individuals) {
      const name = this.extractName(individual);
      const events = this.extractEvents(individual);

      const birthEvent = events.find(e => e.type === 'Birth');
      const deathEvent = events.find(e => e.type === 'Death');

      // Simple name matching
      let matches = true;

      if (firstName) {
        matches = matches && name.toLowerCase().includes(firstName.toLowerCase());
      }

      if (lastName) {
        matches = matches && name.toLowerCase().includes(lastName.toLowerCase());
      }

      if (birthYear && birthEvent) {
        matches = matches && birthEvent.date.includes(birthYear);
      }

      if (deathYear && deathEvent) {
        matches = matches && deathEvent.date.includes(deathYear);
      }

      if (matches) {
        results.push({
          id,
          name,
          birth: birthEvent ? `${birthEvent.date} ${birthEvent.location}`.trim() : '',
          death: deathEvent ? `${deathEvent.date} ${deathEvent.location}`.trim() : '',
        });
      }

      if (results.length >= 20) break; // Limit results
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ results, count: results.length }, null, 2),
        },
      ],
    };
  }

  /**
   * Get complete person details from GEDCOM
   */
  async gedcomGetPerson(individualId) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const individual = this.gedcomIndex.individuals.get(individualId);

    if (!individual) {
      throw new Error(`Individual ${individualId} not found in GEDCOM file.`);
    }

    const name = this.extractName(individual);
    const events = this.extractEvents(individual);
    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');

    // Get sex
    const sexTag = individual.children?.find(c => c.tag === 'SEX');
    const sex = sexTag?.data || 'Unknown';

    const details = {
      id: individualId,
      name,
      sex,
      birth: birthEvent || null,
      death: deathEvent || null,
      events,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(details, null, 2),
        },
      ],
    };
  }

  /**
   * Get ancestors of a person
   */
  async gedcomGetAncestors(individualId, generations = 3) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const ancestors = [];
    const visited = new Set();

    const getParents = (id, generation) => {
      if (generation > generations || visited.has(id)) return;
      visited.add(id);

      const individual = this.gedcomIndex.individuals.get(id);
      if (!individual) return;

      // Find family where this person is a child
      const famcTag = individual.children?.find(c => c.tag === 'FAMC');
      if (!famcTag) return;

      const familyId = famcTag.data;
      const family = this.gedcomIndex.families.get(familyId);
      if (!family) return;

      // Get parents
      const husbTag = family.children?.find(c => c.tag === 'HUSB');
      const wifeTag = family.children?.find(c => c.tag === 'WIFE');

      if (husbTag) {
        const fatherId = husbTag.data;
        const father = this.gedcomIndex.individuals.get(fatherId);
        if (father) {
          ancestors.push({
            id: fatherId,
            name: this.extractName(father),
            relationship: 'Father',
            generation,
          });
          getParents(fatherId, generation + 1);
        }
      }

      if (wifeTag) {
        const motherId = wifeTag.data;
        const mother = this.gedcomIndex.individuals.get(motherId);
        if (mother) {
          ancestors.push({
            id: motherId,
            name: this.extractName(mother),
            relationship: 'Mother',
            generation,
          });
          getParents(motherId, generation + 1);
        }
      }
    };

    getParents(individualId, 1);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ancestors, count: ancestors.length }, null, 2),
        },
      ],
    };
  }

  /**
   * Get descendants of a person
   */
  async gedcomGetDescendants(individualId, generations = 3) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const descendants = [];
    const visited = new Set();

    const getChildren = (id, generation) => {
      if (generation > generations || visited.has(id)) return;
      visited.add(id);

      const individual = this.gedcomIndex.individuals.get(id);
      if (!individual) return;

      // Find families where this person is a spouse
      const famsTags = individual.children?.filter(c => c.tag === 'FAMS') || [];

      for (const famsTag of famsTags) {
        const familyId = famsTag.data;
        const family = this.gedcomIndex.families.get(familyId);
        if (!family) continue;

        // Get children
        const childTags = family.children?.filter(c => c.tag === 'CHIL') || [];

        for (const childTag of childTags) {
          const childId = childTag.data;
          const child = this.gedcomIndex.individuals.get(childId);
          if (child) {
            descendants.push({
              id: childId,
              name: this.extractName(child),
              generation,
            });
            getChildren(childId, generation + 1);
          }
        }
      }
    };

    getChildren(individualId, 1);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ descendants, count: descendants.length }, null, 2),
        },
      ],
    };
  }

  /**
   * Get immediate family (parents, spouse(s), children)
   */
  async gedcomGetFamily(individualId) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const individual = this.gedcomIndex.individuals.get(individualId);
    if (!individual) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    const family = {
      person: {
        id: individualId,
        name: this.extractName(individual),
      },
      parents: [],
      spouses: [],
      children: [],
    };

    // Get parents
    const famcTag = individual.children?.find(c => c.tag === 'FAMC');
    if (famcTag) {
      const parentFamily = this.gedcomIndex.families.get(famcTag.data);
      if (parentFamily) {
        const husbTag = parentFamily.children?.find(c => c.tag === 'HUSB');
        const wifeTag = parentFamily.children?.find(c => c.tag === 'WIFE');

        if (husbTag) {
          const father = this.gedcomIndex.individuals.get(husbTag.data);
          if (father) {
            family.parents.push({
              id: husbTag.data,
              name: this.extractName(father),
              relation: 'Father',
            });
          }
        }

        if (wifeTag) {
          const mother = this.gedcomIndex.individuals.get(wifeTag.data);
          if (mother) {
            family.parents.push({
              id: wifeTag.data,
              name: this.extractName(mother),
              relation: 'Mother',
            });
          }
        }
      }
    }

    // Get spouses and children
    const famsTags = individual.children?.filter(c => c.tag === 'FAMS') || [];
    for (const famsTag of famsTags) {
      const spouseFamily = this.gedcomIndex.families.get(famsTag.data);
      if (!spouseFamily) continue;

      // Get spouse
      const husbTag = spouseFamily.children?.find(c => c.tag === 'HUSB');
      const wifeTag = spouseFamily.children?.find(c => c.tag === 'WIFE');

      const spouseId = (husbTag?.data === individualId) ? wifeTag?.data : husbTag?.data;
      if (spouseId) {
        const spouse = this.gedcomIndex.individuals.get(spouseId);
        if (spouse) {
          family.spouses.push({
            id: spouseId,
            name: this.extractName(spouse),
          });
        }
      }

      // Get children
      const childTags = spouseFamily.children?.filter(c => c.tag === 'CHIL') || [];
      for (const childTag of childTags) {
        const child = this.gedcomIndex.individuals.get(childTag.data);
        if (child) {
          family.children.push({
            id: childTag.data,
            name: this.extractName(child),
          });
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(family, null, 2),
        },
      ],
    };
  }

  /**
   * Generate narrative from GEDCOM data
   */
  async gedcomGenerateNarrative(args) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const { individualId, includeWorldEvents = true, includeRegionalHistory = true } = args;

    const individual = this.gedcomIndex.individuals.get(individualId);
    if (!individual) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    // Extract data for narrative
    const name = this.extractName(individual);
    const events = this.extractEvents(individual);
    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');

    const personData = {
      name,
      birthDate: birthEvent?.date || '',
      birthPlace: birthEvent?.location || '',
      deathDate: deathEvent?.date || '',
      deathPlace: deathEvent?.location || '',
      events: events.filter(e => e.type !== 'Birth' && e.type !== 'Death'),
    };

    // Use existing narrative generator
    return await this.generateNarrative({
      personData,
      includeWorldEvents,
      includeRegionalHistory,
    });
  }

  /**
   * Calculate and explain relationship between two people
   */
  async gedcomRelationshipExplainer(person1Id, person2Id) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const person1 = this.gedcomIndex.individuals.get(person1Id);
    const person2 = this.gedcomIndex.individuals.get(person2Id);

    if (!person1) throw new Error(`Individual ${person1Id} not found.`);
    if (!person2) throw new Error(`Individual ${person2Id} not found.`);

    const name1 = this.extractName(person1);
    const name2 = this.extractName(person2);

    // Find relationship using BFS
    const relationship = this.findRelationship(person1Id, person2Id);

    if (!relationship) {
      return {
        content: [{
          type: 'text',
          text: `No direct genealogical relationship found between ${name1} and ${name2}.\n\nThey may be related through marriage or more distant connections not captured in the current search depth.`,
        }],
      };
    }

    // Build narrative explanation
    let narrative = `Relationship between ${name1} and ${name2}:\n\n`;
    narrative += `**Relationship:** ${relationship.description}\n`;
    narrative += `**Degree of Separation:** ${relationship.distance} generation(s)\n\n`;
    narrative += `**Connection Path:**\n${relationship.path}\n\n`;
    narrative += `**Narrative:**\n${relationship.narrative}`;

    return {
      content: [{
        type: 'text',
        text: narrative,
      }],
    };
  }

  /**
   * Find relationship between two people using BFS
   */
  findRelationship(startId, targetId) {
    if (startId === targetId) {
      return {
        description: 'Same person',
        distance: 0,
        path: 'They are the same individual.',
        narrative: 'These two records refer to the same person.',
      };
    }

    const queue = [{ id: startId, path: [startId], directions: [] }];
    const visited = new Set([startId]);
    const maxDepth = 10; // Limit search depth

    while (queue.length > 0) {
      const { id, path, directions } = queue.shift();

      if (path.length > maxDepth) continue;

      const individual = this.gedcomIndex.individuals.get(id);
      if (!individual) continue;

      // Get all related people (parents, children, spouses)
      const relatives = this.getRelatives(id);

      for (const relative of relatives) {
        if (relative.id === targetId) {
          // Found the target!
          const fullPath = [...path, targetId];
          const fullDirections = [...directions, relative.relation];
          return this.describeRelationship(fullPath, fullDirections);
        }

        if (!visited.has(relative.id)) {
          visited.add(relative.id);
          queue.push({
            id: relative.id,
            path: [...path, relative.id],
            directions: [...directions, relative.relation],
          });
        }
      }
    }

    return null; // No relationship found
  }

  /**
   * Get all relatives of a person (parents, children, spouses)
   */
  getRelatives(individualId) {
    const individual = this.gedcomIndex.individuals.get(individualId);
    if (!individual) return [];

    const relatives = [];

    // Get parents
    const famcTag = individual.children?.find(c => c.tag === 'FAMC');
    if (famcTag) {
      const parentFamily = this.gedcomIndex.families.get(famcTag.data);
      if (parentFamily) {
        const husbTag = parentFamily.children?.find(c => c.tag === 'HUSB');
        const wifeTag = parentFamily.children?.find(c => c.tag === 'WIFE');

        if (husbTag) relatives.push({ id: husbTag.data, relation: 'parent' });
        if (wifeTag) relatives.push({ id: wifeTag.data, relation: 'parent' });
      }
    }

    // Get children and spouses
    const famsTags = individual.children?.filter(c => c.tag === 'FAMS') || [];
    for (const famsTag of famsTags) {
      const family = this.gedcomIndex.families.get(famsTag.data);
      if (!family) continue;

      // Get spouse
      const husbTag = family.children?.find(c => c.tag === 'HUSB');
      const wifeTag = family.children?.find(c => c.tag === 'WIFE');

      if (husbTag && husbTag.data !== individualId) {
        relatives.push({ id: husbTag.data, relation: 'spouse' });
      }
      if (wifeTag && wifeTag.data !== individualId) {
        relatives.push({ id: wifeTag.data, relation: 'spouse' });
      }

      // Get children
      const childTags = family.children?.filter(c => c.tag === 'CHIL') || [];
      for (const childTag of childTags) {
        relatives.push({ id: childTag.data, relation: 'child' });
      }
    }

    return relatives;
  }

  /**
   * Describe relationship based on path
   */
  describeRelationship(path, directions) {
    const distance = directions.length;
    let description = '';
    let narrative = '';
    let pathDescription = '';

    // Build path description
    for (let i = 0; i < path.length; i++) {
      const person = this.gedcomIndex.individuals.get(path[i]);
      const name = person ? this.extractName(person) : path[i];

      if (i === 0) {
        pathDescription += `1. ${name} (starting person)\n`;
      } else {
        const relation = directions[i - 1];
        pathDescription += `${i + 1}. ${name} (${relation})\n`;
      }
    }

    // Determine relationship type
    const person1Name = this.extractName(this.gedcomIndex.individuals.get(path[0]));
    const person2Name = this.extractName(this.gedcomIndex.individuals.get(path[path.length - 1]));

    // Simple relationships
    if (distance === 1) {
      if (directions[0] === 'parent') {
        description = 'Parent';
        narrative = `${person2Name} is the parent of ${person1Name}.`;
      } else if (directions[0] === 'child') {
        description = 'Child';
        narrative = `${person2Name} is the child of ${person1Name}.`;
      } else if (directions[0] === 'spouse') {
        description = 'Spouse';
        narrative = `${person1Name} and ${person2Name} are married to each other.`;
      }
    }
    // Grandparent/grandchild
    else if (distance === 2 && directions.every(d => d === 'parent')) {
      description = 'Grandparent';
      narrative = `${person2Name} is the grandparent of ${person1Name}.`;
    } else if (distance === 2 && directions.every(d => d === 'child')) {
      description = 'Grandchild';
      narrative = `${person2Name} is the grandchild of ${person1Name}.`;
    }
    // Siblings
    else if (distance === 2 && directions[0] === 'parent' && directions[1] === 'child') {
      description = 'Sibling';
      narrative = `${person1Name} and ${person2Name} are siblings, sharing the same parent.`;
    }
    // Great-grandparent
    else if (distance === 3 && directions.every(d => d === 'parent')) {
      description = 'Great-grandparent';
      narrative = `${person2Name} is the great-grandparent of ${person1Name}.`;
    }
    // Aunt/Uncle
    else if (distance === 3 && directions[0] === 'parent' && directions[1] === 'parent' && directions[2] === 'child') {
      description = 'Aunt/Uncle';
      narrative = `${person2Name} is the aunt or uncle of ${person1Name}.`;
    }
    // Niece/Nephew
    else if (distance === 3 && directions[0] === 'child' && directions[1] === 'child' && directions[2] === 'parent') {
      description = 'Niece/Nephew';
      narrative = `${person2Name} is the niece or nephew of ${person1Name}.`;
    }
    // Cousin
    else if (distance === 4 && directions[0] === 'parent' && directions[1] === 'parent' && directions[2] === 'child' && directions[3] === 'child') {
      description = 'First cousin';
      narrative = `${person1Name} and ${person2Name} are first cousins, sharing the same grandparent.`;
    }
    // In-law relationships
    else if (directions.includes('spouse')) {
      description = 'Related by marriage';
      narrative = `${person1Name} and ${person2Name} are related through marriage.`;
    }
    // Complex/distant
    else {
      description = `Distant relative (${distance} degrees of separation)`;
      narrative = `${person1Name} and ${person2Name} are related through ${distance} generations.`;
    }

    return {
      description,
      distance,
      path: pathDescription,
      narrative,
    };
  }

  /**
   * Generate life summary in different styles
   */
  async gedcomLifeSummary(individualId, style) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const individual = this.gedcomIndex.individuals.get(individualId);
    if (!individual) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    const name = this.extractName(individual);
    const events = this.extractEvents(individual);
    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');

    let summary = '';

    switch (style) {
      case 'brief':
        summary = this.generateBriefSummary(name, birthEvent, deathEvent, events);
        break;
      case 'detailed':
        summary = this.generateDetailedSummary(name, birthEvent, deathEvent, events, individualId);
        break;
      case 'chronological':
        summary = this.generateChronologicalSummary(name, birthEvent, deathEvent, events);
        break;
      case 'thematic':
        summary = this.generateThematicSummary(name, birthEvent, deathEvent, events);
        break;
      default:
        throw new Error(`Unknown style: ${style}`);
    }

    return {
      content: [{
        type: 'text',
        text: summary,
      }],
    };
  }

  /**
   * Generate brief summary (1-2 paragraphs)
   */
  generateBriefSummary(name, birthEvent, deathEvent, events) {
    let summary = `# ${name}\n\n`;

    const birthInfo = birthEvent ? `born ${birthEvent.date}${birthEvent.location ? ` in ${birthEvent.location}` : ''}` : 'birth details unknown';
    const deathInfo = deathEvent ? `died ${deathEvent.date}${deathEvent.location ? ` in ${deathEvent.location}` : ''}` : 'death details unknown';

    summary += `${name} was ${birthInfo} and ${deathInfo}.`;

    // Calculate lifespan if both dates available
    if (birthEvent?.date && deathEvent?.date) {
      const birthYear = this.extractYear(birthEvent.date);
      const deathYear = this.extractYear(deathEvent.date);
      if (birthYear && deathYear) {
        const lifespan = deathYear - birthYear;
        summary += ` They lived for approximately ${lifespan} years.`;
      }
    }

    // Mention key events
    const significantEvents = events.filter(e =>
      ['Marriage', 'Immigration', 'Emigration', 'Military', 'Occupation'].includes(e.type)
    );

    if (significantEvents.length > 0) {
      summary += `\n\nNotable life events include: `;
      summary += significantEvents.map(e => {
        let desc = e.type.toLowerCase();
        if (e.date) desc += ` in ${this.extractYear(e.date) || e.date}`;
        return desc;
      }).join(', ') + '.';
    }

    return summary;
  }

  /**
   * Generate detailed summary
   */
  generateDetailedSummary(name, birthEvent, deathEvent, events, individualId) {
    let summary = `# ${name} - Detailed Life Summary\n\n`;

    // Birth information
    summary += `## Early Life\n\n`;
    if (birthEvent) {
      summary += `${name} was born`;
      if (birthEvent.date) summary += ` on ${birthEvent.date}`;
      if (birthEvent.location) summary += ` in ${birthEvent.location}`;
      summary += `.`;
    } else {
      summary += `Birth details for ${name} are not recorded.`;
    }

    // Get family context
    const individual = this.gedcomIndex.individuals.get(individualId);
    const famcTag = individual.children?.find(c => c.tag === 'FAMC');
    if (famcTag) {
      const parentFamily = this.gedcomIndex.families.get(famcTag.data);
      if (parentFamily) {
        const parents = [];
        const husbTag = parentFamily.children?.find(c => c.tag === 'HUSB');
        const wifeTag = parentFamily.children?.find(c => c.tag === 'WIFE');

        if (husbTag) {
          const father = this.gedcomIndex.individuals.get(husbTag.data);
          if (father) parents.push(`father ${this.extractName(father)}`);
        }
        if (wifeTag) {
          const mother = this.gedcomIndex.individuals.get(wifeTag.data);
          if (mother) parents.push(`mother ${this.extractName(mother)}`);
        }

        if (parents.length > 0) {
          summary += ` They were the child of ${parents.join(' and ')}.`;
        }
      }
    }

    // Life events
    summary += `\n\n## Life Events\n\n`;
    const sortedEvents = this.sortEventsByDate(events.filter(e => e.type !== 'Birth' && e.type !== 'Death'));

    if (sortedEvents.length > 0) {
      for (const event of sortedEvents) {
        summary += `**${event.type}**`;
        if (event.date || event.location) {
          summary += ': ';
          const parts = [];
          if (event.date) parts.push(event.date);
          if (event.location) parts.push(event.location);
          summary += parts.join(', ');
        }
        summary += '\n\n';
      }
    } else {
      summary += `No additional life events are recorded.\n\n`;
    }

    // Death information
    summary += `## Later Life and Death\n\n`;
    if (deathEvent) {
      summary += `${name} passed away`;
      if (deathEvent.date) summary += ` on ${deathEvent.date}`;
      if (deathEvent.location) summary += ` in ${deathEvent.location}`;
      summary += `.`;
    } else {
      summary += `Death details for ${name} are not recorded.`;
    }

    return summary;
  }

  /**
   * Generate chronological summary (timeline-focused)
   */
  generateChronologicalSummary(name, birthEvent, deathEvent, events) {
    let summary = `# ${name} - Timeline\n\n`;

    const allEvents = [...events];
    if (birthEvent) allEvents.unshift({ ...birthEvent, type: 'Birth' });
    if (deathEvent) allEvents.push({ ...deathEvent, type: 'Death' });

    const sortedEvents = this.sortEventsByDate(allEvents);

    for (const event of sortedEvents) {
      const year = this.extractYear(event.date);
      const age = birthEvent && year ? year - this.extractYear(birthEvent.date) : null;

      summary += `**${year || 'Unknown date'}**`;
      if (age !== null && age >= 0) {
        summary += ` (Age ${age})`;
      }
      summary += ` - ${event.type}`;

      if (event.location) {
        summary += ` in ${event.location}`;
      }

      summary += '\n\n';
    }

    return summary;
  }

  /**
   * Generate thematic summary (organized by life themes)
   */
  generateThematicSummary(name, birthEvent, deathEvent, events) {
    let summary = `# ${name} - Life Themes\n\n`;

    // Group events by theme
    const themes = {
      'Origins': [],
      'Family': [],
      'Migration': [],
      'Occupation & Service': [],
      'Later Life': [],
    };

    if (birthEvent) themes['Origins'].push({ ...birthEvent, type: 'Birth' });

    for (const event of events) {
      if (['Marriage', 'Christening', 'Baptism'].includes(event.type)) {
        themes['Family'].push(event);
      } else if (['Immigration', 'Emigration', 'Naturalization', 'Residence'].includes(event.type)) {
        themes['Migration'].push(event);
      } else if (['Occupation', 'Military', 'Graduation'].includes(event.type)) {
        themes['Occupation & Service'].push(event);
      } else if (['Census', 'Burial'].includes(event.type)) {
        themes['Later Life'].push(event);
      } else {
        themes['Origins'].push(event);
      }
    }

    if (deathEvent) themes['Later Life'].push({ ...deathEvent, type: 'Death' });

    // Write each theme
    for (const [theme, themeEvents] of Object.entries(themes)) {
      if (themeEvents.length === 0) continue;

      summary += `## ${theme}\n\n`;

      for (const event of themeEvents) {
        summary += `- **${event.type}**`;
        if (event.date || event.location) {
          summary += ': ';
          const parts = [];
          if (event.date) parts.push(event.date);
          if (event.location) parts.push(event.location);
          summary += parts.join(', ');
        }
        summary += '\n';
      }

      summary += '\n';
    }

    return summary;
  }

  /**
   * Sort events by date
   */
  sortEventsByDate(events) {
    return events.sort((a, b) => {
      const yearA = this.extractYear(a.date);
      const yearB = this.extractYear(b.date);

      if (!yearA && !yearB) return 0;
      if (!yearA) return 1;
      if (!yearB) return -1;

      return yearA - yearB;
    });
  }

  /**
   * Extract year from date string
   */
  extractYear(dateStr) {
    if (!dateStr) return null;

    // Try to find a 4-digit year
    const yearMatch = dateStr.match(/\b(1\d{3}|20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
  }

  /**
   * Trace family migrations across generations
   */
  async gedcomMigrationStory(startingPersonId, generations = 4, direction = 'ancestors') {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const startingPerson = this.gedcomIndex.individuals.get(startingPersonId);
    if (!startingPerson) {
      throw new Error(`Individual ${startingPersonId} not found.`);
    }

    // Collect all people and their location data
    const peopleData = [];

    if (direction === 'ancestors' || direction === 'both') {
      this.collectAncestorsMigration(startingPersonId, generations, peopleData, 0);
    }

    if (direction === 'descendants' || direction === 'both') {
      this.collectDescendantsMigration(startingPersonId, generations, peopleData, 0);
    }

    // Add the starting person if not already included
    if (!peopleData.find(p => p.id === startingPersonId)) {
      peopleData.push(this.extractPersonLocationData(startingPersonId, 0));
    }

    // Sort by generation (oldest first) and then by birth year
    peopleData.sort((a, b) => {
      if (a.generation !== b.generation) {
        return direction === 'ancestors' ? b.generation - a.generation : a.generation - b.generation;
      }
      if (a.birthYear && b.birthYear) {
        return a.birthYear - b.birthYear;
      }
      return 0;
    });

    // Build migration narrative
    let narrative = `# Family Migration Story\n\n`;

    const startingName = this.extractName(startingPerson);
    narrative += `## Overview\n\n`;
    narrative += `Tracing the geographic journey of ${startingName}'s family across ${generations} generation(s).\n\n`;

    // Extract unique locations
    const locationsByGeneration = this.extractLocationsByGeneration(peopleData);

    // Migration summary
    narrative += `## Migration Summary\n\n`;
    for (const [gen, locations] of Object.entries(locationsByGeneration)) {
      if (locations.length > 0) {
        const genLabel = gen === '0' ? 'Starting generation' : `Generation ${Math.abs(parseInt(gen))} ${parseInt(gen) < 0 ? 'back' : 'forward'}`;
        narrative += `**${genLabel}**: ${locations.join(', ')}\n\n`;
      }
    }

    // Detailed migration stories by person
    narrative += `## Detailed Migration Stories\n\n`;

    const migrationGroups = this.groupByMigrationPattern(peopleData);

    for (const group of migrationGroups) {
      if (group.people.length === 1) {
        const person = group.people[0];
        narrative += this.generatePersonMigrationNarrative(person);
      } else {
        // Multiple people with similar migration patterns
        narrative += `### ${group.pattern}\n\n`;
        narrative += `${group.people.length} family members followed this migration path:\n\n`;
        for (const person of group.people) {
          narrative += `- **${person.name}** (${person.birthYear || '?'} - ${person.deathYear || '?'})\n`;
        }
        narrative += `\n${group.description}\n\n`;
      }
    }

    // Migration patterns and insights
    narrative += `## Migration Patterns & Insights\n\n`;
    narrative += this.analyzeMigrationPatterns(peopleData);

    return {
      content: [{
        type: 'text',
        text: narrative,
      }],
    };
  }

  /**
   * Collect ancestors with migration data
   */
  collectAncestorsMigration(individualId, maxGen, peopleData, currentGen) {
    if (currentGen >= maxGen) return;

    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) return;

    peopleData.push(this.extractPersonLocationData(individualId, -currentGen));

    // Get parents
    const famcTag = person.children?.find(c => c.tag === 'FAMC');
    if (famcTag) {
      const parentFamily = this.gedcomIndex.families.get(famcTag.data);
      if (parentFamily) {
        const husbTag = parentFamily.children?.find(c => c.tag === 'HUSB');
        const wifeTag = parentFamily.children?.find(c => c.tag === 'WIFE');

        if (husbTag) this.collectAncestorsMigration(husbTag.data, maxGen, peopleData, currentGen + 1);
        if (wifeTag) this.collectAncestorsMigration(wifeTag.data, maxGen, peopleData, currentGen + 1);
      }
    }
  }

  /**
   * Collect descendants with migration data
   */
  collectDescendantsMigration(individualId, maxGen, peopleData, currentGen) {
    if (currentGen >= maxGen) return;

    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) return;

    if (currentGen > 0) {
      peopleData.push(this.extractPersonLocationData(individualId, currentGen));
    }

    // Get children
    const famsTags = person.children?.filter(c => c.tag === 'FAMS') || [];
    for (const famsTag of famsTags) {
      const family = this.gedcomIndex.families.get(famsTag.data);
      if (!family) continue;

      const childTags = family.children?.filter(c => c.tag === 'CHIL') || [];
      for (const childTag of childTags) {
        this.collectDescendantsMigration(childTag.data, maxGen, peopleData, currentGen + 1);
      }
    }
  }

  /**
   * Extract person's location data for migration story
   */
  extractPersonLocationData(individualId, generation) {
    const person = this.gedcomIndex.individuals.get(individualId);
    const name = this.extractName(person);
    const events = this.extractEvents(person);

    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');
    const migrationEvents = events.filter(e =>
      ['Immigration', 'Emigration', 'Naturalization', 'Residence'].includes(e.type)
    );

    return {
      id: individualId,
      name,
      generation,
      birthYear: this.extractYear(birthEvent?.date),
      deathYear: this.extractYear(deathEvent?.date),
      birthPlace: birthEvent?.location || null,
      deathPlace: deathEvent?.location || null,
      migrationEvents,
      allEvents: events,
    };
  }

  /**
   * Extract locations grouped by generation
   */
  extractLocationsByGeneration(peopleData) {
    const locationsByGen = {};

    for (const person of peopleData) {
      if (!locationsByGen[person.generation]) {
        locationsByGen[person.generation] = new Set();
      }

      if (person.birthPlace) locationsByGen[person.generation].add(person.birthPlace);
      if (person.deathPlace) locationsByGen[person.generation].add(person.deathPlace);

      for (const event of person.migrationEvents) {
        if (event.location) locationsByGen[person.generation].add(event.location);
      }
    }

    // Convert sets to arrays
    const result = {};
    for (const [gen, locations] of Object.entries(locationsByGen)) {
      result[gen] = Array.from(locations);
    }

    return result;
  }

  /**
   * Group people by similar migration patterns
   */
  groupByMigrationPattern(peopleData) {
    const groups = [];

    for (const person of peopleData) {
      if (!person.birthPlace && !person.deathPlace && person.migrationEvents.length === 0) {
        continue; // Skip people with no location data
      }

      const locations = [];
      if (person.birthPlace) locations.push(person.birthPlace);
      for (const event of person.migrationEvents) {
        if (event.location) locations.push(event.location);
      }
      if (person.deathPlace && person.deathPlace !== locations[locations.length - 1]) {
        locations.push(person.deathPlace);
      }

      groups.push({
        pattern: locations.length > 1 ? `${locations[0]} → ${locations[locations.length - 1]}` : locations[0] || 'Unknown',
        locations,
        people: [person],
        description: this.describeMigrationPattern(person, locations),
      });
    }

    return groups;
  }

  /**
   * Generate narrative for a person's migration
   */
  generatePersonMigrationNarrative(person) {
    let narrative = `### ${person.name}\n\n`;

    if (person.birthYear && person.deathYear) {
      narrative += `**Lifespan**: ${person.birthYear} - ${person.deathYear}\n\n`;
    }

    if (person.birthPlace) {
      narrative += `${person.name} was born in **${person.birthPlace}**`;
      if (person.birthYear) narrative += ` in ${person.birthYear}`;
      narrative += '.\n\n';
    }

    if (person.migrationEvents.length > 0) {
      narrative += `**Migration Journey:**\n\n`;
      for (const event of person.migrationEvents) {
        narrative += `- **${event.type}**`;
        if (event.date) narrative += ` (${event.date})`;
        if (event.location) narrative += `: ${event.location}`;
        narrative += '\n';
      }
      narrative += '\n';
    }

    if (person.deathPlace) {
      narrative += `${person.name} passed away in **${person.deathPlace}**`;
      if (person.deathYear) narrative += ` in ${person.deathYear}`;
      narrative += '.\n\n';
    }

    // Calculate distance traveled (if different locations)
    if (person.birthPlace && person.deathPlace && person.birthPlace !== person.deathPlace) {
      narrative += `*${person.name} migrated from ${person.birthPlace} to ${person.deathPlace} during their lifetime.*\n\n`;
    }

    return narrative;
  }

  /**
   * Describe migration pattern
   */
  describeMigrationPattern(person, locations) {
    if (locations.length === 0) return 'No location data available.';
    if (locations.length === 1) return `Lived their entire life in ${locations[0]}.`;

    let description = `Migrated from ${locations[0]}`;
    if (locations.length > 2) {
      description += ` through ${locations.slice(1, -1).join(', ')}`;
    }
    description += ` to ${locations[locations.length - 1]}.`;

    return description;
  }

  /**
   * Analyze migration patterns across all people
   */
  analyzeMigrationPatterns(peopleData) {
    let analysis = '';

    // Count migrations
    const migrationsCount = peopleData.filter(p =>
      p.birthPlace && p.deathPlace && p.birthPlace !== p.deathPlace
    ).length;

    analysis += `**Total family members tracked**: ${peopleData.length}\n`;
    analysis += `**Family members who migrated**: ${migrationsCount}\n\n`;

    // Find most common locations
    const locationCounts = {};
    for (const person of peopleData) {
      if (person.birthPlace) locationCounts[person.birthPlace] = (locationCounts[person.birthPlace] || 0) + 1;
      if (person.deathPlace) locationCounts[person.deathPlace] = (locationCounts[person.deathPlace] || 0) + 1;
    }

    const sortedLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);

    if (sortedLocations.length > 0) {
      analysis += `**Most common locations**:\n`;
      for (let i = 0; i < Math.min(5, sortedLocations.length); i++) {
        analysis += `- ${sortedLocations[i][0]} (${sortedLocations[i][1]} mentions)\n`;
      }
      analysis += '\n';
    }

    // Identify migration trends
    const immigrationEvents = peopleData.reduce((sum, p) =>
      sum + p.migrationEvents.filter(e => e.type === 'Immigration').length, 0
    );
    const emigrationEvents = peopleData.reduce((sum, p) =>
      sum + p.migrationEvents.filter(e => e.type === 'Emigration').length, 0
    );

    if (immigrationEvents > 0 || emigrationEvents > 0) {
      analysis += `**Migration trends**:\n`;
      if (immigrationEvents > 0) analysis += `- ${immigrationEvents} immigration event(s) recorded\n`;
      if (emigrationEvents > 0) analysis += `- ${emigrationEvents} emigration event(s) recorded\n`;
      analysis += '\n';
    }

    return analysis;
  }

  /**
   * Generate family saga - chronological narrative of multiple people
   */
  async gedcomFamilySaga(familyIds, focusPersonId = null) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    // Collect all people's data
    const familyMembers = [];
    for (const id of familyIds) {
      const person = this.gedcomIndex.individuals.get(id);
      if (person) {
        const name = this.extractName(person);
        const events = this.extractEvents(person);
        const birthEvent = events.find(e => e.type === 'Birth');
        const deathEvent = events.find(e => e.type === 'Death');

        familyMembers.push({
          id,
          name,
          birthYear: this.extractYear(birthEvent?.date),
          deathYear: this.extractYear(deathEvent?.date),
          birthEvent,
          deathEvent,
          events,
          allEvents: events,
        });
      }
    }

    if (familyMembers.length === 0) {
      throw new Error('No valid family members found.');
    }

    // Sort by birth year
    familyMembers.sort((a, b) => {
      if (!a.birthYear && !b.birthYear) return 0;
      if (!a.birthYear) return 1;
      if (!b.birthYear) return -1;
      return a.birthYear - b.birthYear;
    });

    // Build saga
    let saga = `# Family Saga\n\n`;

    if (focusPersonId) {
      const focusPerson = familyMembers.find(m => m.id === focusPersonId);
      if (focusPerson) {
        saga += `## Centered on ${focusPerson.name}\n\n`;
      }
    }

    saga += `## The Family Story\n\n`;
    saga += `This saga follows ${familyMembers.length} family member(s) across `;

    const years = familyMembers.filter(m => m.birthYear || m.deathYear).map(m => m.birthYear || m.deathYear);
    if (years.length > 0) {
      const minYear = Math.min(...years.filter(y => y));
      const maxYear = Math.max(...years.filter(y => y));
      saga += `${maxYear - minYear} years (${minYear} - ${maxYear}).\n\n`;
    } else {
      saga += `multiple generations.\n\n`;
    }

    // Create chronological timeline of all events
    const allEvents = [];
    for (const member of familyMembers) {
      for (const event of member.allEvents) {
        allEvents.push({
          ...event,
          person: member.name,
          personId: member.id,
          year: this.extractYear(event.date),
        });
      }
    }

    // Sort by year
    allEvents.sort((a, b) => {
      if (!a.year && !b.year) return 0;
      if (!a.year) return 1;
      if (!b.year) return -1;
      return a.year - b.year;
    });

    // Group events by decade or generation
    saga += `## The Timeline\n\n`;

    let currentDecade = null;
    for (const event of allEvents) {
      if (!event.year) continue;

      const decade = Math.floor(event.year / 10) * 10;

      if (decade !== currentDecade) {
        currentDecade = decade;
        saga += `### The ${decade}s\n\n`;
      }

      saga += `**${event.year}** - ${event.person}: ${event.type}`;
      if (event.location) saga += ` in ${event.location}`;
      saga += '\n\n';
    }

    // Individual stories
    saga += `## Individual Stories\n\n`;
    for (const member of familyMembers) {
      saga += this.generateMemberStoryForSaga(member);
    }

    // Family connections
    saga += `## Family Connections\n\n`;
    saga += this.describeFamilyConnections(familyIds);

    return {
      content: [{
        type: 'text',
        text: saga,
      }],
    };
  }

  /**
   * Generate individual story for saga
   */
  generateMemberStoryForSaga(member) {
    let story = `### ${member.name}\n\n`;

    if (member.birthYear || member.deathYear) {
      story += `**${member.birthYear || '?'} - ${member.deathYear || '?'}**\n\n`;
    }

    if (member.birthEvent) {
      story += `Born`;
      if (member.birthEvent.date) story += ` on ${member.birthEvent.date}`;
      if (member.birthEvent.location) story += ` in ${member.birthEvent.location}`;
      story += '.\n\n';
    }

    // Key life events
    const keyEvents = member.events.filter(e =>
      !['Birth', 'Death'].includes(e.type)
    );

    if (keyEvents.length > 0) {
      story += `**Life events:**\n`;
      for (const event of keyEvents) {
        story += `- ${event.type}`;
        if (event.date) story += ` (${event.date})`;
        if (event.location) story += ` in ${event.location}`;
        story += '\n';
      }
      story += '\n';
    }

    if (member.deathEvent) {
      story += `Passed away`;
      if (member.deathEvent.date) story += ` on ${member.deathEvent.date}`;
      if (member.deathEvent.location) story += ` in ${member.deathEvent.location}`;
      story += '.\n\n';
    }

    return story;
  }

  /**
   * Describe family connections
   */
  describeFamilyConnections(familyIds) {
    let connections = '';

    // Find relationships between family members
    const relationships = [];
    for (let i = 0; i < familyIds.length; i++) {
      for (let j = i + 1; j < familyIds.length; j++) {
        const rel = this.findRelationship(familyIds[i], familyIds[j]);
        if (rel) {
          const name1 = this.extractName(this.gedcomIndex.individuals.get(familyIds[i]));
          const name2 = this.extractName(this.gedcomIndex.individuals.get(familyIds[j]));
          relationships.push(`- ${name1} and ${name2}: ${rel.description}`);
        }
      }
    }

    if (relationships.length > 0) {
      connections += relationships.join('\n');
    } else {
      connections += 'Relationships between family members could not be determined.';
    }

    return connections + '\n\n';
  }

  /**
   * Compare siblings' life experiences
   */
  async gedcomSiblingComparison(siblingIds) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    if (siblingIds.length < 2) {
      throw new Error('At least 2 siblings required for comparison.');
    }

    // Collect sibling data
    const siblings = [];
    for (const id of siblingIds) {
      const person = this.gedcomIndex.individuals.get(id);
      if (person) {
        const name = this.extractName(person);
        const events = this.extractEvents(person);
        const birthEvent = events.find(e => e.type === 'Birth');
        const deathEvent = events.find(e => e.type === 'Death');

        siblings.push({
          id,
          name,
          birthYear: this.extractYear(birthEvent?.date),
          deathYear: this.extractYear(deathEvent?.date),
          birthPlace: birthEvent?.location,
          deathPlace: deathEvent?.location,
          lifespan: (birthEvent && deathEvent) ?
            (this.extractYear(deathEvent.date) - this.extractYear(birthEvent.date)) : null,
          events,
          marriages: events.filter(e => e.type === 'Marriage'),
          children: this.countChildren(id),
          occupations: events.filter(e => e.type === 'Occupation'),
          migrations: events.filter(e => ['Immigration', 'Emigration', 'Residence'].includes(e.type)),
        });
      }
    }

    // Build comparison
    let comparison = `# Sibling Comparison\n\n`;
    comparison += `Comparing the lives of ${siblings.length} siblings.\n\n`;

    // Summary table
    comparison += `## Quick Comparison\n\n`;
    comparison += `| Name | Birth Year | Death Year | Lifespan | Birth Place |\n`;
    comparison += `|------|------------|------------|----------|-------------|\n`;
    for (const sibling of siblings) {
      comparison += `| ${sibling.name} | ${sibling.birthYear || '?'} | ${sibling.deathYear || '?'} | `;
      comparison += `${sibling.lifespan ? sibling.lifespan + ' years' : '?'} | `;
      comparison += `${sibling.birthPlace || 'Unknown'} |\n`;
    }
    comparison += `\n`;

    // Similarities
    comparison += `## Similarities\n\n`;
    comparison += this.findSiblingSimilarities(siblings);

    // Differences
    comparison += `## Differences\n\n`;
    comparison += this.findSiblingDifferences(siblings);

    // Life paths
    comparison += `## Individual Life Paths\n\n`;
    for (const sibling of siblings) {
      comparison += this.describeSiblingLifePath(sibling);
    }

    return {
      content: [{
        type: 'text',
        text: comparison,
      }],
    };
  }

  /**
   * Count children for a person
   */
  countChildren(individualId) {
    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) return 0;

    let count = 0;
    const famsTags = person.children?.filter(c => c.tag === 'FAMS') || [];
    for (const famsTag of famsTags) {
      const family = this.gedcomIndex.families.get(famsTag.data);
      if (family) {
        const childTags = family.children?.filter(c => c.tag === 'CHIL') || [];
        count += childTags.length;
      }
    }
    return count;
  }

  /**
   * Find similarities between siblings
   */
  findSiblingSimilarities(siblings) {
    let similarities = '';

    // Birth place
    const birthPlaces = siblings.map(s => s.birthPlace).filter(p => p);
    if (birthPlaces.length > 0 && birthPlaces.every(p => p === birthPlaces[0])) {
      similarities += `- All siblings were born in **${birthPlaces[0]}**\n`;
    }

    // Migration patterns
    const allMigrated = siblings.every(s => s.migrations.length > 0);
    if (allMigrated) {
      similarities += `- All siblings experienced migration during their lifetimes\n`;
    }

    // Marriage
    const allMarried = siblings.every(s => s.marriages.length > 0);
    if (allMarried) {
      similarities += `- All siblings married\n`;
    }

    // Similar lifespans
    const lifespans = siblings.map(s => s.lifespan).filter(l => l !== null);
    if (lifespans.length > 1) {
      const avgLifespan = lifespans.reduce((sum, l) => sum + l, 0) / lifespans.length;
      const variance = lifespans.reduce((sum, l) => sum + Math.pow(l - avgLifespan, 2), 0) / lifespans.length;
      if (variance < 100) { // Similar lifespans (within ~10 years)
        similarities += `- Siblings had similar lifespans (average: ${Math.round(avgLifespan)} years)\n`;
      }
    }

    if (similarities === '') {
      similarities = 'No strong similarities identified in the available data.\n';
    }

    return similarities + '\n';
  }

  /**
   * Find differences between siblings
   */
  findSiblingDifferences(siblings) {
    let differences = '';

    // Lifespan differences
    const lifespans = siblings.filter(s => s.lifespan !== null);
    if (lifespans.length > 1) {
      const sorted = [...lifespans].sort((a, b) => a.lifespan - b.lifespan);
      const shortest = sorted[0];
      const longest = sorted[sorted.length - 1];
      if (longest.lifespan - shortest.lifespan > 20) {
        differences += `- **Lifespan variance**: ${shortest.name} lived ${shortest.lifespan} years, `;
        differences += `while ${longest.name} lived ${longest.lifespan} years (${longest.lifespan - shortest.lifespan} year difference)\n`;
      }
    }

    // Death place differences
    const deathPlaces = siblings.map(s => s.deathPlace).filter(p => p);
    const uniqueDeathPlaces = [...new Set(deathPlaces)];
    if (uniqueDeathPlaces.length > 1) {
      differences += `- Siblings died in different locations: ${uniqueDeathPlaces.join(', ')}\n`;
    }

    // Children count
    const childCounts = siblings.map(s => ({ name: s.name, count: s.children }));
    const maxChildren = Math.max(...childCounts.map(c => c.count));
    const minChildren = Math.min(...childCounts.map(c => c.count));
    if (maxChildren > minChildren) {
      const mostChildren = childCounts.find(c => c.count === maxChildren);
      const leastChildren = childCounts.find(c => c.count === minChildren);
      differences += `- **Family size**: ${mostChildren.name} had ${maxChildren} children, `;
      differences += `while ${leastChildren.name} had ${minChildren} children\n`;
    }

    // Occupation differences
    const occupations = siblings.map(s => ({
      name: s.name,
      occupations: s.occupations.map(o => o.location || 'occupation').join(', ')
    })).filter(o => o.occupations);

    if (occupations.length > 1) {
      differences += `- **Occupations varied**: `;
      differences += occupations.map(o => `${o.name} (${o.occupations})`).join('; ') + '\n';
    }

    if (differences === '') {
      differences = 'No significant differences identified in the available data.\n';
    }

    return differences + '\n';
  }

  /**
   * Describe a sibling's life path
   */
  describeSiblingLifePath(sibling) {
    let path = `### ${sibling.name}\n\n`;

    if (sibling.birthYear) {
      path += `Born in ${sibling.birthYear}`;
      if (sibling.birthPlace) path += ` in ${sibling.birthPlace}`;
      path += '. ';
    }

    if (sibling.marriages.length > 0) {
      path += `Married ${sibling.marriages.length} time(s). `;
    }

    if (sibling.children > 0) {
      path += `Had ${sibling.children} children. `;
    }

    if (sibling.migrations.length > 0) {
      path += `Migrated ${sibling.migrations.length} time(s). `;
    }

    if (sibling.deathYear) {
      path += `Died in ${sibling.deathYear}`;
      if (sibling.deathPlace) path += ` in ${sibling.deathPlace}`;
      path += '.';
    }

    path += '\n\n';

    // List significant events
    if (sibling.events.length > 0) {
      path += `**Key events:**\n`;
      const significantEvents = sibling.events.filter(e =>
        !['Birth', 'Death'].includes(e.type)
      ).slice(0, 5); // Limit to 5 events

      for (const event of significantEvents) {
        path += `- ${event.type}`;
        if (event.date) path += ` (${event.date})`;
        if (event.location) path += ` in ${event.location}`;
        path += '\n';
      }
      path += '\n';
    }

    return path;
  }

  /**
   * Compare generations (parent vs child, grandparent vs grandchild)
   */
  async gedcomGenerationalComparison(olderGenerationId, youngerGenerationId) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const olderPerson = this.gedcomIndex.individuals.get(olderGenerationId);
    const youngerPerson = this.gedcomIndex.individuals.get(youngerGenerationId);

    if (!olderPerson) throw new Error(`Individual ${olderGenerationId} not found.`);
    if (!youngerPerson) throw new Error(`Individual ${youngerGenerationId} not found.`);

    // Extract data for both people
    const olderData = this.extractPersonComparisonData(olderGenerationId);
    const youngerData = this.extractPersonComparisonData(youngerGenerationId);

    // Determine relationship
    const relationship = this.findRelationship(olderGenerationId, youngerGenerationId);

    let comparison = `# Generational Comparison\n\n`;
    comparison += `Comparing ${olderData.name} and ${youngerData.name}\n\n`;

    if (relationship) {
      comparison += `**Relationship**: ${relationship.description}\n\n`;
    }

    // Quick comparison table
    comparison += `## Overview\n\n`;
    comparison += `| Aspect | ${olderData.name} | ${youngerData.name} |\n`;
    comparison += `|--------|${'-'.repeat(olderData.name.length + 2)}|${'-'.repeat(youngerData.name.length + 2)}|\n`;
    comparison += `| Born | ${olderData.birthYear || '?'} | ${youngerData.birthYear || '?'} |\n`;
    comparison += `| Died | ${olderData.deathYear || '?'} | ${youngerData.deathYear || '?'} |\n`;
    comparison += `| Lifespan | ${olderData.lifespan ? olderData.lifespan + ' years' : '?'} | ${youngerData.lifespan ? youngerData.lifespan + ' years' : '?'} |\n`;
    comparison += `| Birthplace | ${olderData.birthPlace || 'Unknown'} | ${youngerData.birthPlace || 'Unknown'} |\n`;
    comparison += `| Married | ${olderData.marriages > 0 ? 'Yes' : 'No'} | ${youngerData.marriages > 0 ? 'Yes' : 'No'} |\n`;
    comparison += `| Children | ${olderData.children} | ${youngerData.children} |\n`;
    comparison += `| Migrations | ${olderData.migrations} | ${youngerData.migrations} |\n`;
    comparison += `\n`;

    // Historical context
    comparison += `## Historical Context\n\n`;
    comparison += this.compareGenerationalContext(olderData, youngerData);

    // Life circumstances
    comparison += `## Life Circumstances\n\n`;
    comparison += this.compareLifeCircumstances(olderData, youngerData);

    // Changes across generations
    comparison += `## Changes Across Generations\n\n`;
    comparison += this.identifyGenerationalChanges(olderData, youngerData);

    return {
      content: [{
        type: 'text',
        text: comparison,
      }],
    };
  }

  /**
   * Extract person data for generational comparison
   */
  extractPersonComparisonData(individualId) {
    const person = this.gedcomIndex.individuals.get(individualId);
    const name = this.extractName(person);
    const events = this.extractEvents(person);
    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');

    return {
      id: individualId,
      name,
      birthYear: this.extractYear(birthEvent?.date),
      deathYear: this.extractYear(deathEvent?.date),
      birthPlace: birthEvent?.location,
      deathPlace: deathEvent?.location,
      lifespan: (birthEvent && deathEvent) ?
        (this.extractYear(deathEvent.date) - this.extractYear(birthEvent.date)) : null,
      events,
      marriages: events.filter(e => e.type === 'Marriage').length,
      children: this.countChildren(individualId),
      migrations: events.filter(e => ['Immigration', 'Emigration', 'Residence'].includes(e.type)).length,
      occupations: events.filter(e => e.type === 'Occupation'),
      military: events.filter(e => e.type === 'Military').length > 0,
    };
  }

  /**
   * Compare generational historical context
   */
  compareGenerationalContext(older, younger) {
    let context = '';

    if (older.birthYear && younger.birthYear) {
      const yearGap = younger.birthYear - older.birthYear;
      context += `${older.name} was born ${yearGap} years before ${younger.name}.\n\n`;

      // Era differences
      if (older.birthYear < 1900 && younger.birthYear >= 1900) {
        context += `${older.name} was born in the **19th century**, while ${younger.name} was born in the **20th century**. `;
        context += `This generational shift brought dramatic changes in technology, society, and daily life.\n\n`;
      }
    }

    // Geographic changes
    if (older.birthPlace && younger.birthPlace) {
      if (older.birthPlace === younger.birthPlace) {
        context += `Both were born in ${older.birthPlace}, showing geographic stability across generations.\n\n`;
      } else {
        context += `**Geographic change**: ${older.name} was born in ${older.birthPlace}, while ${younger.name} was born in ${younger.birthPlace}. `;
        context += `This represents a family migration between generations.\n\n`;
      }
    }

    return context;
  }

  /**
   * Compare life circumstances
   */
  compareLifeCircumstances(older, younger) {
    let circumstances = '';

    // Lifespan
    if (older.lifespan && younger.lifespan) {
      if (younger.lifespan > older.lifespan) {
        circumstances += `**Longevity**: ${younger.name} lived ${younger.lifespan - older.lifespan} years longer than ${older.name}, `;
        circumstances += `potentially reflecting improved healthcare and living conditions.\n\n`;
      } else if (older.lifespan > younger.lifespan) {
        circumstances += `**Longevity**: ${older.name} lived ${older.lifespan - younger.lifespan} years longer than ${younger.name}.\n\n`;
      } else {
        circumstances += `**Longevity**: Both lived similar lifespans (${older.lifespan} years).\n\n`;
      }
    }

    // Family size
    if (older.children !== younger.children) {
      circumstances += `**Family size**: ${older.name} had ${older.children} children, while ${younger.name} had ${younger.children} children`;
      if (younger.children < older.children) {
        circumstances += `, reflecting a trend toward smaller families across generations`;
      }
      circumstances += `.\n\n`;
    }

    // Migration patterns
    if (older.migrations !== younger.migrations) {
      circumstances += `**Migration**: `;
      if (older.migrations > younger.migrations) {
        circumstances += `${older.name} migrated ${older.migrations} time(s), while ${younger.name} was more settled (${younger.migrations} migrations). `;
        circumstances += `The older generation may have been seeking opportunities.\n\n`;
      } else {
        circumstances += `${younger.name} migrated more frequently (${younger.migrations} times) than ${older.name} (${older.migrations} times), `;
        circumstances += `possibly reflecting increased mobility in later eras.\n\n`;
      }
    }

    return circumstances;
  }

  /**
   * Identify generational changes
   */
  identifyGenerationalChanges(older, younger) {
    const changes = [];

    // Birth location change
    if (older.birthPlace && younger.birthPlace && older.birthPlace !== younger.birthPlace) {
      changes.push(`The family moved from ${older.birthPlace} to ${younger.birthPlace} between generations`);
    }

    // Marriage patterns
    if (older.marriages === 0 && younger.marriages > 0) {
      changes.push(`${younger.name} married, while ${older.name}'s marriage records are not available`);
    } else if (older.marriages > 1 || younger.marriages > 1) {
      changes.push(`Multiple marriages were present in the family`);
    }

    // Occupation changes
    if (older.occupations.length > 0 && younger.occupations.length > 0) {
      const olderOccs = older.occupations.map(o => o.location || 'occupation');
      const youngerOccs = younger.occupations.map(o => o.location || 'occupation');
      changes.push(`Occupational shift: ${older.name} worked as ${olderOccs.join(', ')}, while ${younger.name} worked as ${youngerOccs.join(', ')}`);
    }

    // Military service
    if (older.military !== younger.military) {
      if (younger.military) {
        changes.push(`${younger.name} served in the military, unlike ${older.name}`);
      } else {
        changes.push(`${older.name} served in the military, unlike ${younger.name}`);
      }
    }

    if (changes.length === 0) {
      return 'Limited data available to identify specific generational changes.\n\n';
    }

    return changes.map(c => `- ${c}`).join('\n') + '\n\n';
  }

  /**
   * Answer natural language questions about a person
   */
  async gedcomAskAboutPerson(individualId, question) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    const name = this.extractName(person);
    const events = this.extractEvents(person);

    // Parse question and extract answer
    const answer = this.parseQuestionAndAnswer(question, individualId, name, events);

    return {
      content: [{
        type: 'text',
        text: `**Question about ${name}**: ${question}\n\n**Answer**: ${answer}`,
      }],
    };
  }

  /**
   * Parse question and generate answer
   */
  parseQuestionAndAnswer(question, individualId, name, events) {
    const q = question.toLowerCase();

    // Birth questions
    if (q.includes('when') && (q.includes('born') || q.includes('birth'))) {
      const birthEvent = events.find(e => e.type === 'Birth');
      if (birthEvent?.date) {
        return `${name} was born on ${birthEvent.date}${birthEvent.location ? ` in ${birthEvent.location}` : ''}.`;
      }
      return `Birth date for ${name} is not recorded in the available data.`;
    }

    if (q.includes('where') && (q.includes('born') || q.includes('birth'))) {
      const birthEvent = events.find(e => e.type === 'Birth');
      if (birthEvent?.location) {
        return `${name} was born in ${birthEvent.location}${birthEvent.date ? ` on ${birthEvent.date}` : ''}.`;
      }
      return `Birth location for ${name} is not recorded in the available data.`;
    }

    // Death questions
    if (q.includes('when') && (q.includes('died') || q.includes('death') || q.includes('pass'))) {
      const deathEvent = events.find(e => e.type === 'Death');
      if (deathEvent?.date) {
        return `${name} died on ${deathEvent.date}${deathEvent.location ? ` in ${deathEvent.location}` : ''}.`;
      }
      return `Death date for ${name} is not recorded in the available data.`;
    }

    if (q.includes('where') && (q.includes('died') || q.includes('death'))) {
      const deathEvent = events.find(e => e.type === 'Death');
      if (deathEvent?.location) {
        return `${name} died in ${deathEvent.location}${deathEvent.date ? ` on ${deathEvent.date}` : ''}.`;
      }
      return `Death location for ${name} is not recorded in the available data.`;
    }

    // Marriage questions
    if (q.includes('marr') || q.includes('spouse') || q.includes('wife') || q.includes('husband')) {
      const marriages = events.filter(e => e.type === 'Marriage');
      if (marriages.length > 0) {
        let answer = `${name} married ${marriages.length} time(s):\n`;
        for (const marriage of marriages) {
          answer += `- Marriage`;
          if (marriage.date) answer += ` on ${marriage.date}`;
          if (marriage.location) answer += ` in ${marriage.location}`;
          answer += '\n';
        }
        return answer;
      }
      return `No marriage records found for ${name} in the available data.`;
    }

    // Children questions
    if (q.includes('child') || q.includes('kids') || q.includes('offspring')) {
      const childCount = this.countChildren(individualId);
      if (childCount > 0) {
        return `${name} had ${childCount} child${childCount !== 1 ? 'ren' : ''}.`;
      }
      return `No children records found for ${name} in the available data.`;
    }

    // Location/residence questions
    if (q.includes('where') && (q.includes('live') || q.includes('reside'))) {
      const residences = events.filter(e => e.type === 'Residence');
      const birthEvent = events.find(e => e.type === 'Birth');
      const deathEvent = events.find(e => e.type === 'Death');

      const locations = [];
      if (birthEvent?.location) locations.push(birthEvent.location);
      for (const res of residences) {
        if (res.location && !locations.includes(res.location)) {
          locations.push(res.location);
        }
      }
      if (deathEvent?.location && !locations.includes(deathEvent.location)) {
        locations.push(deathEvent.location);
      }

      if (locations.length > 0) {
        return `${name} lived in: ${locations.join(', ')}.`;
      }
      return `No residence information available for ${name}.`;
    }

    // Age/lifespan questions
    if (q.includes('how old') || q.includes('age') || q.includes('lifespan') || q.includes('how long')) {
      const birthEvent = events.find(e => e.type === 'Birth');
      const deathEvent = events.find(e => e.type === 'Death');

      if (birthEvent?.date && deathEvent?.date) {
        const birthYear = this.extractYear(birthEvent.date);
        const deathYear = this.extractYear(deathEvent.date);
        if (birthYear && deathYear) {
          const lifespan = deathYear - birthYear;
          return `${name} lived for approximately ${lifespan} years (${birthYear}-${deathYear}).`;
        }
      }
      return `Lifespan information for ${name} is incomplete in the available data.`;
    }

    // Occupation questions
    if (q.includes('work') || q.includes('job') || q.includes('occupation') || q.includes('profession')) {
      const occupations = events.filter(e => e.type === 'Occupation');
      if (occupations.length > 0) {
        let answer = `${name}'s occupation(s):\n`;
        for (const occ of occupations) {
          answer += `- ${occ.location || 'Occupation recorded'}`;
          if (occ.date) answer += ` (${occ.date})`;
          answer += '\n';
        }
        return answer;
      }
      return `No occupation information available for ${name}.`;
    }

    // Migration questions
    if (q.includes('migrat') || q.includes('immigrat') || q.includes('emigrat') || q.includes('move')) {
      const migrations = events.filter(e => ['Immigration', 'Emigration', 'Residence'].includes(e.type));
      if (migrations.length > 0) {
        let answer = `${name}'s migration history:\n`;
        for (const mig of migrations) {
          answer += `- ${mig.type}`;
          if (mig.date) answer += ` (${mig.date})`;
          if (mig.location) answer += `: ${mig.location}`;
          answer += '\n';
        }
        return answer;
      }
      return `No migration records found for ${name}.`;
    }

    // Parents questions
    if (q.includes('parent') || q.includes('mother') || q.includes('father')) {
      const famcTag = this.gedcomIndex.individuals.get(individualId).children?.find(c => c.tag === 'FAMC');
      if (famcTag) {
        const parentFamily = this.gedcomIndex.families.get(famcTag.data);
        if (parentFamily) {
          const parents = [];
          const husbTag = parentFamily.children?.find(c => c.tag === 'HUSB');
          const wifeTag = parentFamily.children?.find(c => c.tag === 'WIFE');

          if (husbTag) {
            const father = this.gedcomIndex.individuals.get(husbTag.data);
            if (father) parents.push(`Father: ${this.extractName(father)}`);
          }
          if (wifeTag) {
            const mother = this.gedcomIndex.individuals.get(wifeTag.data);
            if (mother) parents.push(`Mother: ${this.extractName(mother)}`);
          }

          if (parents.length > 0) {
            return `${name}'s parents:\n` + parents.map(p => `- ${p}`).join('\n');
          }
        }
      }
      return `Parent information for ${name} is not available.`;
    }

    // Default: provide general summary
    return `I couldn't find a specific answer to that question. Here's what I know about ${name}:\n\n` +
           this.generateBriefSummary(name,
             events.find(e => e.type === 'Birth'),
             events.find(e => e.type === 'Death'),
             events);
  }

  /**
   * Get historical information about locations where person lived
   */
  async gedcomLocationHistory(individualId) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    const name = this.extractName(person);
    const events = this.extractEvents(person);

    // Extract all unique locations
    const locations = new Set();
    const locationEvents = [];

    for (const event of events) {
      if (event.location) {
        locations.add(event.location);
        locationEvents.push({
          location: event.location,
          type: event.type,
          date: event.date,
          year: this.extractYear(event.date),
        });
      }
    }

    if (locations.size === 0) {
      return {
        content: [{
          type: 'text',
          text: `No location information available for ${name}.`,
        }],
      };
    }

    let history = `# Location History for ${name}\n\n`;
    history += `${name} had connections to ${locations.size} location(s) throughout their life.\n\n`;

    // Sort events by year
    locationEvents.sort((a, b) => {
      if (!a.year && !b.year) return 0;
      if (!a.year) return 1;
      if (!b.year) return -1;
      return a.year - b.year;
    });

    // Chronological location timeline
    history += `## Chronological Location Timeline\n\n`;
    for (const event of locationEvents) {
      history += `- **${event.year || 'Unknown date'}**: ${event.type} in ${event.location}\n`;
    }
    history += `\n`;

    // Detailed location information
    history += `## Location Details\n\n`;
    for (const location of locations) {
      history += `### ${location}\n\n`;

      const eventsAtLocation = locationEvents.filter(e => e.location === location);
      history += `${name} had ${eventsAtLocation.length} recorded event(s) at this location:\n`;
      for (const event of eventsAtLocation) {
        history += `- ${event.type}`;
        if (event.date) history += ` (${event.date})`;
        history += '\n';
      }
      history += '\n';

      // Add geographic/historical context
      history += this.getLocationContext(location);
      history += '\n';
    }

    return {
      content: [{
        type: 'text',
        text: history,
      }],
    };
  }

  /**
   * Get context for a location
   */
  getLocationContext(location) {
    let context = '**Historical Context**: ';

    // Parse location for context clues
    const loc = location.toLowerCase();

    // Country-specific context
    if (loc.includes('england') || loc.includes('london') || loc.includes('uk')) {
      context += 'England was a major industrial and colonial power during the 19th and early 20th centuries. ';
    } else if (loc.includes('ireland')) {
      context += 'Ireland experienced significant emigration, particularly during and after the Great Famine (1845-1852). ';
    } else if (loc.includes('germany') || loc.includes('prussia')) {
      context += 'Germany underwent unification in 1871 and was a major European power. Many Germans emigrated to America in the 19th century. ';
    } else if (loc.includes('italy')) {
      context += 'Italy saw massive emigration between 1880-1920, with millions seeking opportunities abroad. ';
    } else if (loc.includes('new york')) {
      context += 'New York was a major port of entry for immigrants and a rapidly growing industrial center. Ellis Island processed millions of arrivals. ';
    } else if (loc.includes('california')) {
      context += 'California attracted settlers during the Gold Rush (1849) and continued to grow with opportunities in agriculture, mining, and later technology. ';
    } else if (loc.includes('pennsylvania')) {
      context += 'Pennsylvania was a major industrial state, known for coal mining, steel production, and manufacturing. ';
    } else if (loc.includes('massachusetts') || loc.includes('boston')) {
      context += 'Massachusetts was a center of early American history, industry, and immigration, particularly for Irish and Italian immigrants. ';
    } else if (loc.includes('chicago')) {
      context += 'Chicago grew rapidly as a railroad hub and industrial center, attracting immigrants from across Europe. ';
    } else {
      context += 'This location played a role in the family\'s geographic journey. ';
    }

    context += '\n\n';
    return context;
  }

  /**
   * Describe what life was like during person's lifetime
   */
  async gedcomEraContext(individualId, includeWorldEvents = true) {
    if (!this.gedcomData) {
      throw new Error('No GEDCOM file loaded. Use gedcom_load first.');
    }

    const person = this.gedcomIndex.individuals.get(individualId);
    if (!person) {
      throw new Error(`Individual ${individualId} not found.`);
    }

    const name = this.extractName(person);
    const events = this.extractEvents(person);
    const birthEvent = events.find(e => e.type === 'Birth');
    const deathEvent = events.find(e => e.type === 'Death');

    const birthYear = this.extractYear(birthEvent?.date);
    const deathYear = this.extractYear(deathEvent?.date);

    if (!birthYear) {
      return {
        content: [{
          type: 'text',
          text: `Unable to determine era context for ${name} - birth year is not available.`,
        }],
      };
    }

    let context = `# Life and Times of ${name}\n\n`;
    context += `## Overview\n\n`;

    if (deathYear) {
      context += `${name} lived from ${birthYear} to ${deathYear} (approximately ${deathYear - birthYear} years).\n\n`;
    } else {
      context += `${name} was born in ${birthYear}.\n\n`;
    }

    // Era classification
    context += `## Historical Era\n\n`;
    context += this.classifyEra(birthYear, deathYear);

    // Major events during lifetime
    if (includeWorldEvents) {
      context += `## Major Historical Events During ${name}'s Lifetime\n\n`;
      context += this.getMajorEvents(birthYear, deathYear);
    }

    // Daily life context
    context += `## Daily Life and Society\n\n`;
    context += this.getDailyLifeContext(birthYear, deathYear);

    // Technology and innovation
    context += `## Technology and Innovation\n\n`;
    context += this.getTechnologyContext(birthYear, deathYear);

    return {
      content: [{
        type: 'text',
        text: context,
      }],
    };
  }

  /**
   * Classify historical era
   */
  classifyEra(birthYear, deathYear) {
    let era = '';

    if (birthYear < 1800) {
      era += `${name} was born in the **18th century**, during the Age of Enlightenment and before the Industrial Revolution.\n\n`;
    } else if (birthYear >= 1800 && birthYear < 1850) {
      era += `Born in the **early 19th century**, during the height of the Industrial Revolution and westward expansion in America.\n\n`;
    } else if (birthYear >= 1850 && birthYear < 1900) {
      era += `Born in the **mid-to-late 19th century**, an era of rapid industrialization, immigration, and social change.\n\n`;
    } else if (birthYear >= 1900 && birthYear < 1920) {
      era += `Born in the **early 20th century**, witnessing the end of the Victorian era and the tumultuous period of World War I.\n\n`;
    } else if (birthYear >= 1920 && birthYear < 1945) {
      era += `Born between the **World Wars**, experiencing the Roaring Twenties, Great Depression, and World War II.\n\n`;
    } else if (birthYear >= 1945 && birthYear < 1965) {
      era += `Born in the **post-World War II era**, during the Baby Boom and Cold War period.\n\n`;
    } else if (birthYear >= 1965 && birthYear < 1980) {
      era += `Born in the **late 20th century**, during the Civil Rights movement and the Space Age.\n\n`;
    } else {
      era += `Born in the **modern era**.\n\n`;
    }

    return era;
  }

  /**
   * Get major historical events during lifetime
   */
  getMajorEvents(birthYear, deathYear) {
    const events = [];
    const endYear = deathYear || new Date().getFullYear();

    // American Civil War
    if (birthYear <= 1865 && endYear >= 1861) {
      events.push(`**American Civil War (1861-1865)**: The deadliest conflict in American history, ending slavery`);
    }

    // Industrial Revolution
    if (birthYear <= 1900 && endYear >= 1800) {
      events.push(`**Industrial Revolution**: Transformation from agrarian to industrial society, with factories, railroads, and urbanization`);
    }

    // World War I
    if (birthYear <= 1918 && endYear >= 1914) {
      events.push(`**World War I (1914-1918)**: "The Great War" that reshaped global politics and society`);
    }

    // Great Depression
    if (birthYear <= 1939 && endYear >= 1929) {
      events.push(`**Great Depression (1929-1939)**: Severe worldwide economic depression affecting millions`);
    }

    // World War II
    if (birthYear <= 1945 && endYear >= 1939) {
      events.push(`**World War II (1939-1945)**: Global conflict that changed the world order`);
    }

    // Cold War
    if (birthYear <= 1991 && endYear >= 1947) {
      events.push(`**Cold War (1947-1991)**: Geopolitical tension between the US and Soviet Union`);
    }

    // Women's Suffrage
    if (birthYear <= 1920 && endYear >= 1848) {
      events.push(`**Women's Suffrage Movement**: Culminating in women gaining the right to vote (19th Amendment, 1920)`);
    }

    // Immigration waves
    if (birthYear <= 1920 && endYear >= 1880) {
      events.push(`**Mass Immigration (1880-1920)**: Over 20 million immigrants arrived in the United States`);
    }

    if (events.length === 0) {
      return 'Historical events during this period are beyond the scope of this summary.\n\n';
    }

    return events.map(e => `- ${e}`).join('\n') + '\n\n';
  }

  /**
   * Get daily life context
   */
  getDailyLifeContext(birthYear, deathYear) {
    const midLife = birthYear + Math.floor((deathYear ? (deathYear - birthYear) / 2 : 30));

    if (midLife < 1850) {
      return `Life was largely rural and agricultural. Most people lived on farms, transportation was by horse, ` +
             `and communication was limited to letters. Work was physically demanding, and life expectancy was shorter.\n\n`;
    } else if (midLife < 1900) {
      return `Society was transitioning from rural to urban. Railroads connected cities, factories provided employment, ` +
             `but working conditions were often harsh. Gas lighting was replacing candles, but electricity was still rare.\n\n`;
    } else if (midLife < 1945) {
      return `Urban life was increasingly common. Electricity, telephones, and automobiles were transforming daily life. ` +
             `Radio provided entertainment and news. However, economic instability and world wars created challenges.\n\n`;
    } else {
      return `Modern conveniences like television, refrigeration, and automobiles were becoming standard. ` +
             `Suburban living expanded, and the middle class grew. Society was more mobile and connected than ever before.\n\n`;
    }
  }

  /**
   * Get technology context
   */
  getTechnologyContext(birthYear, deathYear) {
    const technologies = [];
    const endYear = deathYear || new Date().getFullYear();

    if (birthYear <= 1876 && endYear >= 1876) technologies.push('Telephone invented (1876)');
    if (birthYear <= 1879 && endYear >= 1879) technologies.push('Electric light bulb (1879)');
    if (birthYear <= 1903 && endYear >= 1903) technologies.push('First airplane flight (1903)');
    if (birthYear <= 1920 && endYear >= 1920) technologies.push('Commercial radio broadcasting began (1920)');
    if (birthYear <= 1927 && endYear >= 1927) technologies.push('Television demonstrated (1927)');
    if (birthYear <= 1945 && endYear >= 1945) technologies.push('Nuclear age began (1945)');
    if (birthYear <= 1969 && endYear >= 1969) technologies.push('Moon landing (1969)');
    if (birthYear <= 1989 && endYear >= 1989) technologies.push('World Wide Web invented (1989)');

    if (technologies.length === 0) {
      return 'Technological developments during this era are beyond the scope of this summary.\n\n';
    }

    return `Key innovations during this lifetime:\n` + technologies.map(t => `- ${t}`).join('\n') + '\n\n';
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Ancestry MCP server running on stdio');
  }
}

const server = new AncestryMCPServer();
server.run().catch(console.error);
