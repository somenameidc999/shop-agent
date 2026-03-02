/**
 * MySQL integration tests
 *
 * Verifies the database is reachable and the connection string in .env is valid.
 * Uses the same MYSQL_CONNECTION_STRING that the MCP mysql server reads.
 */

import mysql from "mysql2/promise";
import { loadEnv } from "../helpers/env.js";

loadEnv();

const connectionString = process.env.MYSQL_CONNECTION_STRING;

function parseConnectionString(connString: string) {
  const url = new URL(connString);
  return {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "3306", 10),
    user: url.username || "root",
    password: url.password || "",
    database: url.pathname.slice(1) || "mydb",
  };
}

describe("MySQL", () => {
  let connection: mysql.Connection;

  beforeAll(async () => {
    if (!connectionString) {
      console.log("  MYSQL_CONNECTION_STRING is not set — skipping MySQL tests");
      return;
    }
    connection = await mysql.createConnection(parseConnectionString(connectionString));
  });

  afterAll(async () => {
    await connection?.end();
  });

  it("has MYSQL_CONNECTION_STRING configured", () => {
    if (!connectionString) {
      console.log("  ⏭ skipped (not configured)");
      return;
    }
    expect(connectionString).toBeTruthy();
  });

  it("connects to the database", async () => {
    if (!connectionString) return;
    const [rows] = await connection.query("SELECT 1 AS ok");
    expect((rows as mysql.RowDataPacket[])[0].ok).toBe(1);
  });

  it("can list tables (schema inspection)", async () => {
    if (!connectionString) return;
    const [rows] = await connection.query("SHOW TABLES");
    const tables = rows as mysql.RowDataPacket[];
    expect(Array.isArray(tables)).toBe(true);
    console.log(`  Found ${tables.length} table(s)`);
  });

  it("can run a parameterised query", async () => {
    if (!connectionString) return;
    const [rows] = await connection.query("SELECT ? AS echo", ["hello"]);
    expect((rows as mysql.RowDataPacket[])[0].echo).toBe("hello");
  });

  it("can inspect column metadata", async () => {
    if (!connectionString) return;
    const config = parseConnectionString(connectionString);
    const [rows] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION
       LIMIT 20`,
      [config.database],
    );
    const columns = rows as mysql.RowDataPacket[];
    expect(Array.isArray(columns)).toBe(true);
    console.log(`  First ${columns.length} column(s) in schema "${config.database}"`);
  });
});
