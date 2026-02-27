/**
 * Postgres integration tests
 *
 * Verifies the database is reachable and the connection string in .env is valid.
 * Uses the same POSTGRES_CONNECTION_STRING that the MCP server-postgres tool reads.
 */

import { Client } from "pg";
import { loadEnv } from "../helpers/env.js";

loadEnv();

const connectionString = process.env.POSTGRES_CONNECTION_STRING;

describe("Postgres", () => {
  let client: Client;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error("POSTGRES_CONNECTION_STRING is not set in .env");
    }
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("connects to the database", async () => {
    const result = await client.query("SELECT 1 AS ok");
    expect(result.rows[0].ok).toBe(1);
  });

  it("can list tables (schema inspection tool simulation)", async () => {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    expect(Array.isArray(result.rows)).toBe(true);
    // Just assert we got a response — table count may be 0 on empty DBs
    console.log(`  Found ${result.rows.length} table(s):`, result.rows.map((r) => r.table_name));
  });

  it("can run a parameterised query", async () => {
    const result = await client.query("SELECT $1::text AS echo", ["hello"]);
    expect(result.rows[0].echo).toBe("hello");
  });
});
