/**
 * Shopify Admin GraphQL API integration tests
 *
 * Tests the live introspection + execute flow against the real Shopify
 * Admin API. Requires a valid Shop record in the database with an
 * access token that has at least `read_products` scope.
 *
 * The shop domain is read from the database (first Shop record found).
 */

import { PrismaClient } from "@prisma/client";
import { runInSandbox } from "../../app/mcp/servers/shopify/sandbox";

const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

const prisma = new PrismaClient();

let SHOP: string;
let ACCESS_TOKEN: string;

beforeAll(async () => {
  const record = await prisma.shop.findFirst({
    select: { shop: true, accessToken: true },
  });
  if (!record?.accessToken) {
    throw new Error(
      "No Shop record with accessToken found in the database. " +
        "Install the app on a dev store first.",
    );
  }
  SHOP = record.shop;
  ACCESS_TOKEN = record.accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function createGraphQLClient() {
  const endpoint = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

  async function query(
    graphql: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN,
      },
      body: JSON.stringify({ query: graphql, variables }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Shopify GraphQL ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }

    return json;
  }

  return Object.freeze({ query });
}

// ---------------------------------------------------------------------------
// Introspection (mirrors what shopify_search does)
// ---------------------------------------------------------------------------

describe("Shopify introspection (shopify_search)", () => {
  let schema: Record<string, unknown>;

  beforeAll(async () => {
    const client = createGraphQLClient();
    const introspection = (await client.query(`
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
              args { name description type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
              type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
            }
            inputFields { name description type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
            enumValues(includeDeprecated: false) { name }
          }
        }
      }
    `)) as Record<string, unknown>;

    const data = introspection as { data: { __schema: Record<string, unknown> } };
    const allTypes = (data.data.__schema.types ?? []) as Array<Record<string, unknown>>;
    const queryTypeName = (data.data.__schema.queryType as Record<string, unknown>)?.name as string;
    const mutationTypeName = (data.data.__schema.mutationType as Record<string, unknown>)?.name as string;

    const queryType = allTypes.find((t) => t.name === queryTypeName);
    const mutationType = allTypes.find((t) => t.name === mutationTypeName);

    schema = Object.freeze({
      apiVersion: API_VERSION,
      queries: (queryType?.fields ?? []) as unknown[],
      mutations: (mutationType?.fields ?? []) as unknown[],
      types: allTypes.filter(
        (t) =>
          !(t.name as string).startsWith("__") &&
          t.name !== queryTypeName &&
          t.name !== mutationTypeName,
      ),
    });
  }, 30_000);

  it("introspection returns queries", () => {
    expect((schema.queries as unknown[]).length).toBeGreaterThan(0);
  });

  it("introspection returns mutations", () => {
    expect((schema.mutations as unknown[]).length).toBeGreaterThan(0);
  });

  it("introspection returns types", () => {
    expect((schema.types as unknown[]).length).toBeGreaterThan(100);
  });

  it("sandbox can search for product queries", async () => {
    const { result, error } = await runInSandbox(
      `return schema.queries
        .filter(q => q.name.toLowerCase().includes("product"))
        .map(q => q.name);`,
      { schema },
    );
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(Array);
    expect((result as string[]).length).toBeGreaterThan(0);
    console.log("  Product queries:", result);
  });

  it("sandbox can search for order mutations", async () => {
    const { result, error } = await runInSandbox(
      `return schema.mutations
        .filter(m => m.name.toLowerCase().includes("order"))
        .map(m => m.name);`,
      { schema },
    );
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(Array);
    console.log("  Order mutations:", result);
  });
});

// ---------------------------------------------------------------------------
// Execute (mirrors what shopify_execute does)
// ---------------------------------------------------------------------------

describe("Shopify execute (shopify_execute)", () => {
  it("queries the shop name", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { result, error } = await runInSandbox(
      `const res = await client.query(\`{ shop { name } }\`);
       return res.data.shop;`,
      { client },
    );
    expect(error).toBeUndefined();
    expect(result).toHaveProperty("name");
    console.log("  Shop:", result);
  });

  it("queries products", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { result, error } = await runInSandbox(
      `const res = await client.query(\`{
        products(first: 3) {
          edges { node { id title status } }
        }
      }\`);
      return res.data.products.edges.map(e => e.node);`,
      { client },
    );
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(Array);
    console.log("  Products:", JSON.stringify(result, null, 2).slice(0, 300));
  });

  it("handles GraphQL errors gracefully", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { error } = await runInSandbox(
      `await client.query(\`{ nonExistentField }\`);`,
      { client },
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/GraphQL errors/);
  });

  it("blocks import statements in execute sandbox", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { error } = await runInSandbox(
      `import fetch from 'node-fetch'; return await fetch('https://example.com');`,
      { client },
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/Syntax error/);
  });

  it("blocks require in execute sandbox", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { error } = await runInSandbox(
      `const fs = require('fs'); return fs.readFileSync('/etc/passwd');`,
      { client },
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/require is not a function/);
  });

  it("blocks fetch in execute sandbox", async () => {
    const client = Object.freeze(createGraphQLClient());
    const { error } = await runInSandbox(
      `return await fetch('https://example.com');`,
      { client },
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/fetch is not a function/);
  });
});
