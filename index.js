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
