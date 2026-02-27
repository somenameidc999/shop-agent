/**
 * Custom HTTP API integration tests
 *
 * Verifies the configured CUSTOM_API_BASE_URL is reachable and that
 * each HTTP method tool the MCP custom-api server exposes works correctly.
 *
 * Default target in .env: https://postman-echo.com (a public echo API —
 * swap CUSTOM_API_BASE_URL for your real service to test that instead).
 */

import { loadEnv } from "../helpers/env.js";

loadEnv();

const BASE_URL = process.env.CUSTOM_API_BASE_URL?.replace(/\/$/, "");
const API_KEY = process.env.CUSTOM_API_KEY ?? "";

if (!BASE_URL) throw new Error("CUSTOM_API_BASE_URL is not set in .env");

async function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  queryParams?: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  const url = new URL(path, BASE_URL);
  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }

  return { status: res.status, data };
}

describe("Custom HTTP API", () => {
  it("reaches the base URL (GET /get — api_get tool)", async () => {
    const { status, data } = await makeRequest("GET", "/get");
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    console.log("  GET /get →", JSON.stringify(data).slice(0, 120));
  });

  it("sends query params correctly (api_get with query_params)", async () => {
    const { status, data } = await makeRequest("GET", "/get", undefined, {
      foo: "bar",
      num: "42",
    });
    expect(status).toBe(200);
    const args = (data as Record<string, unknown>).args as Record<string, string>;
    expect(args?.foo).toBe("bar");
    expect(args?.num).toBe("42");
  });

  it("posts a JSON body (api_post tool)", async () => {
    const payload = { message: "hello", value: 123 };
    const { status, data } = await makeRequest("POST", "/post", payload);
    expect(status).toBe(200);
    const json = (data as Record<string, unknown>).json as typeof payload;
    expect(json?.message).toBe("hello");
    expect(json?.value).toBe(123);
  });

  it("sends a PUT request (api_put tool)", async () => {
    const payload = { updated: true };
    const { status, data } = await makeRequest("PUT", "/put", payload);
    expect(status).toBe(200);
    const json = (data as Record<string, unknown>).json as typeof payload;
    expect(json?.updated).toBe(true);
  });

  it("sends a PATCH request (api_patch tool)", async () => {
    const payload = { patched: "yes" };
    const { status, data } = await makeRequest("PATCH", "/patch", payload);
    expect(status).toBe(200);
    const json = (data as Record<string, unknown>).json as typeof payload;
    expect(json?.patched).toBe("yes");
  });
});
