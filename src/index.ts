#!/usr/bin/env node

/**
 * Copyright (c) 2024 John Jung
 * 
 * Vitally MCP Server
 * 
 * This MCP server connects to the Vitally API to provide customer information.
 * It allows:
 * - Listing accounts as resources
 * - Reading account details
 * - Searching for users
 * - Querying account health scores
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';

// Type definitions for Vitally API responses
interface VitallyAccount {
  id: string;
  name: string;
  externalId?: string;
  traits?: Record<string, any>;
  healthScore?: number;
  mrr?: number;
  npsScore?: number;
  npsDetractorCount?: number;
  npsPassiveCount?: number;
  npsPromoterCount?: number;
  usersCount?: number;
  churnedAt?: string;
  firstSeenTimestamp?: string;
  lastSeenTimestamp?: string;
  lastInboundMessageTimestamp?: string;
  lastOutboundMessageTimestamp?: string;
  nextRenewalDate?: string;
  trialEndDate?: string;
  csmId?: string;
  accountExecutiveId?: string;
  accountOwnerId?: string;
  organizationId?: string;
  segments?: Array<{ id: string; name: string }>;
  keyRoles?: Array<any>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface VitallyCustomField {
  label: string;
  type: string;
  path: string;
  createdAt: string;
}

interface VitallyCustomObjectField {
  label: string;
  type: string;
  path: string;
  model: string;
}

interface VitallyCustomObject {
  id: string;
  name: string;
  label: string;
  writeMode: string;
  syncActive?: boolean;
  customFields?: VitallyCustomObjectField[];
  createdAt?: string;
  updatedAt?: string;
}

interface VitallyCustomObjectInstanceCustomer {
  id: string;
  name: string;
  externalId?: string;
  traits?: Record<string, any>;
}

interface VitallyDescriptionNode {
  children: Array<{ text: string }>;
}

interface VitallyCustomObjectInstance {
  id: string;
  name: string;
  externalId?: string;
  customObjectId: string;
  customerId?: string;
  customer?: VitallyCustomObjectInstanceCustomer;
  customers?: VitallyCustomObjectInstanceCustomer[];
  organizationId?: string;
  organization?: { id: string; name: string };
  ownedByVitallyUserId?: string;
  createdByVitallyUserId?: string;
  descriptionBody?: VitallyDescriptionNode[];
  traits?: Record<string, any>;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface VitallyNpsResponse {
  id: string;
  externalId?: string;
  userId: string;
  score: number;
  feedback?: string;
  respondedAt: string;
  [key: string]: any;
}

interface VitallyProject {
  id: string;
  name: string;
  accountId?: string;
  durationInDays?: number;
  ownedByVitallyUserId?: string;
  targetStartDate?: string;
  actualStartDate?: string;
  actualCompletionDate?: string;
  projectStatusId?: string;
  projectCategoryId?: string;
  traits?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface VitallyUser {
  id: string;
  name?: string;
  email?: string;
  externalId?: string;
  [key: string]: any;
}

interface VitallyPaginatedResponse<T> {
  results: T[];
  next: string | null;
}

// Additional type definitions for Vitally API responses
interface VitallyConversation {
  id: string;
  subject?: string;
  createdAt: string;
  updatedAt: string;
  account?: {
    id: string;
    name: string;
  };
  [key: string]: any;
}

interface VitallyTask {
  id: string;
  title: string;
  description?: string;
  status?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  account?: {
    id: string;
    name: string;
  };
  [key: string]: any;
}

interface VitallyNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  account?: {
    id: string;
    name: string;
  };
  [key: string]: any;
}

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.error(`Loaded environment from ${envPath}`);
} else {
  console.error(`Warning: No .env file found at ${envPath}`);
}

// Vitally API Configuration
const VITALLY_SUBDOMAIN = process.env.VITALLY_API_SUBDOMAIN || 'nylas';
const VITALLY_API_KEY = process.env.VITALLY_API_KEY;
const VITALLY_DATA_CENTER = (process.env.VITALLY_DATA_CENTER || 'US').toUpperCase();

// API Base URL based on data center
const API_BASE_URL = VITALLY_DATA_CENTER === 'EU'
  ? 'https://rest.vitally-eu.io'
  : `https://${VITALLY_SUBDOMAIN}.rest.vitally.io`;

// Validation
if (!VITALLY_API_KEY || VITALLY_API_KEY === 'your_api_key_here') {
  console.error('Error: VITALLY_API_KEY is not set or is using the default placeholder value');
  console.error('Please update your .env file with a valid Vitally API key');

  // Mock API key for demo mode
  const DEMO_MODE = true;
  if (DEMO_MODE) {
    console.error('Starting in DEMO MODE with mock data');
  } else {
    process.exit(1);
  }
}

// API Authentication header
const AUTH_HEADER = `Basic ${Buffer.from(`${VITALLY_API_KEY}:`).toString('base64')}`;

/**
 * Helper function to make authenticated requests to the Vitally API
 */
async function callVitallyAPI<T>(endpoint: string, method = 'GET', body?: any): Promise<T> {
  // Check if we're in demo mode due to missing API key
  if (!VITALLY_API_KEY || VITALLY_API_KEY === 'your_api_key_here') {
    return mockApiResponse(endpoint, method, body);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const options: any = {
    method,
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T;
    return data;
  } catch (error) {
    console.error(`Error calling Vitally API: ${error}`);
    throw error;
  }
}

/**
 * Fetch all pages from a paginated Vitally API endpoint.
 * Uses cursor-based pagination via the `next` / `from` pattern.
 * 
 * @param endpoint  - The API path (without query string), e.g. '/resources/accounts'
 * @param params    - Additional query parameters (e.g. { status: 'active' })
 * @param maxPages  - Safety limit to prevent runaway loops (default: 50)
 * @returns All results concatenated across every page
 */
async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string> = {},
  maxPages: number = 50
): Promise<T[]> {
  const allResults: T[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    const queryParams = new URLSearchParams(params);
    queryParams.set('limit', '100'); // Vitally max per page
    if (cursor) {
      queryParams.set('from', cursor);
    }

    const url = `${endpoint}?${queryParams.toString()}`;
    const response = await callVitallyAPI<VitallyPaginatedResponse<T>>(url);

    if (response.results && response.results.length > 0) {
      allResults.push(...response.results);
    }

    cursor = response.next;
    pageCount++;

    // Small delay between pages to be respectful of rate limits (1000 req/min)
    if (cursor) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } while (cursor && pageCount < maxPages);

  if (cursor) {
    console.error(`Warning: fetchAllPages hit maxPages limit (${maxPages}) for ${endpoint}. Some results may be missing.`);
  }

  return allResults;
}

/**
 * Mock API response for demo mode when API key is not available
 */
function mockApiResponse<T>(endpoint: string, method = 'GET', body?: any): T {
  console.error(`DEMO MODE: Mock API call to ${endpoint} [${method}]`);

  // Mock accounts
  const mockAccounts = [
    { id: "1", name: "Acme Corporation", externalId: "acme-corp" },
    { id: "2", name: "Globex Industries", externalId: "globex" },
    { id: "3", name: "Initech Technologies", externalId: "initech" },
    { id: "4", name: "Umbrella Corporation", externalId: "umbrella" },
    { id: "5", name: "Stark Industries", externalId: "stark" }
  ];

  // Mock users
  const mockUsers = [
    { id: "101", name: "John Doe", email: "john@acme-corp.com", externalId: "user-101", accountId: "1" },
    { id: "102", name: "Jane Smith", email: "jane@globex.com", externalId: "user-102", accountId: "2" },
    { id: "103", name: "Mike Johnson", email: "mike@initech.com", externalId: "user-103", accountId: "3" }
  ];

  // Handle different endpoints
  if (endpoint === '/resources/accounts') {
    return {
      results: mockAccounts,
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.endsWith('/healthScores')) {
    const accountId = endpoint.split('/')[3];
    return {
      overallHealth: 85,
      components: [
        { name: "Product Usage", score: 90 },
        { name: "Support Tickets", score: 75 },
        { name: "Billing Status", score: 95 }
      ],
      accountId
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && !endpoint.includes('/')) {
    const accountId = endpoint.split('/')[3];
    const account = mockAccounts.find(a => a.id === accountId);
    if (account) {
      return {
        ...account,
        traits: { "vitally.custom.plan": "enterprise", "vitally.custom.deploymentModel": "cloud" },
        healthScore: 8,
        mrr: 5000,
        npsScore: 45,
        usersCount: 12,
        lastSeenTimestamp: "2024-01-15T10:00:00Z",
        nextRenewalDate: "2025-06-01T00:00:00Z",
        csmId: "csm-1",
        segments: [{ id: "seg-1", name: "Enterprise" }]
      } as unknown as T;
    }
    return account as unknown as T;
  }

  if (endpoint.startsWith('/resources/users/search')) {
    return {
      results: mockUsers,
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.includes('/conversations')) {
    return {
      results: [
        { id: "c1", subject: "Product Feedback", createdAt: "2023-01-15T10:30:00Z", updatedAt: "2023-01-16T15:45:00Z" },
        { id: "c2", subject: "Support Question", createdAt: "2023-02-22T09:15:00Z", updatedAt: "2023-02-23T11:30:00Z" }
      ],
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.includes('/tasks')) {
    return {
      results: [
        { id: "t1", title: "Follow-up Call", description: "Schedule follow-up for new feature", status: "open", createdAt: "2023-03-10T14:20:00Z", updatedAt: "2023-03-10T14:20:00Z" },
        { id: "t2", title: "Renewal Discussion", description: "Discuss upcoming renewal", status: "completed", createdAt: "2023-02-05T11:00:00Z", updatedAt: "2023-02-28T16:45:00Z" }
      ],
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.includes('/notes') && method === 'POST') {
    return {
      id: "n1",
      content: body.content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as unknown as T;
  }

  if (endpoint === '/resources/customFields' || endpoint.startsWith('/resources/customFields?')) {
    return [
      { label: "Plan", type: "string", path: "vitally.custom.plan", createdAt: "2023-01-01T00:00:00Z" },
      { label: "Deployment Model", type: "string", path: "vitally.custom.deploymentModel", createdAt: "2023-01-01T00:00:00Z" },
      { label: "Entitlement Level", type: "string", path: "vitally.custom.entitlementLevel", createdAt: "2023-03-15T00:00:00Z" },
      { label: "Product License", type: "string", path: "vitally.custom.productLicense", createdAt: "2023-03-15T00:00:00Z" }
    ] as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.includes('/npsResponses')) {
    return {
      results: [
        { id: "nps-1", externalId: "nps-resp-1", userId: "101", score: 9, feedback: "Great product!", respondedAt: "2024-01-10T14:00:00Z" },
        { id: "nps-2", externalId: "nps-resp-2", userId: "102", score: 7, feedback: "Good but could improve docs", respondedAt: "2024-01-12T09:30:00Z" }
      ],
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && endpoint.includes('/projects')) {
    return {
      results: [
        { id: "p1", name: "Enterprise Onboarding", accountId: "1", durationInDays: 30, targetStartDate: "2024-01-01", actualStartDate: "2024-01-05", actualCompletionDate: null, projectStatusId: "in-progress", traits: {} },
      ],
      next: null
    } as unknown as T;
  }

  if (endpoint.startsWith('/resources/accounts/') && method === 'PUT') {
    const accountId = endpoint.split('/')[3];
    const account = mockAccounts.find(a => a.id === accountId);
    return { ...account, ...body, traits: { ...(account as any)?.traits, ...body?.traits } } as unknown as T;
  }

  return {} as T;
}

// In-memory cache for accounts and users
let accountsCache: VitallyAccount[] = [];
let accountsCacheTimestamp = 0;
let usersCache: VitallyUser[] = [];

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function isCacheStale(): boolean {
  return accountsCache.length === 0 || Date.now() - accountsCacheTimestamp > CACHE_TTL_MS;
}

function setAccountsCache(accounts: VitallyAccount[]): void {
  accountsCache = accounts;
  accountsCacheTimestamp = Date.now();
}

/**
 * Extract plain text from a Slate-style descriptionBody array.
 * Joins paragraph children text with newlines, stripping empty paragraphs.
 */
function extractDescription(nodes: VitallyDescriptionNode[] | undefined): string {
  if (!nodes?.length) return '';
  return nodes
    .map(node => node.children.map(c => c.text).join(''))
    .filter(line => line.trim() !== '')
    .join('\n');
}

/**
 * Return a slim customer list from a custom object instance.
 * Prefers the `customers` array (all linked accounts) over the singular
 * `customer` field (primary only). ARR is pulled from traits.
 */
function slimCustomers(inst: VitallyCustomObjectInstance) {
  const source = inst.customers?.length
    ? inst.customers
    : inst.customer
      ? [inst.customer]
      : [];

  return source.map(c => ({
    id: c.id,
    name: c.name,
    externalId: c.externalId ?? null,
    arr: c.traits?.['vitally.custom.arr'] ?? null
  }));
}

/**
 * Create an MCP server with capabilities for resources and tools
 */
const server = new Server(
  {
    name: "vitally-api",
    version: "0.1.0",
    transport: {
      type: "http-stream",
      options: {
        port: 1337,
        cors: {
          allowOrigin: "*"
        }
      }
    },
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },

  }
);

/**
 * Handler for listing available accounts as resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    // Fetch accounts from Vitally API if not cached or stale (first page only)
    if (isCacheStale()) {
      const response = await callVitallyAPI<VitallyPaginatedResponse<VitallyAccount>>(
        '/resources/accounts?limit=100'
      );
      setAccountsCache(response.results || []);
    }

    return {
      resources: accountsCache.map(account => ({
        uri: `vitally://account/${account.id}`,
        mimeType: "application/json",
        name: account.name,
        description: `Vitally customer account: ${account.name}`
      }))
    };
  } catch (error) {
    console.error('Error listing resources:', error);
    return { resources: [] };
  }
});

/**
 * Handler for reading the details of a specific account
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const path = url.pathname.replace(/^\//, '');
  const [type, id] = path.split('/');

  if (type === 'account') {
    try {
      const account = await callVitallyAPI<VitallyAccount>(`/resources/accounts/${id}`);
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: "application/json",
          text: JSON.stringify(account, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to retrieve account ${id}: ${error}`);
    }
  }

  throw new Error(`Resource type '${type}' not supported`);
});

/**
 * Handler that lists available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const allTools = [
    {
      name: "search_tools",
      description: "Vitally tool to search for available tools by keyword",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "Keyword to search for in tool names and descriptions"
          }
        },
        required: ["keyword"]
      }
    },
    {
      name: "search_users",
      description: "Vitally tool to search for users by email or external ID",
      inputSchema: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "User email address"
          },
          externalId: {
            type: "string",
            description: "External user ID"
          },
          emailSubdomain: {
            type: "string",
            description: "Email subdomain to search for"
          }
        }
      }
    },
    {
      name: "search_accounts",
      description: "Vitally tool to search for accounts by multiple criteria. Searches locally against cached accounts. Use maxPages to control how many API pages are fetched (each page = 100 accounts).",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Full or partial account name to search for"
          },
          externalId: {
            type: "string",
            description: "External account ID to search for"
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default: 10)"
          },
          maxPages: {
            type: "number",
            description: "Number of API pages to fetch before searching (default: 1, each page = 100 accounts). Increase only if you need to search beyond the first 100 accounts."
          }
        }
      }
    },
    {
      name: "get_account_health",
      description: "Vitally tool to get health scores for an account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "find_account_by_name",
      description: "Vitally tool to find an account by name (partial match supported). Searches locally against cached accounts. Use maxPages to search beyond the first 100 accounts.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Full or partial account name to search for"
          },
          maxPages: {
            type: "number",
            description: "Number of API pages to fetch before searching (default: 1, each page = 100 accounts). Increase only if you need to search beyond the first 100 accounts."
          }
        },
        required: ["name"]
      }
    },
    {
      name: "get_account_conversations",
      description: "Vitally tool to get recent conversations for an account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          limit: {
            type: "number",
            description: "Maximum number of conversations to return (default: 10)"
          },
          cursor: {
            type: "string",
            description: "Pagination cursor returned from a previous call to get the next page"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "get_account_tasks",
      description: "Vitally tool to get tasks for an account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          status: {
            type: "string",
            description: "Filter tasks by status (e.g., 'open', 'completed')"
          },
          limit: {
            type: "number",
            description: "Maximum number of tasks to return (default: 10)"
          },
          cursor: {
            type: "string",
            description: "Pagination cursor returned from a previous call to get the next page"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "get_account_notes",
      description: "Vitally tool to retrieve notes for an account. Returns truncated previews (300 chars). Use get_note_by_id for full content.",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          limit: {
            type: "number",
            description: "Maximum number of notes to return (default: 10)"
          },
          cursor: {
            type: "string",
            description: "Pagination cursor returned from a previous call to get the next page"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "get_note_by_id",
      description: "Vitally tool to retrieve full content of a specific note by ID",
      inputSchema: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "Vitally note ID"
          }
        },
        required: ["noteId"]
      }
    },
    {
      name: "create_account_note",
      description: "Vitally tool to create a new note for an account",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          content: {
            type: "string",
            description: "Content of the note"
          }
        },
        required: ["accountId", "content"]
      }
    },
    {
      name: "refresh_accounts",
      description: "Vitally tool to refresh the list of accounts. By default fetches ALL accounts across all pages (cursor-based pagination). Set fetchAll to false to fetch only the first page.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by account status: 'active' (default), 'churned', or 'activeOrChurned'",
            enum: ["active", "churned", "activeOrChurned"]
          },
          fetchAll: {
            type: "boolean",
            description: "If true (default), fetches all accounts across all pages. If false, fetches only the first page (up to 100)."
          }
        }
      }
    },
    {
      name: "get_account_details",
      description: "Get full account details including traits, success metrics, health score, MRR, NPS score, timestamps, CSM assignment, segments, and all custom properties",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID or external ID"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "list_custom_traits",
      description: "List all custom trait definitions for a given object type. Returns trait labels, data types, and API keys needed for reading/writing traits.",
      inputSchema: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description: "Object type to list traits for",
            enum: ["accounts", "users", "notes", "tasks", "projects", "organizations"]
          }
        },
        required: ["model"]
      }
    },
    {
      name: "update_account_traits",
      description: "Update custom traits on a Vitally account. Traits are merged with existing values. Set a trait to null to remove it. Use list_custom_traits to discover available trait keys.",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          traits: {
            type: "object",
            description: "Key-value pairs of traits to set (e.g., { 'vitally.custom.myTrait': 'value' }). Set to null to remove."
          }
        },
        required: ["accountId", "traits"]
      }
    },
    {
      name: "get_account_nps",
      description: "Get NPS survey responses for a specific account, including scores and feedback from users",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          limit: {
            type: "number",
            description: "Maximum number of NPS responses to return (default: 10)"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "get_account_projects",
      description: "Get projects (e.g., onboarding, implementation) for a specific account, including status, dates, and traits",
      inputSchema: {
        type: "object",
        properties: {
          accountId: {
            type: "string",
            description: "Vitally account ID"
          },
          limit: {
            type: "number",
            description: "Maximum number of projects to return (default: 10)"
          }
        },
        required: ["accountId"]
      }
    },
    {
      name: "list_custom_objects",
      description: "List all custom object type definitions in Vitally (e.g. 'Contract', 'Subscription'). Returns the schema for each, including id, name, label, writeMode, and custom field definitions. Use this to discover what custom objects exist before fetching instances.",
      inputSchema: {
        type: "object",
        properties: {
          cursor: {
            type: "string",
            description: "Pagination cursor returned from a previous call to get the next page"
          }
        }
      }
    },
    {
      name: "get_custom_object",
      description: "Get the schema/definition for a single custom object type, including all its custom field definitions and their trait paths.",
      inputSchema: {
        type: "object",
        properties: {
          customObjectId: {
            type: "string",
            description: "Vitally custom object ID"
          }
        },
        required: ["customObjectId"]
      }
    },
    {
      name: "list_custom_object_instances",
      description: "List instances of a specific custom object type. Each instance represents a real record (e.g. a specific contract or subscription). Returns name, traits, and associated customer/organization.",
      inputSchema: {
        type: "object",
        properties: {
          customObjectId: {
            type: "string",
            description: "Vitally custom object ID (from list_custom_objects)"
          },
          limit: {
            type: "number",
            description: "Maximum number of instances to return (default: 10)"
          },
          cursor: {
            type: "string",
            description: "Pagination cursor returned from a previous call to get the next page"
          },
          includeArchived: {
            type: "boolean",
            description: "If true, include archived (deleted) instances (default: false)"
          }
        },
        required: ["customObjectId"]
      }
    },
    {
      name: "search_custom_object_instances",
      description: "Search for instances of a custom object type. Provide exactly one of: instanceId, customerId, organizationId, externalId, customFieldId, or customFieldValue.",
      inputSchema: {
        type: "object",
        properties: {
          customObjectId: {
            type: "string",
            description: "Vitally custom object ID (from list_custom_objects)"
          },
          instanceId: {
            type: "string",
            description: "Find a specific instance by its Vitally-assigned ID"
          },
          customerId: {
            type: "string",
            description: "Find all instances associated with this Vitally account/customer ID"
          },
          organizationId: {
            type: "string",
            description: "Find all instances associated with this Vitally organization ID"
          },
          externalId: {
            type: "string",
            description: "Find the instance with this external system ID"
          },
          customFieldId: {
            type: "string",
            description: "Find instances that have this custom field ID set (independent search — do not combine with customFieldValue)"
          },
          customFieldValue: {
            type: "string",
            description: "Find instances with this custom field value (independent search — do not combine with customFieldId)"
          }
        },
        required: ["customObjectId"]
      }
    }
  ];

  return { tools: allTools };
});

/**
 * Predefined list of all available tools for use in search_tools
 */
const AVAILABLE_TOOLS = [
  {
    name: "search_tools",
    description: "Vitally tool to search for available tools by keyword",
    requiredParams: ["keyword"]
  },
  {
    name: "search_users",
    description: "Vitally tool to search for users by email or external ID",
    requiredParams: []
  },
  {
    name: "search_accounts",
    description: "Vitally tool to search for accounts by multiple criteria",
    requiredParams: []
  },
  {
    name: "get_account_health",
    description: "Vitally tool to get health scores for an account",
    requiredParams: ["accountId"]
  },
  {
    name: "find_account_by_name",
    description: "Vitally tool to find an account by name (partial match supported)",
    requiredParams: ["name"]
  },
  {
    name: "get_account_conversations",
    description: "Vitally tool to get recent conversations for an account",
    requiredParams: ["accountId"]
  },
  {
    name: "get_account_tasks",
    description: "Vitally tool to get tasks for an account",
    requiredParams: ["accountId"]
  },
  {
    name: "get_account_notes",
    description: "Vitally tool to retrieve notes for an account",
    requiredParams: ["accountId"]
  },
  {
    name: "get_note_by_id",
    description: "Vitally tool to retrieve full content of a specific note by ID",
    requiredParams: ["noteId"]
  },
  {
    name: "create_account_note",
    description: "Vitally tool to create a new note for an account",
    requiredParams: ["accountId", "content"]
  },
  {
    name: "refresh_accounts",
    description: "Vitally tool to refresh the list of accounts",
    requiredParams: []
  },
  {
    name: "get_account_details",
    description: "Get full account details including traits, success metrics, health score, MRR, NPS score, timestamps, CSM assignment, and segments",
    requiredParams: ["accountId"]
  },
  {
    name: "list_custom_traits",
    description: "List all custom trait definitions for a given object type (accounts, users, notes, tasks, projects, organizations)",
    requiredParams: ["model"]
  },
  {
    name: "update_account_traits",
    description: "Update custom traits on a Vitally account. Traits are merged with existing values.",
    requiredParams: ["accountId", "traits"]
  },
  {
    name: "get_account_nps",
    description: "Get NPS survey responses for a specific account, including scores and feedback",
    requiredParams: ["accountId"]
  },
  {
    name: "get_account_projects",
    description: "Get projects (e.g., onboarding, implementation) for a specific account",
    requiredParams: ["accountId"]
  },
  {
    name: "list_custom_objects",
    description: "List all custom object type definitions in Vitally (schemas, field definitions)",
    requiredParams: []
  },
  {
    name: "get_custom_object",
    description: "Get the schema/definition for a single custom object type including its custom field definitions",
    requiredParams: ["customObjectId"]
  },
  {
    name: "list_custom_object_instances",
    description: "List instances of a specific custom object type",
    requiredParams: ["customObjectId"]
  },
  {
    name: "search_custom_object_instances",
    description: "Search for custom object instances by customer, organization, external ID, or trait value",
    requiredParams: ["customObjectId"]
  }
];

/**
 * Handler for tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "search_tools": {
      const keyword = (request.params.arguments?.keyword as string || "").toLowerCase();
      if (!keyword) {
        throw new Error("Keyword is required");
      }

      // Filter tools by keyword from our predefined list
      const matchingTools = AVAILABLE_TOOLS.filter(tool =>
        tool.name.toLowerCase().includes(keyword) ||
        tool.description.toLowerCase().includes(keyword)
      );

      if (matchingTools.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No tools found matching "${keyword}"`
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            count: matchingTools.length,
            tools: matchingTools
          }, null, 2)
        }]
      };
    }

    case "search_users": {
      const email = request.params.arguments?.email as string | undefined;
      const externalId = request.params.arguments?.externalId as string | undefined;
      const emailSubdomain = request.params.arguments?.emailSubdomain as string | undefined;

      if (!email && !externalId && !emailSubdomain) {
        throw new Error("At least one search parameter (email, externalId, or emailSubdomain) is required");
      }

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (email) queryParams.append('email', email);
      if (externalId) queryParams.append('externalId', externalId);
      if (emailSubdomain) queryParams.append('emailSubdomain', emailSubdomain);

      try {
        const users = await callVitallyAPI<VitallyPaginatedResponse<VitallyUser>>(`/resources/users/search?${queryParams}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(users, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`User search failed: ${error}`);
      }
    }

    case "search_accounts": {
      const name = request.params.arguments?.name as string | undefined;
      const externalId = request.params.arguments?.externalId as string | undefined;
      const limit = request.params.arguments?.limit as number || 10;
      const maxPages = request.params.arguments?.maxPages as number || 1;

      if (!name && !externalId) {
        throw new Error("At least one search parameter (name or externalId) is required");
      }

      try {
        // Fetch accounts up to maxPages; use cache if fresh and maxPages=1
        if (isCacheStale() || maxPages > 1) {
          const accounts = await fetchAllPages<VitallyAccount>(
            '/resources/accounts',
            {},
            maxPages
          );
          setAccountsCache(accounts);
        }

        // Filter accounts by criteria
        let filteredAccounts = [...accountsCache];

        if (name) {
          const nameToMatch = name.toLowerCase();
          filteredAccounts = filteredAccounts.filter(account =>
            account.name.toLowerCase().includes(nameToMatch)
          );
        }

        if (externalId) {
          filteredAccounts = filteredAccounts.filter(account =>
            account.externalId === externalId
          );
        }

        const limitedAccounts = filteredAccounts.slice(0, limit);
        const searchedCount = accountsCache.length;

        if (limitedAccounts.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No accounts found matching the criteria (searched ${searchedCount} accounts)`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: limitedAccounts.length,
              totalMatches: filteredAccounts.length,
              searchedAccounts: searchedCount,
              truncated: searchedCount === maxPages * 100,
              accounts: limitedAccounts.map(account => ({
                id: account.id,
                name: account.name,
                externalId: account.externalId,
                healthScore: account.healthScore,
                mrr: account.mrr,
                npsScore: account.npsScore,
                usersCount: account.usersCount,
                lastSeenTimestamp: account.lastSeenTimestamp,
                uri: `vitally://account/${account.id}`
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Account search failed: ${error}`);
      }
    }

    case "get_account_health": {
      const accountId = request.params.arguments?.accountId as string;
      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const healthScores = await callVitallyAPI<any>(`/resources/accounts/${accountId}/healthScores`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(healthScores, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get health scores: ${error}`);
      }
    }

    case "find_account_by_name": {
      const name = request.params.arguments?.name as string;
      const maxPages = request.params.arguments?.maxPages as number || 1;

      if (!name) {
        throw new Error("Account name is required");
      }

      try {
        if (isCacheStale() || maxPages > 1) {
          const accounts = await fetchAllPages<VitallyAccount>(
            '/resources/accounts',
            {},
            maxPages
          );
          setAccountsCache(accounts);
        }

        const nameToMatch = name.toLowerCase();
        const matchingAccounts = accountsCache.filter(account =>
          account.name.toLowerCase().includes(nameToMatch)
        );
        const searchedCount = accountsCache.length;

        if (matchingAccounts.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No accounts found matching "${name}" (searched ${searchedCount} accounts)`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: matchingAccounts.length,
              searchedAccounts: searchedCount,
              truncated: searchedCount === maxPages * 100,
              accounts: matchingAccounts.map(account => ({
                id: account.id,
                name: account.name,
                externalId: account.externalId,
                healthScore: account.healthScore,
                mrr: account.mrr,
                npsScore: account.npsScore,
                usersCount: account.usersCount,
                lastSeenTimestamp: account.lastSeenTimestamp,
                uri: `vitally://account/${account.id}`
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to find accounts by name: ${error}`);
      }
    }

    case "get_account_conversations": {
      const accountId = request.params.arguments?.accountId as string;
      const limit = request.params.arguments?.limit as number || 10;
      const cursor = request.params.arguments?.cursor as string | undefined;

      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());
        if (cursor) queryParams.append('from', cursor);

        const conversations = await callVitallyAPI<VitallyPaginatedResponse<VitallyConversation>>(
          `/resources/accounts/${accountId}/conversations?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: conversations.results.length,
              nextCursor: conversations.next ?? null,
              conversations: conversations.results.map(conv => ({
                id: conv.id,
                subject: conv.subject,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get account conversations: ${error}`);
      }
    }

    case "get_account_tasks": {
      const accountId = request.params.arguments?.accountId as string;
      const status = request.params.arguments?.status as string | undefined;
      const limit = request.params.arguments?.limit as number || 10;
      const cursor = request.params.arguments?.cursor as string | undefined;

      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());
        if (status) queryParams.append('status', status);
        if (cursor) queryParams.append('from', cursor);

        const tasks = await callVitallyAPI<VitallyPaginatedResponse<VitallyTask>>(
          `/resources/accounts/${accountId}/tasks?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: tasks.results.length,
              nextCursor: tasks.next ?? null,
              tasks: tasks.results.map(task => ({
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                dueDate: task.dueDate,
                createdAt: task.createdAt,
                updatedAt: task.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get account tasks: ${error}`);
      }
    }

    case "get_account_notes": {
      const accountId = request.params.arguments?.accountId as string;
      const limit = request.params.arguments?.limit as number || 10;
      const cursor = request.params.arguments?.cursor as string | undefined;

      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());
        if (cursor) queryParams.append('from', cursor);

        const notes = await callVitallyAPI<VitallyPaginatedResponse<VitallyNote>>(
          `/resources/accounts/${accountId}/notes?${queryParams}`
        );

        const PREVIEW_LENGTH = 300;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: notes.results.length,
              nextCursor: notes.next ?? null,
              notes: notes.results.map(note => {
                const raw = note.content ?? '';
                const preview = raw.length > PREVIEW_LENGTH
                  ? raw.slice(0, PREVIEW_LENGTH) + '…'
                  : raw;
                return {
                  id: note.id,
                  contentPreview: preview,
                  truncated: raw.length > PREVIEW_LENGTH,
                  createdAt: note.createdAt,
                  updatedAt: note.updatedAt
                };
              })
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get account notes: ${error}`);
      }
    }

    case "get_note_by_id": {
      const noteId = request.params.arguments?.noteId as string;
      if (!noteId) {
        throw new Error("Note ID is required");
      }

      try {
        const note = await callVitallyAPI<VitallyNote>(`/resources/notes/${noteId}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(note, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get note by ID: ${error}`);
      }
    }

    case "create_account_note": {
      const accountId = request.params.arguments?.accountId as string;
      const content = request.params.arguments?.content as string;

      if (!accountId || !content) {
        throw new Error("Account ID and content are required");
      }

      try {
        const note = await callVitallyAPI<VitallyNote>(
          `/resources/accounts/${accountId}/notes`,
          'POST',
          { content }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              note: {
                id: note.id,
                content: note.content,
                createdAt: note.createdAt
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to create note: ${error}`);
      }
    }

    case "refresh_accounts": {
      try {
        const status = request.params.arguments?.status as string || 'active';
        const fetchAll = request.params.arguments?.fetchAll !== false; // default true

        if (fetchAll) {
          const accounts = await fetchAllPages<VitallyAccount>(
            '/resources/accounts',
            { status }
          );
          setAccountsCache(accounts);
        } else {
          const response = await callVitallyAPI<VitallyPaginatedResponse<VitallyAccount>>(
            `/resources/accounts?limit=100&status=${status}`
          );
          setAccountsCache(response.results || []);
        }

        // Return a slim summary — use get_account_details for per-account depth
        const summary = {
          count: accountsCache.length,
          fetchedAllPages: fetchAll,
          accounts: accountsCache.map(account => ({
            id: account.id,
            name: account.name,
            externalId: account.externalId,
            healthScore: account.healthScore,
            mrr: account.mrr,
            npsScore: account.npsScore,
            usersCount: account.usersCount,
            churnedAt: account.churnedAt,
            lastSeenTimestamp: account.lastSeenTimestamp,
            nextRenewalDate: account.nextRenewalDate,
            csmId: account.csmId
          }))
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(summary, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to refresh accounts: ${error}`);
      }
    }

    case "get_account_details": {
      const accountId = request.params.arguments?.accountId as string;
      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const account = await callVitallyAPI<VitallyAccount>(`/resources/accounts/${accountId}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              id: account.id,
              name: account.name,
              externalId: account.externalId,
              organizationId: account.organizationId,
              healthScore: account.healthScore,
              mrr: account.mrr,
              npsScore: account.npsScore,
              npsDetractorCount: account.npsDetractorCount,
              npsPassiveCount: account.npsPassiveCount,
              npsPromoterCount: account.npsPromoterCount,
              usersCount: account.usersCount,
              csmId: account.csmId,
              accountExecutiveId: account.accountExecutiveId,
              accountOwnerId: account.accountOwnerId,
              segments: account.segments,
              keyRoles: account.keyRoles,
              traits: account.traits,
              churnedAt: account.churnedAt,
              firstSeenTimestamp: account.firstSeenTimestamp,
              lastSeenTimestamp: account.lastSeenTimestamp,
              lastInboundMessageTimestamp: account.lastInboundMessageTimestamp,
              lastOutboundMessageTimestamp: account.lastOutboundMessageTimestamp,
              nextRenewalDate: account.nextRenewalDate,
              trialEndDate: account.trialEndDate,
              createdAt: account.createdAt,
              updatedAt: account.updatedAt
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get account details: ${error}`);
      }
    }

    case "list_custom_traits": {
      const model = request.params.arguments?.model as string;
      if (!model) {
        throw new Error("Model type is required (e.g., accounts, users, notes, tasks, projects, organizations)");
      }

      try {
        const traits = await callVitallyAPI<VitallyCustomField[]>(`/resources/customFields?model=${model}`);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              model,
              count: Array.isArray(traits) ? traits.length : 0,
              traits: Array.isArray(traits) ? traits.map(t => ({
                label: t.label,
                type: t.type,
                key: t.path,
                createdAt: t.createdAt
              })) : []
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to list custom traits: ${error}`);
      }
    }

    case "update_account_traits": {
      const accountId = request.params.arguments?.accountId as string;
      const traits = request.params.arguments?.traits as Record<string, any>;

      if (!accountId || !traits) {
        throw new Error("Account ID and traits are required");
      }

      try {
        const updated = await callVitallyAPI<VitallyAccount>(
          `/resources/accounts/${accountId}`,
          'PUT',
          { traits }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              account: {
                id: updated.id,
                name: updated.name,
                traits: updated.traits
              }
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to update account traits: ${error}`);
      }
    }

    case "get_account_nps": {
      const accountId = request.params.arguments?.accountId as string;
      const limit = request.params.arguments?.limit as number || 10;

      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());

        const npsResponses = await callVitallyAPI<VitallyPaginatedResponse<VitallyNpsResponse>>(
          `/resources/accounts/${accountId}/npsResponses?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: npsResponses.results.length,
              responses: npsResponses.results.map(r => ({
                id: r.id,
                userId: r.userId,
                score: r.score,
                feedback: r.feedback,
                respondedAt: r.respondedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get NPS responses: ${error}`);
      }
    }

    case "get_account_projects": {
      const accountId = request.params.arguments?.accountId as string;
      const limit = request.params.arguments?.limit as number || 10;

      if (!accountId) {
        throw new Error("Account ID is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());

        const projects = await callVitallyAPI<VitallyPaginatedResponse<VitallyProject>>(
          `/resources/accounts/${accountId}/projects?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: projects.results.length,
              projects: projects.results.map(p => ({
                id: p.id,
                name: p.name,
                durationInDays: p.durationInDays,
                targetStartDate: p.targetStartDate,
                actualStartDate: p.actualStartDate,
                actualCompletionDate: p.actualCompletionDate,
                projectStatusId: p.projectStatusId,
                projectCategoryId: p.projectCategoryId,
                traits: p.traits,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get account projects: ${error}`);
      }
    }

    case "list_custom_objects": {
      const cursor = request.params.arguments?.cursor as string | undefined;

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('limit', '100');
        if (cursor) queryParams.set('from', cursor);

        const response = await callVitallyAPI<VitallyPaginatedResponse<VitallyCustomObject>>(
          `/resources/customObjects?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: response.results.length,
              nextCursor: response.next ?? null,
              customObjects: response.results.map(obj => ({
                id: obj.id,
                name: obj.name,
                label: obj.label,
                writeMode: obj.writeMode,
                syncActive: obj.syncActive,
                customFields: obj.customFields?.map(f => ({
                  label: f.label,
                  type: f.type,
                  path: f.path
                })) ?? [],
                createdAt: obj.createdAt,
                updatedAt: obj.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to list custom objects: ${error}`);
      }
    }

    case "get_custom_object": {
      const customObjectId = request.params.arguments?.customObjectId as string;
      if (!customObjectId) {
        throw new Error("customObjectId is required");
      }

      try {
        const obj = await callVitallyAPI<VitallyCustomObject>(
          `/resources/customObjects/${customObjectId}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              id: obj.id,
              name: obj.name,
              label: obj.label,
              writeMode: obj.writeMode,
              syncActive: obj.syncActive,
              customFields: obj.customFields?.map(f => ({
                label: f.label,
                type: f.type,
                path: f.path
              })) ?? [],
              createdAt: obj.createdAt,
              updatedAt: obj.updatedAt
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to get custom object: ${error}`);
      }
    }

    case "list_custom_object_instances": {
      const customObjectId = request.params.arguments?.customObjectId as string;
      const limit = request.params.arguments?.limit as number || 10;
      const cursor = request.params.arguments?.cursor as string | undefined;
      const includeArchived = request.params.arguments?.includeArchived as boolean || false;

      if (!customObjectId) {
        throw new Error("customObjectId is required");
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('limit', limit.toString());
        if (cursor) queryParams.set('from', cursor);
        if (includeArchived) queryParams.set('archived', 'true');

        const response = await callVitallyAPI<VitallyPaginatedResponse<VitallyCustomObjectInstance>>(
          `/resources/customObjects/${customObjectId}/instances?${queryParams}`
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: response.results.length,
              nextCursor: response.next ?? null,
              instances: response.results.map(inst => ({
                id: inst.id,
                name: inst.name,
                externalId: inst.externalId,
                description: extractDescription(inst.descriptionBody),
                customers: slimCustomers(inst),
                organizationId: inst.organizationId,
                organization: inst.organization ?? null,
                ownedByVitallyUserId: inst.ownedByVitallyUserId,
                traits: inst.traits ?? {},
                archivedAt: inst.archivedAt ?? null,
                createdAt: inst.createdAt,
                updatedAt: inst.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to list custom object instances: ${error}`);
      }
    }

    case "search_custom_object_instances": {
      const customObjectId = request.params.arguments?.customObjectId as string;
      const instanceId = request.params.arguments?.instanceId as string | undefined;
      const customerId = request.params.arguments?.customerId as string | undefined;
      const organizationId = request.params.arguments?.organizationId as string | undefined;
      const externalId = request.params.arguments?.externalId as string | undefined;
      const customFieldId = request.params.arguments?.customFieldId as string | undefined;
      const customFieldValue = request.params.arguments?.customFieldValue as string | undefined;

      if (!customObjectId) {
        throw new Error("customObjectId is required");
      }

      if (customFieldId && customFieldValue) {
        throw new Error(
          "customFieldId and customFieldValue are independent search options — provide only one. " +
          "Use customFieldId to search by field definition, or customFieldValue to search by value."
        );
      }

      const searchParams = [instanceId, customerId, organizationId, externalId, customFieldId, customFieldValue]
        .filter(Boolean);

      if (searchParams.length === 0) {
        throw new Error(
          "Exactly one search parameter is required: instanceId, customerId, organizationId, " +
          "externalId, customFieldId, or customFieldValue"
        );
      }
      if (searchParams.length > 1) {
        throw new Error(
          "Provide exactly one search parameter — the API accepts only one at a time"
        );
      }

      try {
        const queryParams = new URLSearchParams();
        if (instanceId) queryParams.set('id', instanceId);
        if (customerId) queryParams.set('customerId', customerId);
        if (organizationId) queryParams.set('organizationId', organizationId);
        if (externalId) queryParams.set('externalId', externalId);
        if (customFieldId) queryParams.set('customFieldId', customFieldId);
        if (customFieldValue) queryParams.set('customFieldValue', customFieldValue);

        const raw = await callVitallyAPI<unknown>(
          `/resources/customObjects/${customObjectId}/instances/search?${queryParams}`
        );

        // The search endpoint response shape is inconsistent with the docs —
        // handle a bare array, { results: [] }, or an empty/unexpected response.
        const instances: VitallyCustomObjectInstance[] = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as any)?.results)
            ? (raw as any).results
            : [];

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: instances.length,
              instances: instances.map(inst => ({
                id: inst.id,
                name: inst.name,
                externalId: inst.externalId,
                description: extractDescription(inst.descriptionBody),
                customers: slimCustomers(inst),
                organizationId: inst.organizationId,
                organization: inst.organization ?? null,
                ownedByVitallyUserId: inst.ownedByVitallyUserId,
                traits: inst.traits ?? {},
                archivedAt: inst.archivedAt ?? null,
                createdAt: inst.createdAt,
                updatedAt: inst.updatedAt
              }))
            }, null, 2)
          }]
        };
      } catch (error) {
        throw new Error(`Failed to search custom object instances: ${error}`);
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
