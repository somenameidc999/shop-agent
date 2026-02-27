#!/usr/bin/env node
/**
 * Custom REST API MCP Server
 *
 * Provides tools for making HTTP requests to a configurable base URL.
 * Reads CUSTOM_API_BASE_URL and CUSTOM_API_KEY from environment.
 */

import { z } from "zod";
import { debugLog } from "../../../utils/debugLog.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const BASE_URL = process.env.CUSTOM_API_BASE_URL ?? "";
const API_KEY = process.env.CUSTOM_API_KEY ?? "";

if (!BASE_URL) {
  console.error("CUSTOM_API_BASE_URL is required");
  process.exit(1);
}

const server = new McpServer({
  name: "custom-api",
  version: "1.0.0",
});

function toJsonObject(text: string): unknown {
  let parsed: unknown | undefined;
  try {
    // Validate it's valid JSON, then pass it through
    parsed = JSON.parse(text);
  } catch {
    // Ignore
  }

  return parsed ?? text;
}

async function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  queryParams?: Record<string, string>,
): Promise<string> {
  const url = new URL(path, BASE_URL);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const responseText = await response.text();
  if (!response.ok) {
    return JSON.stringify({
      error: true,
      status: response.status,
      statusText: response.statusText,
      body: responseText,
    });
  }

  try {
    return JSON.stringify(JSON.parse(responseText), null, 2);
  } catch {
    return responseText;
  }
}

server.registerTool(
  "api_get",
  {
    description: "Make a GET request to the custom API",
    inputSchema: {
      path: z.string().describe("API path (e.g., /users, /products/123)"),
      query_params: z
        .record(z.string(), z.string())
        .optional()
        .describe("Query parameters as key-value pairs"),
    },
  },
  async ({ path, query_params }) => ({
    content: [{ type: "text" as const, text: await makeRequest("GET", path, undefined, query_params) }],
  }),
);

server.registerTool(
  "api_post",
  {
    description: "Make a POST request to the custom API",
    inputSchema: {
      path: z.string().describe("API path"),
      body: z.string().describe("Request body as a JSON string. MUST BE A VALID JSON OBJECT!"),
    },
  },
  async ({ path, body }) => {
    const jsonBody = toJsonObject(body);
    return {
      content: [{ type: "text" as const, text: await makeRequest("POST", path, jsonBody) }],
    };
  },
);

server.registerTool(
  "api_put",
  {
    description: "Make a PUT request to the custom API",
    inputSchema: {
      path: z.string().describe("API path"),
      body: z.string().describe("Request body as a JSON string. MUST BE A VALID JSON OBJECT!"),
    },
  },
  async ({ path, body }) => {
    const jsonBody = toJsonObject(body);
    return {
      content: [{ type: "text" as const, text: await makeRequest("PUT", path, jsonBody) }],
    };
  },
);

server.registerTool(
  "api_patch",
  {
    description: "Make a PATCH request to the custom API",
    inputSchema: {
      path: z.string().describe("API path"),
      body: z.string().describe("Request body as a JSON string. MUST BE A VALID JSON OBJECT!"),
    },
  },
  async ({ path, body }) => {
    const jsonBody = toJsonObject(body);
    return {
      content: [{ type: "text" as const, text: await makeRequest("PATCH", path, jsonBody) }],
    };
  }
);

// server.registerTool(
//   "api_delete",
//   {
//     description: "Make a DELETE request to the custom API",
//     inputSchema: {
//       path: z.string().describe("API path"),
//     },
//   },
//   async ({ path }) => ({
//     content: [{ type: "text" as const, text: await makeRequest("DELETE", path) }],
//   }),
// );

async function main() {
  debugLog(`[custom-api] MCP server starting — base URL: ${BASE_URL}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog(`[custom-api] MCP server running — base URL: ${BASE_URL}`);
}

main().catch((err) => {
  debugLog("[custom-api] Fatal error:", err);
  process.exit(1);
});
