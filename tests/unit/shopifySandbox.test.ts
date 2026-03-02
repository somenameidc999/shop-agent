/**
 * Sandbox executor unit tests
 *
 * Verifies that the sandboxed JS executor correctly:
 *   - runs code and returns results
 *   - captures console output
 *   - injects caller-provided globals
 *   - blocks dangerous globals (process, require, fetch, eval, etc.)
 *   - enforces timeouts
 *   - handles syntax errors gracefully
 *   - supports async/await
 */

import { runInSandbox } from "../../app/mcp/servers/shopify/sandbox";

describe("runInSandbox", () => {
  // ── Basic execution ──────────────────────────────────────────────────

  it("returns a simple value", async () => {
    const { result, error } = await runInSandbox("return 42;", {});
    expect(error).toBeUndefined();
    expect(result).toBe(42);
  });

  it("returns undefined when no return statement", async () => {
    const { result, error } = await runInSandbox("const x = 1;", {});
    expect(error).toBeUndefined();
    expect(result).toBeUndefined();
  });

  it("returns complex objects", async () => {
    const { result, error } = await runInSandbox(
      'return { name: "test", items: [1, 2, 3] };',
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toEqual({ name: "test", items: [1, 2, 3] });
  });

  // ── Console capture ──────────────────────────────────────────────────

  it("captures console.log output", async () => {
    const { logs, error } = await runInSandbox(
      'console.log("hello"); console.log("world"); return true;',
      {},
    );
    expect(error).toBeUndefined();
    expect(logs).toEqual(["hello", "world"]);
  });

  it("captures console.warn and console.error with prefixes", async () => {
    const { logs } = await runInSandbox(
      'console.warn("caution"); console.error("bad");',
      {},
    );
    expect(logs).toEqual(["[warn] caution", "[error] bad"]);
  });

  it("captures console.info and console.debug", async () => {
    const { logs } = await runInSandbox(
      'console.info("info msg"); console.debug("debug msg");',
      {},
    );
    expect(logs).toEqual(["[info] info msg", "[debug] debug msg"]);
  });

  // ── Injected globals ─────────────────────────────────────────────────

  it("injects caller-provided globals", async () => {
    const schema = Object.freeze({
      queries: [
        { name: "products", description: "List products" },
        { name: "orders", description: "List orders" },
      ],
    });

    const { result, error } = await runInSandbox(
      'return schema.queries.filter(q => q.name === "products");',
      { schema },
    );
    expect(error).toBeUndefined();
    expect(result).toEqual([{ name: "products", description: "List products" }]);
  });

  it("allows using injected async functions", async () => {
    const client = Object.freeze({
      query: async (q: string) => ({ data: { shop: { name: "TestShop" } }, query: q }),
    });

    const { result, error } = await runInSandbox(
      'const res = await client.query("{ shop { name } }"); return res.data.shop.name;',
      { client },
    );
    expect(error).toBeUndefined();
    expect(result).toBe("TestShop");
  });

  // ── Safety: blocked globals ──────────────────────────────────────────

  it("blocks process access", async () => {
    const { error } = await runInSandbox("return process.env;", {});
    expect(error).toBeDefined();
    expect(error).toMatch(/Cannot read propert/);
  });

  it("blocks require", async () => {
    const { error } = await runInSandbox('return require("fs");', {});
    expect(error).toBeDefined();
    expect(error).toMatch(/require is not a function/);
  });

  it("blocks fetch", async () => {
    const { error } = await runInSandbox(
      'return await fetch("https://example.com");',
      {},
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/fetch is not a function/);
  });

  it("blocks eval", async () => {
    const { error } = await runInSandbox('return eval("1+1");', {});
    expect(error).toBeDefined();
    expect(error).toMatch(/eval is not a function/);
  });

  it("blocks Function constructor", async () => {
    const { error } = await runInSandbox(
      'return new Function("return 1")()',
      {},
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/Function is not a constructor/);
  });

  it("blocks import statements", async () => {
    const { error } = await runInSandbox(
      'import fs from "fs"; return fs;',
      {},
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/Syntax error/);
  });

  it("blocks setTimeout", async () => {
    const { error } = await runInSandbox(
      "setTimeout(() => {}, 100);",
      {},
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/setTimeout is not a function/);
  });

  // ── Safe builtins are available ──────────────────────────────────────

  it("allows JSON.stringify/parse", async () => {
    const { result, error } = await runInSandbox(
      'return JSON.parse(JSON.stringify({ a: 1 }));',
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toEqual({ a: 1 });
  });

  it("allows Array methods", async () => {
    const { result, error } = await runInSandbox(
      "return [3, 1, 2].sort().map(x => x * 2);",
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toEqual([2, 4, 6]);
  });

  it("allows Map and Set", async () => {
    const { result, error } = await runInSandbox(
      'const m = new Map(); m.set("a", 1); return m.get("a");',
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toBe(1);
  });

  it("allows RegExp", async () => {
    const { result, error } = await runInSandbox(
      'return /hello/.test("hello world");',
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toBe(true);
  });

  it("allows Date", async () => {
    const { result, error } = await runInSandbox(
      "return typeof new Date().getTime();",
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toBe("number");
  });

  it("allows Math", async () => {
    const { result, error } = await runInSandbox("return Math.max(1, 2, 3);", {});
    expect(error).toBeUndefined();
    expect(result).toBe(3);
  });

  // ── Error handling ───────────────────────────────────────────────────

  it("catches runtime errors and returns them as error", async () => {
    const { error, result } = await runInSandbox(
      'throw new Error("boom");',
      {},
    );
    expect(error).toBe("boom");
    expect(result).toBeUndefined();
  });

  it("handles syntax errors gracefully", async () => {
    const { error } = await runInSandbox("return {{{", {});
    expect(error).toBeDefined();
    expect(error).toMatch(/Syntax error/);
  });

  // ── Timeout ──────────────────────────────────────────────────────────

  it("enforces timeout on async operations", async () => {
    const { error } = await runInSandbox(
      "await new Promise(resolve => {})",
      {},
      200,
    );
    expect(error).toBeDefined();
    expect(error).toMatch(/timed out/i);
  }, 10_000);

  // ── Async support ────────────────────────────────────────────────────

  it("supports await with promises", async () => {
    const { result, error } = await runInSandbox(
      "const val = await Promise.resolve(99); return val;",
      {},
    );
    expect(error).toBeUndefined();
    expect(result).toBe(99);
  });

  it("catches rejected promises", async () => {
    const { error } = await runInSandbox(
      'await Promise.reject(new Error("nope"));',
      {},
    );
    expect(error).toBe("nope");
  });
});
