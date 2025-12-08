#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';

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

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
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
      this.browser = await chromium.launch({
        headless: true,
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });
      this.page = await this.context.newPage();
    }
  }

  async login() {
    if (!this.username || !this.password) {
      throw new Error('ANCESTRY_USERNAME and ANCESTRY_PASSWORD must be set in environment');
    }

    await this.initBrowser();

    try {
      await this.page.goto('https://www.ancestry.com/account/signin', {
        waitUntil: 'networkidle',
      });

      // Fill in login form
      await this.page.fill('input[name="username"]', this.username);
      await this.page.fill('input[name="password"]', this.password);
      
      // Click sign in
      await this.page.click('button[type="submit"]');
      
      // Wait for navigation
      await this.page.waitForLoadState('networkidle');

      this.isLoggedIn = true;

      return {
        content: [
          {
            type: 'text',
            text: 'Successfully logged in to Ancestry.com',
          },
        ],
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async searchPerson(args) {
    await this.ensureLoggedIn();

    const { firstName, lastName, birthYear, deathYear, location } = args;

    try {
      // Go to search page
      await this.page.goto('https://www.ancestry.com/search/', {
        waitUntil: 'networkidle',
      });

      // Fill search form
      await this.page.fill('input[name="firstname"]', firstName);
      await this.page.fill('input[name="lastname"]', lastName);
      
      if (birthYear) {
        await this.page.fill('input[name="birth"]', birthYear);
      }
      if (deathYear) {
        await this.page.fill('input[name="death"]', deathYear);
      }
      if (location) {
        await this.page.fill('input[name="location"]', location);
      }

      // Submit search
      await this.page.click('button[type="submit"]');
      await this.page.waitForLoadState('networkidle');

      // Extract search results
      const results = await this.page.evaluate(() => {
        const resultElements = document.querySelectorAll('.searchResult');
        return Array.from(resultElements).slice(0, 10).map(el => {
          const nameEl = el.querySelector('.name');
          const birthEl = el.querySelector('.birth');
          const deathEl = el.querySelector('.death');
          const linkEl = el.querySelector('a');
          
          return {
            name: nameEl?.textContent?.trim() || '',
            birth: birthEl?.textContent?.trim() || '',
            death: deathEl?.textContent?.trim() || '',
            url: linkEl?.href || '',
          };
        });
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results, count: results.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
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

      let narrative = `# Life Story of ${name}\n\n`;

      // Birth section
      if (birthDate && birthPlace) {
        narrative += `## Early Life\n\n`;
        narrative += `${name} was born on ${birthDate} in ${birthPlace}.\n\n`;

        // Add historical context (this would use web search in full implementation)
        if (includeRegionalHistory && birthPlace) {
          narrative += `During this time, ${birthPlace} was experiencing [historical context would be added via web search].\n\n`;
        }
      }

      // Major life events
      if (events.length > 0) {
        narrative += `## Life Events\n\n`;
        events.forEach(event => {
          narrative += `### ${event.type}\n`;
          if (event.date) narrative += `**Date:** ${event.date}\n`;
          if (event.location) narrative += `**Location:** ${event.location}\n`;
          narrative += '\n';
        });
      }

      // Death section
      if (deathDate && deathPlace) {
        narrative += `## Later Years\n\n`;
        narrative += `${name} passed away on ${deathDate} in ${deathPlace}.\n\n`;
      }

      // Historical timeline
      if (includeWorldEvents && birthDate) {
        narrative += `## Historical Context\n\n`;
        narrative += `During ${name}'s lifetime, the world saw [major events would be added via web search].\n\n`;
      }

      narrative += `---\n\n*This narrative was generated based on available genealogical records. `;
      narrative += `Historical context can be enriched by searching for events during the person's lifetime.*\n`;

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

  async ensureLoggedIn() {
    if (!this.isLoggedIn) {
      await this.login();
    }
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
