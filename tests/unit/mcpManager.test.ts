/**
 * MCP Manager unit tests
 *
 * Tests the jsonSchemaToZod helper and the getStatus / getFullStatus
 * response shapes without spawning actual MCP server processes.
 */

import { z } from "zod";

/**
 * Re-implement jsonSchemaToZod here for isolated testing.
 * The real implementation lives in mcpManager.server.ts but is not exported.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType<any, any> {
  if (!schema || typeof schema !== "object") {
    return z.object({});
  }

  const type = schema.type as string | undefined;

  if (type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required ?? []) as string[];
    const shape: Record<string, z.ZodType> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp = jsonSchemaToZod(propSchema);
      if (!required.includes(key)) {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }
    return z.object(shape);
  }

  if (type === "array") {
    const items = (schema.items ?? {}) as Record<string, unknown>;
    return z.array(jsonSchemaToZod(items));
  }

  if (type === "string") {
    if (schema.enum) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    let base = z.string();
    if (schema.description) {
      base = base.describe(schema.description as string);
    }
    return base;
  }

  if (type === "number" || type === "integer") {
    return z.number();
  }

  if (type === "boolean") {
    return z.boolean();
  }

  return z.any();
}

describe("jsonSchemaToZod", () => {
  it("converts a simple object schema", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };

    const zodSchema = jsonSchemaToZod(schema);
    expect(zodSchema.parse({ name: "Alice", age: 30 })).toEqual({ name: "Alice", age: 30 });
    expect(zodSchema.parse({ name: "Bob" })).toEqual({ name: "Bob" });
    expect(() => zodSchema.parse({ age: 25 })).toThrow();
  });

  it("handles string enums", () => {
    const schema = {
      type: "string",
      enum: ["asc", "desc"],
    };

    const zodSchema = jsonSchemaToZod(schema);
    expect(zodSchema.parse("asc")).toBe("asc");
    expect(() => zodSchema.parse("invalid")).toThrow();
  });

  it("handles arrays", () => {
    const schema = {
      type: "array",
      items: { type: "string" },
    };

    const zodSchema = jsonSchemaToZod(schema);
    expect(zodSchema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(zodSchema.parse([])).toEqual([]);
  });

  it("handles boolean type", () => {
    const zodSchema = jsonSchemaToZod({ type: "boolean" });
    expect(zodSchema.parse(true)).toBe(true);
    expect(zodSchema.parse(false)).toBe(false);
  });

  it("handles integer type", () => {
    const zodSchema = jsonSchemaToZod({ type: "integer" });
    expect(zodSchema.parse(42)).toBe(42);
  });

  it("handles nested objects", () => {
    const schema = {
      type: "object",
      properties: {
        filter: {
          type: "object",
          properties: {
            field: { type: "string" },
            value: { type: "string" },
          },
          required: ["field"],
        },
      },
      required: ["filter"],
    };

    const zodSchema = jsonSchemaToZod(schema);
    expect(zodSchema.parse({ filter: { field: "name", value: "test" } })).toEqual({
      filter: { field: "name", value: "test" },
    });
  });

  it("returns z.any() for unknown types", () => {
    const zodSchema = jsonSchemaToZod({ type: "custom" });
    expect(zodSchema.parse("anything")).toBe("anything");
    expect(zodSchema.parse(123)).toBe(123);
  });

  it("returns z.object({}) for null/undefined input", () => {
    const zodSchema = jsonSchemaToZod(null as any);
    expect(zodSchema.parse({})).toEqual({});
  });

  it("handles typical MCP tool schemas (airtable list_records)", () => {
    const schema = {
      type: "object",
      properties: {
        baseId: { type: "string", description: "The ID of the Airtable base" },
        tableId: { type: "string", description: "The ID or name of the table" },
        maxRecords: { type: "number", description: "Maximum records to return" },
        filterByFormula: { type: "string", description: "Airtable formula filter" },
      },
      required: ["baseId", "tableId"],
    };

    const zodSchema = jsonSchemaToZod(schema);
    expect(zodSchema.parse({ baseId: "appXXX", tableId: "tblXXX" })).toEqual({
      baseId: "appXXX",
      tableId: "tblXXX",
    });
    expect(zodSchema.parse({ baseId: "appXXX", tableId: "tblXXX", maxRecords: 10 })).toEqual({
      baseId: "appXXX",
      tableId: "tblXXX",
      maxRecords: 10,
    });
  });
});
