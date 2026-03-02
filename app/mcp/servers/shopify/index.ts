#!/usr/bin/env node
/**
 * Shopify Admin GraphQL API — MCP Server
 *
 * Tools:
 *   shopify_find          — Search the API schema for queries, mutations, types
 *   shopify_get_type      — Get full definition of a named type
 *   shopify_get_operation — Get full signature of a query or mutation
 *   shopify_query         — Build & execute a query from resource/fields/filter (recommended)
 *   shopify_graphql       — Execute raw GraphQL with schema validation
 *   shopify_execute       — Run multi-step JS code that calls the GraphQL API
 *
 * Credentials are resolved from the `Shop` table in the Prisma database.
 * The shop domain is received as a CLI argument (`--shop <domain>`).
 * The API version comes from the SHOPIFY_API_VERSION env var (default 2025-10).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { runInSandbox } from "./sandbox.js";
import {
  type CompactSchema,
  buildQuery,
  transformSchema,
  unwrapTypeName,
  validateFieldsAgainstSchema,
  formatValidationErrors,
} from "./queryBuilder.js";

// ---------------------------------------------------------------------------
// CLI args & env
// ---------------------------------------------------------------------------

function parseShopArg(): string {
  const idx = process.argv.indexOf("--shop");
  if (idx === -1 || idx + 1 >= process.argv.length) {
    console.error("[shopify] Missing required --shop argument");
    process.exit(1);
  }
  return process.argv[idx + 1]!;
}

const SHOP = parseShopArg();
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

// ---------------------------------------------------------------------------
// Database — access token from Shop table
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function getAccessToken(): Promise<string> {
  const record = await prisma.shop.findUnique({
    where: { shop: SHOP },
    select: { accessToken: true },
  });
  if (!record?.accessToken) {
    throw new Error(`No Shop record found for "${SHOP}"`);
  }
  return record.accessToken;
}

// ---------------------------------------------------------------------------
// GraphQL client factory
// ---------------------------------------------------------------------------

function createGraphQLClient(accessToken: string) {
  const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

  async function query(
    graphql: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: graphql, variables }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Shopify GraphQL ${res.status} ${res.statusText}: ${body}`,
      );
    }

    return (await res.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
      extensions?: unknown;
    };
  }

  return Object.freeze({ query });
}

// ---------------------------------------------------------------------------
// Live introspection — cached in memory
// ---------------------------------------------------------------------------

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: false) {
          name
          description
          args {
            name
            description
            type { ...TypeRef }
          }
          type { ...TypeRef }
        }
        inputFields {
          name
          description
          type { ...TypeRef }
        }
        enumValues(includeDeprecated: false) {
          name
        }
      }
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
`;

let cachedSchema: CompactSchema | null = null;

async function getSchema(): Promise<CompactSchema> {
  if (cachedSchema) return cachedSchema;

  console.error("[shopify] Fetching introspection schema…");
  const token = await getAccessToken();
  const client = createGraphQLClient(token);
  const introspection = (await client.query(
    INTROSPECTION_QUERY,
  )) as { data?: unknown; errors?: Array<{ message: string }> };

  if (introspection.errors?.length) {
    const msgs = introspection.errors.map((e) => e.message).join("; ");
    throw new Error(`Introspection failed: ${msgs}`);
  }
  cachedSchema = Object.freeze(transformSchema(introspection, API_VERSION)) as CompactSchema;
  console.error(
    `[shopify] Schema cached — ${cachedSchema.queries.length} queries, ` +
      `${cachedSchema.mutations.length} mutations, ` +
      `${cachedSchema.types.length} types`,
  );
  return cachedSchema;
}

// buildQuery, validateFieldsAgainstSchema, formatValidationErrors,
// unwrapTypeName, and transformSchema are imported from ./queryBuilder.js

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "shopify",
  version: "1.0.0",
});

// Tool 1: shopify_find
server.registerTool(
  "shopify_find",
  {
    description:
      "Search the Shopify Admin GraphQL API schema for queries, mutations, " +
      "and types whose names match a search term (case-insensitive substring match). " +
      "Use this first to discover what operations and types are available. " +
      "Then use shopify_get_operation or shopify_get_type to get full details.",
    inputSchema: {
      searchTerm: z
        .string()
        .describe(
          "The term to search for in query, mutation, and type names (e.g. 'order', 'product', 'draftOrder').",
        ),
    },
  },
  async ({ searchTerm }) => {
    try {
      console.error(`[shopify] find — searching for "${searchTerm}"`);
      const schema = await getSchema();
      const term = searchTerm.toLowerCase();

      const queries = schema.queries
        .filter((q) => q.name.toLowerCase().includes(term))
        .map((q) => ({ name: q.name, description: q.description }));
      const mutations = schema.mutations
        .filter((m) => m.name.toLowerCase().includes(term))
        .map((m) => ({ name: m.name, description: m.description }));
      const types = schema.types
        .filter((t) => t.name.toLowerCase().includes(term))
        .map((t) => ({ name: t.name, kind: t.kind, description: t.description }));

      const result = { apiVersion: schema.apiVersion, queries, mutations, types };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Schema fetch failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Tool 2: shopify_get_type
server.registerTool(
  "shopify_get_type",
  {
    description:
      "Get the full definition of a Shopify Admin GraphQL type by exact name. " +
      "Returns fields (for objects/interfaces), inputFields (for input objects), " +
      "or enumValues (for enums) with their types and descriptions. " +
      "Use this to discover the exact shape of input types before writing mutations.",
    inputSchema: {
      typeName: z
        .string()
        .describe(
          "The exact type name (e.g. 'DraftOrderInput', 'OrderInput', 'Product').",
        ),
    },
  },
  async ({ typeName }) => {
    try {
      console.error(`[shopify] get_type — looking up "${typeName}"`);
      const schema = await getSchema();
      const t = schema.types.find((t) => t.name === typeName);
      if (!t) {
        const suggestions = schema.types
          .filter((t) => t.name.toLowerCase().includes(typeName.toLowerCase()))
          .slice(0, 10)
          .map((t) => t.name);
        return {
          content: [{
            type: "text" as const,
            text: `Type "${typeName}" not found.` +
              (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
          }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(t, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Schema fetch failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Tool 3: shopify_get_operation
server.registerTool(
  "shopify_get_operation",
  {
    description:
      "Get the full signature of a Shopify Admin GraphQL query or mutation by exact name. " +
      "Returns the operation's arguments (with types) and return type. " +
      "Use this after shopify_find to get the exact argument structure before executing.",
    inputSchema: {
      operationName: z
        .string()
        .describe("The exact operation name (e.g. 'draftOrderCreate', 'products', 'order')."),
      operationType: z
        .enum(["query", "mutation"])
        .describe("Whether this is a 'query' or 'mutation'."),
    },
  },
  async ({ operationName, operationType }) => {
    try {
      console.error(`[shopify] get_operation — looking up ${operationType} "${operationName}"`);
      const schema = await getSchema();
      const ops = operationType === "query" ? schema.queries : schema.mutations;
      const op = ops.find((o) => o.name === operationName);
      if (!op) {
        const suggestions = ops
          .filter((o) => o.name.toLowerCase().includes(operationName.toLowerCase()))
          .slice(0, 10)
          .map((o) => o.name);
        return {
          content: [{
            type: "text" as const,
            text: `${operationType} "${operationName}" not found.` +
              (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : ""),
          }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(op, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Schema fetch failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// Tool 4: shopify_query (NEW — query builder)
server.registerTool(
  "shopify_query",
  {
    description:
      "Query Shopify data WITHOUT writing GraphQL. Specify a resource name, fields, " +
      "and optional filter — the server builds and executes the correct GraphQL " +
      "automatically, handling Relay connection patterns (edges/node).\n\n" +
      "This is the PREFERRED tool for reading Shopify data. Use shopify_graphql " +
      "only for mutations or complex queries this tool cannot express.\n\n" +
      "Examples:\n" +
      '  resource: "products", fields: ["id", "title", "status", "totalInventory"], limit: 5\n' +
      '  resource: "orders", fields: ["id", "name", "totalPriceSet.shopMoney.amount"], filter: "fulfillment_status:shipped"\n' +
      '  resource: "customers", fields: ["id", "firstName", "lastName", "numberOfOrders"], limit: 20\n\n' +
      "Date filters must use ISO 8601 format: created_at:>=2026-01-01T00:00:00Z\n" +
      "Do NOT use relative dates like '7 days ago' or 'last week'.",
    inputSchema: {
      resource: z
        .string()
        .describe(
          "The root query name (e.g. 'products', 'orders', 'customers', 'draftOrders', 'collections'). " +
          "Use shopify_find to discover available queries.",
        ),
      fields: z
        .array(z.string())
        .describe(
          "Fields to return on each item. Use dot notation for nested objects (e.g. 'totalPriceSet.shopMoney.amount'). " +
          "Connection fields (like 'images', 'variants') are automatically wrapped in edges/node.",
        ),
      filter: z
        .string()
        .optional()
        .describe(
          "Shopify search query string (e.g. 'status:active', 'fulfillment_status:shipped', " +
          "'created_at:>=2026-01-01T00:00:00Z'). Must use ISO 8601 dates.",
        ),
      limit: z
        .number()
        .optional()
        .describe("Max items to return (default 10, max 250)."),
      sortKey: z
        .string()
        .optional()
        .describe("Sort key enum value (e.g. 'CREATED_AT', 'UPDATED_AT', 'TITLE'). Use shopify_get_operation to find valid values."),
      reverse: z
        .boolean()
        .optional()
        .describe("Reverse sort order (default false)."),
    },
  },
  async ({ resource, fields, filter, limit, sortKey, reverse }) => {
    try {
      console.error(`[shopify] query — resource="${resource}", fields=[${fields.join(", ")}], filter="${filter ?? ""}"`);
      const schema = await getSchema();

      const { query, errors: buildErrors, warnings } = buildQuery(schema, resource, fields, {
        filter,
        limit: Math.min(limit ?? 10, 250),
        sortKey,
        reverse,
      });

      if (buildErrors.length > 0) {
        const msg = "QUERY BUILD FAILED:\n\n" + buildErrors.map((e) => `• ${e}`).join("\n");
        console.error(`[shopify] query — build errors:\n${msg}`);
        return {
          content: [{ type: "text" as const, text: msg }],
          isError: true,
        };
      }

      if (warnings.length > 0) {
        console.error(`[shopify] query — ${warnings.length} warning(s), proceeding with valid fields`);
      }

      console.error(`[shopify] query — built GraphQL:\n${query}`);
      const token = await getAccessToken();
      const client = createGraphQLClient(token);
      const result = await client.query(query) as Record<string, unknown>;

      if (result.errors) {
        console.error("[shopify] query — GraphQL errors:", JSON.stringify(result.errors, null, 2));
      }

      const parts: string[] = [];

      if (warnings.length > 0) {
        parts.push(
          "⚠ FIELD WARNINGS (some requested fields were invalid and dropped):\n\n" +
            warnings.map((w) => `• ${w}`).join("\n\n") +
            "\n\nThe query ran with the valid fields only. " +
            "Resubmit with corrected field names for complete results.\n\n---\n",
        );
      }

      parts.push(JSON.stringify(result, null, 2));

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
        isError: !!result.errors,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[shopify] query — error: ${msg}`);
      return {
        content: [{ type: "text" as const, text: `Query failed: ${msg}` }],
        isError: true,
      };
    }
  },
);

// Tool 5: shopify_graphql (with schema validation)
server.registerTool(
  "shopify_graphql",
  {
    description:
      "Execute a raw GraphQL query or mutation against the Shopify Admin API.\n\n" +
      "The query is validated against the schema BEFORE sending to Shopify. " +
      "If invalid field names are detected, the request is rejected with " +
      "suggestions for correct field names.\n\n" +
      "PREFER shopify_query for read operations — it handles Relay patterns " +
      "and field validation automatically. Use this tool for:\n" +
      "  - Mutations (create, update, delete)\n" +
      "  - Queries with variables\n" +
      "  - Complex nested queries shopify_query cannot express\n\n" +
      "IMPORTANT RULES:\n" +
      "  - Connections use Relay pattern: edges { node { ...fields } }\n" +
      "  - Dates must be ISO 8601: created_at:>=\"2026-01-01T00:00:00Z\"\n" +
      "  - Do NOT use relative dates ('7 days ago', 'last week', 'today')\n" +
      "  - Before mutations, use shopify_get_operation + shopify_get_type to look up args\n" +
      "  - Do NOT guess field names — the server will reject invalid fields with suggestions",
    inputSchema: {
      query: z
        .string()
        .describe("The GraphQL query or mutation string."),
      variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional variables object for the GraphQL operation."),
    },
  },
  async ({ query: queryStr, variables }) => {
    try {
      console.error(`[shopify] graphql — validating query (${queryStr.length} chars)`);

      const schema = await getSchema();
      const validationErrors = validateFieldsAgainstSchema(queryStr, schema);

      if (validationErrors.length > 0) {
        const msg = formatValidationErrors(validationErrors);
        console.error(`[shopify] graphql — rejected: ${validationErrors.length} field error(s)`);
        return {
          content: [{ type: "text" as const, text: msg }],
          isError: true,
        };
      }

      console.error(`[shopify] graphql — running query:\n${queryStr}`);
      const token = await getAccessToken();
      const client = createGraphQLClient(token);
      const result = await client.query(queryStr, variables) as Record<string, unknown>;

      if (result.errors) {
        console.error("[shopify] graphql — GraphQL errors:", JSON.stringify(result.errors, null, 2));
      }

      const text = JSON.stringify(result, null, 2);
      return {
        content: [{ type: "text" as const, text }],
        isError: !!result.errors,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[shopify] graphql — fatal error: ${msg}`);
      return {
        content: [{ type: "text" as const, text: `GraphQL request failed: ${msg}` }],
        isError: true,
      };
    }
  },
);

// Tool 6: shopify_execute
server.registerTool(
  "shopify_execute",
  {
    description:
      "Execute multi-step JavaScript code that calls the Shopify Admin GraphQL API " +
      "in a sandbox. Use this only when you need to chain multiple queries, paginate, " +
      "or process intermediate results. For single queries, prefer shopify_query.\n\n" +
      "Do NOT use import/require/fetch — they are not available. " +
      "A frozen `client` object is injected as a global with one method:\n" +
      "  - await client.query(graphql, variables?) → { data, errors }\n\n" +
      "The response includes both `data` and `errors` fields (errors are NOT thrown).\n\n" +
      "IMPORTANT: Before calling any mutation or unfamiliar query, you MUST first:\n" +
      "  1) Use shopify_find to discover the operation name\n" +
      "  2) Use shopify_get_operation to get the exact argument signature\n" +
      "  3) Use shopify_get_type to look up any input types referenced in the args\n" +
      "Do NOT guess field names, input types, or argument structures.\n\n" +
      "Write plain JS using only the client global. Use `return` to produce output.\n" +
      "Example:\n" +
      "const res = await client.query(`{ shop { name } }`);\n" +
      "return res.data.shop;",
    inputSchema: {
      code: z
        .string()
        .describe(
          "Plain JavaScript code (NO import/require). The `client` global is pre-injected with `client.query(graphql, variables?)`. Use `await` and `return`.",
        ),
    },
  },
  async ({ code }) => {
    try {
      console.error(`[shopify] execute — running code (${code.length} chars):\n${code}`);
      const token = await getAccessToken();
      const client = Object.freeze(createGraphQLClient(token));
      const { result, logs, error } = await runInSandbox(
        code,
        { client },
        30_000,
      );

      if (error) {
        console.error(`[shopify] execute — sandbox error: ${error}`);
      }

      if (result && typeof result === "object") {
        const obj = result as Record<string, unknown>;
        if (obj.errors) {
          console.error("[shopify] execute — GraphQL errors:", JSON.stringify(obj.errors, null, 2));
        }
      }

      const parts: string[] = [];
      if (logs.length > 0) {
        parts.push("=== Logs ===\n" + logs.join("\n"));
      }
      if (error) {
        parts.push("=== Error ===\n" + error);
      }
      if (result !== undefined) {
        parts.push(
          "=== Result ===\n" +
            (typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2)),
        );
      }

      return {
        content: [{ type: "text" as const, text: parts.join("\n\n") || "(no output)" }],
        isError: !!error,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[shopify] execute — fatal error: ${msg}`);
      return {
        content: [{ type: "text" as const, text: `Execution failed: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[shopify] MCP server running — shop: ${SHOP}, API: ${API_VERSION}`);
}

main().catch((err) => {
  console.error("[shopify] Fatal error:", err);
  process.exit(1);
});
