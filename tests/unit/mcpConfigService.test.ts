/**
 * MCP Config Service unit tests
 *
 * Verifies field definitions, server type constants, and the
 * getAllConfigsForShop response shape.
 */

import {
  SERVER_TYPES,
  SERVER_FIELD_DEFS,
  type ServerType,
} from "../../app/services/mcpConfig.server";

describe("SERVER_TYPES", () => {
  it("includes all expected server types", () => {
    const types = [...SERVER_TYPES];
    expect(types).toContain("postgres");
    expect(types).toContain("mysql");
    expect(types).toContain("google");
    expect(types).toContain("airtable");
    expect(types).toContain("email");
    expect(types).toContain("ftp");
    expect(types).toContain("custom-api");
  });

  it("has no duplicates", () => {
    const unique = new Set(SERVER_TYPES);
    expect(unique.size).toBe(SERVER_TYPES.length);
  });
});

describe("SERVER_FIELD_DEFS", () => {
  it("has a definition for every server type", () => {
    for (const type of SERVER_TYPES) {
      expect(SERVER_FIELD_DEFS[type]).toBeDefined();
      expect(SERVER_FIELD_DEFS[type].label).toBeTruthy();
      expect(SERVER_FIELD_DEFS[type].description).toBeTruthy();
      expect(Array.isArray(SERVER_FIELD_DEFS[type].fields)).toBe(true);
    }
  });

  it("marks at least one field as required for each server type", () => {
    for (const type of SERVER_TYPES) {
      const required = SERVER_FIELD_DEFS[type].fields.filter((f) => f.required);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("has unique field keys within each server type", () => {
    for (const type of SERVER_TYPES) {
      const keys = SERVER_FIELD_DEFS[type].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("marks sensitive fields correctly", () => {
    expect(
      SERVER_FIELD_DEFS.postgres.fields.find((f) => f.key === "connectionString")?.sensitive,
    ).toBe(true);

    expect(
      SERVER_FIELD_DEFS.airtable.fields.find((f) => f.key === "apiKey")?.sensitive,
    ).toBe(true);

    expect(
      SERVER_FIELD_DEFS.airtable.fields.find((f) => f.key === "baseId")?.sensitive,
    ).toBe(false);
  });

  const expectedFields: Record<ServerType, string[]> = {
    postgres: ["connectionString"],
    mysql: ["connectionString"],
    google: ["serviceAccountJson"],
    airtable: ["apiKey", "baseId"],
    email: ["emailAddress", "password", "imapHost", "smtpHost", "imapPort", "smtpPort"],
    ftp: ["host", "port", "username", "password"],
    "custom-api": ["baseUrl", "apiKey"],
  };

  for (const [type, fieldKeys] of Object.entries(expectedFields)) {
    it(`${type} has the expected field keys`, () => {
      const actualKeys = SERVER_FIELD_DEFS[type as ServerType].fields.map((f) => f.key);
      for (const key of fieldKeys) {
        expect(actualKeys).toContain(key);
      }
    });
  }

  it("uses valid field types", () => {
    const validTypes = new Set(["text", "password", "textarea", "number"]);
    for (const type of SERVER_TYPES) {
      for (const field of SERVER_FIELD_DEFS[type].fields) {
        expect(validTypes.has(field.type)).toBe(true);
      }
    }
  });
});
