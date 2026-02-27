#!/usr/bin/env node
/**
 * Shopify Admin GraphQL API — MCP Server (Code Mode)
 *
 * Exposes exactly two tools that cover the entire Shopify Admin API surface:
 *
 *   shopify_search  — Explore the API schema via live GraphQL introspection
 *                     (cached in memory). Zero mutations, read-only discovery.
 *
 *   shopify_execute — Run authenticated GraphQL queries/mutations by writing
 *                     JavaScript that calls `client.query(graphql, variables?)`.
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

    const json = (await res.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
      extensions?: unknown;
    };

    if (json.errors?.length) {
      const messages = json.errors.map((e) => e.message).join("; ");
      throw new Error(`GraphQL errors: ${messages}`);
    }

    return json;
  }

  return Object.freeze({ query });
}

// ---------------------------------------------------------------------------
// Live introspection — cached in memory
// ---------------------------------------------------------------------------

interface CompactField {
  name: string;
  type: string;
  description: string;
}

interface CompactType {
  name: string;
  kind: string;
  description: string;
  fields?: CompactField[];
  enumValues?: string[];
  inputFields?: CompactField[];
}

interface CompactOperation {
  name: string;
  description: string;
  args: CompactField[];
  returnType: string;
}

interface CompactSchema {
  apiVersion: string;
  queries: CompactOperation[];
  mutations: CompactOperation[];
  types: CompactType[];
}

function formatTypeRef(typeRef: Record<string, unknown>): string {
  if (!typeRef) return "unknown";
  const kind = typeRef.kind as string;
  if (kind === "NON_NULL") {
    return `${formatTypeRef(typeRef.ofType as Record<string, unknown>)}!`;
  }
  if (kind === "LIST") {
    return `[${formatTypeRef(typeRef.ofType as Record<string, unknown>)}]`;
  }
  return (typeRef.name as string) ?? "unknown";
}

function transformSchema(
  introspection: Record<string, unknown>,
): CompactSchema {
  const schemaData = (
    introspection as {
      data?: { __schema?: Record<string, unknown> };
    }
  )?.data?.__schema;

  if (!schemaData) {
    throw new Error("Invalid introspection response — missing __schema");
  }

  const allTypes = (schemaData.types ?? []) as Array<Record<string, unknown>>;
  const queryTypeName = (
    schemaData.queryType as Record<string, unknown> | null
  )?.name as string | undefined;
  const mutationTypeName = (
    schemaData.mutationType as Record<string, unknown> | null
  )?.name as string | undefined;

  function extractOperations(
    rootTypeName: string | undefined,
  ): CompactOperation[] {
    if (!rootTypeName) return [];
    const rootType = allTypes.find((t) => t.name === rootTypeName);
    if (!rootType) return [];
    const fields = (rootType.fields ?? []) as Array<Record<string, unknown>>;
    return fields.map((f) => ({
      name: f.name as string,
      description: (f.description as string) ?? "",
      args: ((f.args ?? []) as Array<Record<string, unknown>>).map((a) => ({
        name: a.name as string,
        type: formatTypeRef(a.type as Record<string, unknown>),
        description: (a.description as string) ?? "",
      })),
      returnType: formatTypeRef(f.type as Record<string, unknown>),
    }));
  }

  const builtinPrefixes = ["__"];
  const rootNames = new Set(
    [queryTypeName, mutationTypeName].filter(Boolean),
  );

  const types: CompactType[] = allTypes
    .filter(
      (t) =>
        !builtinPrefixes.some((p) => (t.name as string).startsWith(p)) &&
        !rootNames.has(t.name as string),
    )
    .map((t) => {
      const entry: CompactType = {
        name: t.name as string,
        kind: t.kind as string,
        description: (t.description as string) ?? "",
      };

      if (t.kind === "OBJECT" || t.kind === "INTERFACE") {
        const fields = (t.fields ?? []) as Array<Record<string, unknown>>;
        entry.fields = fields.map((f) => ({
          name: f.name as string,
          type: formatTypeRef(f.type as Record<string, unknown>),
          description: (f.description as string) ?? "",
        }));
      }

      if (t.kind === "INPUT_OBJECT") {
        const inputFields = (t.inputFields ?? []) as Array<
          Record<string, unknown>
        >;
        entry.inputFields = inputFields.map((f) => ({
          name: f.name as string,
          type: formatTypeRef(f.type as Record<string, unknown>),
          description: (f.description as string) ?? "",
        }));
      }

      if (t.kind === "ENUM") {
        const enumValues = (t.enumValues ?? []) as Array<
          Record<string, unknown>
        >;
        entry.enumValues = enumValues.map((v) => v.name as string);
      }

      return entry;
    });

  return {
    apiVersion: API_VERSION,
    queries: extractOperations(queryTypeName),
    mutations: extractOperations(mutationTypeName),
    types,
  };
}

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
  )) as Record<string, unknown>;
  cachedSchema = Object.freeze(transformSchema(introspection)) as CompactSchema;
  console.error(
    `[shopify] Schema cached — ${cachedSchema.queries.length} queries, ` +
      `${cachedSchema.mutations.length} mutations, ` +
      `${cachedSchema.types.length} types`,
  );
  return cachedSchema;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "shopify",
  version: "1.0.0",
});

// Tool 1: shopify_search
server.registerTool(
  "shopify_search",
  {
    description:
      "Explore the Shopify Admin GraphQL API schema by running JavaScript code. " +
      "A frozen `schema` object is injected with these properties:\n" +
      "  - schema.apiVersion (string)\n" +
      "  - schema.queries (array of {name, description, args, returnType})\n" +
      "  - schema.mutations (array of {name, description, args, returnType})\n" +
      "  - schema.types (array of {name, kind, description, fields?, inputFields?, enumValues?})\n\n" +
      "Write JS to filter/map/search the schema and return the result. " +
      "Example: return schema.mutations.filter(m => m.name.includes('product'))" +
      ".map(m => ({name: m.name, description: m.description, args: m.args}));",
    inputSchema: {
      code: z
        .string()
        .describe(
          "JavaScript code to run against the schema object. Use `return` to produce output.",
        ),
    },
  },
  async ({ code }) => {
    try {
      console.error(`[shopify] search — running code (${code.length} chars)`);
      const schema = await getSchema();
      const { result, logs, error } = await runInSandbox(
        code,
        { schema },
        10_000,
      );

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
      return {
        content: [
          {
            type: "text" as const,
            text: `Schema fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Tool 2: shopify_execute
server.registerTool(
  "shopify_execute",
  {
    description:
      "Execute JavaScript code that calls the Shopify Admin GraphQL API. " +
      "A frozen `client` object is injected with one method:\n" +
      "  - client.query(graphql: string, variables?: object) → Promise<object>\n\n" +
      "Write JS using `await client.query(...)` and `return` the result. " +
      "Example: const res = await client.query(`{ shop { name } }`); return res.data.shop;",
    inputSchema: {
      code: z
        .string()
        .describe(
          "JavaScript code to execute. Use `await client.query(graphql, variables?)` for API calls and `return` to produce output.",
        ),
    },
  },
  async ({ code }) => {
    try {
      console.error(`[shopify] execute — running code (${code.length} chars)`);
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
        content: [
          {
            type: "text" as const,
            text: `Execution failed: ${msg}`,
          },
        ],
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
