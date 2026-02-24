#!/usr/bin/env node
/**
 * Custom REST API MCP Server
 *
 * Provides tools for making HTTP requests to a configurable base URL.
 * Reads CUSTOM_API_BASE_URL and CUSTOM_API_KEY from environment.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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

server.tool(
  "api_get",
  "Make a GET request to the custom API",
  {
    path: z.string().describe("API path (e.g., /users, /products/123)"),
    query_params: z
      .record(z.string(), z.string())
      .optional()
      .describe("Query parameters as key-value pairs"),
  },
  async ({ path, query_params }) => ({
    content: [{ type: "text" as const, text: await makeRequest("GET", path, undefined, query_params) }],
  }),
);

server.tool(
  "api_post",
  "Make a POST request to the custom API",
  {
    path: z.string().describe("API path"),
    body: z.record(z.string(), z.unknown()).describe("Request body as JSON object"),
  },
  async ({ path, body }) => ({
    content: [{ type: "text" as const, text: await makeRequest("POST", path, body) }],
  }),
);

server.tool(
  "api_put",
  "Make a PUT request to the custom API",
  {
    path: z.string().describe("API path"),
    body: z.record(z.string(), z.unknown()).describe("Request body as JSON object"),
  },
  async ({ path, body }) => ({
    content: [{ type: "text" as const, text: await makeRequest("PUT", path, body) }],
  }),
);

server.tool(
  "api_patch",
  "Make a PATCH request to the custom API",
  {
    path: z.string().describe("API path"),
    body: z.record(z.string(), z.unknown()).describe("Request body as JSON object"),
  },
  async ({ path, body }) => ({
    content: [{ type: "text" as const, text: await makeRequest("PATCH", path, body) }],
  }),
);

server.tool(
  "api_delete",
  "Make a DELETE request to the custom API",
  {
    path: z.string().describe("API path"),
  },
  async ({ path }) => ({
    content: [{ type: "text" as const, text: await makeRequest("DELETE", path) }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[custom-api] MCP server running — base URL: ${BASE_URL}`);
}

main().catch((err) => {
  console.error("[custom-api] Fatal error:", err);
  process.exit(1);
});
