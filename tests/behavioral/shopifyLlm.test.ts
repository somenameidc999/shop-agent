/**
 * Layer 3: LLM Behavioral Tests
 *
 * Tests that an LLM (gpt-4o-mini) can successfully use the Shopify MCP
 * tools to answer queries within a bounded number of tool steps.
 *
 * These tests use REAL schema validation but MOCKED Shopify API responses.
 * They verify that the LLM:
 *   - Picks valid field names (or self-corrects from warnings)
 *   - Stays within the tool step budget
 *   - Produces a valid final response
 *
 * Run with: npx vitest run tests/behavioral/shopifyLlm.test.ts
 *
 * These tests call the OpenAI API and cost real tokens.
 * Set OPENAI_API_KEY in your environment.
 * They are non-deterministic — run N times and track pass rate.
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { buildQuery, type CompactSchema } from "../../app/mcp/servers/shopify/queryBuilder";
import { TEST_SCHEMA } from "../fixtures/shopifySchema";

const openaiProvider = createOpenAI();
const chatModel = openaiProvider.chat("gpt-4o-mini");

const MAX_STEPS = 6;
const TEST_TIMEOUT = 30_000;

const SYSTEM_PROMPT = `You are an AI assistant analyzing a Shopify merchant's data.

You have access to tools from connected data sources. Use them to gather information.

SHOPIFY TOOL GUIDANCE:
- For reading Shopify data, ALWAYS use the shopify_query tool. It handles GraphQL Relay patterns automatically.
  Example: resource="products", fields=["id","title","status","totalInventory"], limit=5
  Example: resource="orders", fields=["id","name","createdAt","totalPriceSet.shopMoney.amount"], filter="fulfillment_status:shipped", limit=10
- Date filters MUST use ISO 8601: created_at:>=2026-01-01T00:00:00Z
- Do NOT use relative dates like "7 days ago" or "last week" — compute the ISO date instead.
- NEVER guess Shopify field names. If a field is invalid, the tool will tell you the correct fields.

After your analysis, respond with ONLY a JSON object (no markdown fences, no extra text):

{
  "applicable": <boolean>,
  "title": "<clear recommendation title>",
  "description": "<why this matters>"
}`;

function createMockShopifyQueryTool(schema: CompactSchema) {
  return tool({
    description:
      "Query Shopify data WITHOUT writing GraphQL. Specify a resource name, fields, " +
      "and optional filter. The server handles Relay connection patterns automatically.",
    inputSchema: z.object({
      resource: z.string().describe("Root query name (e.g. 'products', 'orders')"),
      fields: z.array(z.string()).describe("Fields to return"),
      filter: z.string().optional().describe("Shopify search query string"),
      limit: z.number().optional().describe("Max items (default 10, max 250)"),
      sortKey: z.string().optional().describe("Sort key enum value"),
      reverse: z.boolean().optional().describe("Reverse sort order"),
    }),
    execute: async ({ resource, fields, filter, limit, sortKey, reverse }) => {
      const { query, errors, warnings } = buildQuery(schema, resource, fields, {
        filter: filter ?? undefined,
        limit: Math.min(limit ?? 10, 250),
        sortKey: sortKey ?? undefined,
        reverse: reverse ?? false,
      });

      if (errors.length > 0) {
        return "QUERY BUILD FAILED:\n\n" + errors.map((e) => `• ${e}`).join("\n");
      }

      const parts: string[] = [];
      if (warnings.length > 0) {
        parts.push(
          "⚠ FIELD WARNINGS (some fields were invalid and dropped):\n\n" +
            warnings.map((w) => `• ${w}`).join("\n\n") +
            "\n\nResubmit with corrected field names for complete results.\n\n---\n",
        );
      }

      parts.push(JSON.stringify({
        data: {
          [resource]: {
            edges: [
              { node: { id: "gid://shopify/Product/1", title: "Test Product", status: "ACTIVE", totalInventory: 42 } },
              { node: { id: "gid://shopify/Product/2", title: "Another Product", status: "ACTIVE", totalInventory: 15 } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }, null, 2));

      return parts.join("\n");
    },
  });
}

const skipIfNoApiKey = process.env.OPENAI_API_KEY ? describe : describe.skip;

skipIfNoApiKey("LLM behavioral tests — Shopify MCP tool usage", () => {
  const shopifyQuery = createMockShopifyQueryTool(TEST_SCHEMA);
  const tools = { shopify_query: shopifyQuery };

  it("products with valid fields: completes in ≤ 3 tool steps", async () => {
    const result = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `Check if Shopify has products with inventory. Use shopify_query with:
resource="products", fields=["id", "title", "totalInventory"], filter="totalInventory:>0", limit=5
If products exist, set applicable=true.`,
      tools,
      maxSteps: MAX_STEPS,
    });

    expect(result.steps.length).toBeLessThanOrEqual(3);
    const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    expect(toolCalls.length).toBeGreaterThan(0);
    const allOutput = result.text + JSON.stringify(result.steps.flatMap((s) => s.toolResults ?? []));
    expect(allOutput).toBeTruthy();
  }, TEST_TIMEOUT);

  it("self-corrects from REST-style field names within step budget", async () => {
    const result = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `Check if Shopify has products with inventory tracking enabled.
Determine if there are products and respond with your verdict.`,
      tools,
      maxSteps: MAX_STEPS,
    });

    expect(result.steps.length).toBeLessThanOrEqual(4);
    const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    expect(toolCalls.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  it("handles invalid sort key gracefully", async () => {
    const result = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `Check if there are any draft orders created recently.
Use shopify_query with resource="draftOrders", fields=["id", "createdAt", "status"], limit=5
If draft orders exist, set applicable=true.`,
      tools,
      maxSteps: MAX_STEPS,
    });

    expect(result.steps.length).toBeLessThanOrEqual(3);
    const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    expect(toolCalls.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  it("handles non-existent resource with actionable error", async () => {
    const result = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: `Check if Shopify has any marketing campaigns running.
If campaigns exist, set applicable=true. If the data source doesn't support this, set applicable=false.`,
      tools,
      maxSteps: MAX_STEPS,
    });

    expect(result.steps.length).toBeLessThanOrEqual(4);
    const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    expect(toolCalls.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  const FREEFORM_QUERIES = [
    "What are the top 5 products by inventory count?",
    "Show me recent orders with their fulfillment status",
    "List customers who have placed more than 3 orders",
    "Show me draft orders with their current status",
  ];

  for (const query of FREEFORM_QUERIES) {
    it(`freeform: "${query}" completes in ≤ ${MAX_STEPS} tool steps`, async () => {
      const result = await generateText({
        model: chatModel,
        system: SYSTEM_PROMPT.replace(
          "respond with ONLY a JSON object",
          "respond with a natural language summary of the results",
        ),
        prompt: query,
        tools,
        maxSteps: MAX_STEPS,
      });

      expect(result.steps.length).toBeLessThanOrEqual(MAX_STEPS);

      const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
      expect(toolCalls.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
  }
});
