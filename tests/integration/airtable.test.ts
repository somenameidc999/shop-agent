/**
 * Airtable integration tests
 *
 * Verifies the Airtable personal access token and base ID are valid,
 * and that the REST API is reachable — mirroring the tools exposed by
 * the airtable-mcp-server package (list_records, list_tables, etc.).
 */

import { loadEnv } from "../helpers/env.js";

loadEnv();

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;

const AIRTABLE_API = "https://api.airtable.com/v0";

async function airtableFetch(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${AIRTABLE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

describe("Airtable", () => {
  beforeAll(() => {
    if (!API_KEY || !BASE_ID) {
      console.log("  AIRTABLE_API_KEY or AIRTABLE_BASE_ID not set — tests will be skipped");
    }
  });

  it("has credentials configured", () => {
    if (!API_KEY || !BASE_ID) {
      console.log("  ⏭ skipped (not configured)");
      return;
    }
    expect(API_KEY).toBeTruthy();
    expect(BASE_ID).toBeTruthy();
    expect(API_KEY!.startsWith("pat")).toBe(true);
    expect(BASE_ID!.startsWith("app")).toBe(true);
  });

  it("authenticates with the API (list bases)", async () => {
    if (!API_KEY) return;
    const { status, data } = await airtableFetch("/meta/bases");
    expect(status).toBe(200);
    const bases = (data as { bases?: unknown[] }).bases;
    expect(Array.isArray(bases)).toBe(true);
    console.log(`  Accessible bases: ${(bases ?? []).length}`);
  });

  it("lists tables in the configured base (list_tables)", async () => {
    if (!API_KEY || !BASE_ID) return;
    const { status, data } = await airtableFetch(`/meta/bases/${BASE_ID}/tables`);
    expect(status).toBe(200);
    const tables = (data as { tables?: Array<{ name: string; id: string }> }).tables ?? [];
    expect(tables.length).toBeGreaterThan(0);
    console.log(`  Tables: ${tables.map((t) => t.name).join(", ")}`);
  });

  it("reads records from the first table (list_records)", async () => {
    if (!API_KEY || !BASE_ID) return;

    const { data: metaData } = await airtableFetch(`/meta/bases/${BASE_ID}/tables`);
    const tables = (metaData as { tables?: Array<{ name: string; id: string }> }).tables ?? [];
    if (tables.length === 0) {
      console.log("  No tables found — skipping record read");
      return;
    }

    const tableId = tables[0]!.id;
    const { status, data } = await airtableFetch(`/${BASE_ID}/${tableId}?maxRecords=5`);
    expect(status).toBe(200);
    const records = (data as { records?: unknown[] }).records ?? [];
    expect(Array.isArray(records)).toBe(true);
    console.log(`  Read ${records.length} record(s) from "${tables[0]!.name}"`);
  });

  it("describes a table (field metadata)", async () => {
    if (!API_KEY || !BASE_ID) return;

    const { data: metaData } = await airtableFetch(`/meta/bases/${BASE_ID}/tables`);
    const tables = (metaData as { tables?: Array<{ name: string; id: string; fields?: Array<{ name: string; type: string }> }> }).tables ?? [];
    if (tables.length === 0) return;

    const table = tables[0]!;
    const fields = table.fields ?? [];
    expect(fields.length).toBeGreaterThan(0);
    console.log(`  "${table.name}" has ${fields.length} field(s): ${fields.map((f) => `${f.name} (${f.type})`).join(", ")}`);
  });

  it("searches records with a filter formula (search_records)", async () => {
    if (!API_KEY || !BASE_ID) return;

    const { data: metaData } = await airtableFetch(`/meta/bases/${BASE_ID}/tables`);
    const tables = (metaData as { tables?: Array<{ name: string; id: string }> }).tables ?? [];
    if (tables.length === 0) return;

    const tableId = tables[0]!.id;
    const { status } = await airtableFetch(
      `/${BASE_ID}/${tableId}?maxRecords=3&filterByFormula=TRUE()`,
    );
    expect(status).toBe(200);
  });
});
