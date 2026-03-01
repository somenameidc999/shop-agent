/**
 * Unit tests for the Shopify query builder.
 *
 * Tests field resolution, sort key validation, partial-success behavior,
 * error message quality, and raw GraphQL validation — all without
 * network calls or a real Shopify API.
 */

import {
  buildQuery,
  unwrapTypeName,
  validateFieldsAgainstSchema,
  formatValidationErrors,
} from "../../app/mcp/servers/shopify/queryBuilder";
import { TEST_SCHEMA } from "../fixtures/shopifySchema";

// ═══════════════════════════════════════════════════════════════════════════
// unwrapTypeName
// ═══════════════════════════════════════════════════════════════════════════

describe("unwrapTypeName", () => {
  it("strips NON_NULL wrapper", () => {
    expect(unwrapTypeName("Product!")).toBe("Product");
  });

  it("strips LIST wrapper", () => {
    expect(unwrapTypeName("[Product]")).toBe("Product");
  });

  it("strips nested wrappers", () => {
    expect(unwrapTypeName("[Product!]!")).toBe("Product");
  });

  it("handles plain type name", () => {
    expect(unwrapTypeName("String")).toBe("String");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — valid queries
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — valid queries", () => {
  it("builds a basic products query with scalar fields", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id", "title", "status"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("products(first: 10)");
    expect(result.query).toContain("edges");
    expect(result.query).toContain("node");
    expect(result.query).toContain("id");
    expect(result.query).toContain("title");
    expect(result.query).toContain("status");
    expect(result.query).toContain("pageInfo");
  });

  it("builds a query with single-level dot-notation nested fields", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "totalPriceSet.shopMoney"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("totalPriceSet");
    expect(result.query).toContain("shopMoney");
  });

  it("builds a query with multi-level dot-notation (second level resolved as subfields)", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "totalPriceSet.shopMoney.amount"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("totalPriceSet");
  });

  it("auto-wraps connection sub-fields in edges/node", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id", "variants"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("variants(first: 10)");
    expect(result.query).toContain("edges { node { id } }");
  });

  it("includes object fields even when their sub-fields are all objects", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id", "priceRangeV2"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("priceRangeV2");
  });

  it("includes object fields in query (use dot notation for sub-field selection)", () => {
    const result = buildQuery(TEST_SCHEMA, "orders", ["id", "totalPriceSet"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("totalPriceSet");
  });

  it("applies filter as query argument", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id"], {
      filter: "status:active",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "status:active"');
  });

  it("applies limit", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id"], { limit: 25 });

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("first: 25");
  });

  it("applies valid sortKey", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id"], {
      sortKey: "CREATED_AT",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("sortKey: CREATED_AT");
  });

  it("applies reverse", () => {
    const result = buildQuery(TEST_SCHEMA, "products", ["id"], {
      reverse: true,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("reverse: true");
  });

  it("handles non-connection queries (shop)", () => {
    const result = buildQuery(TEST_SCHEMA, "shop", ["name", "email"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).not.toContain("edges");
    expect(result.query).toContain("shop");
    expect(result.query).toContain("name");
    expect(result.query).toContain("email");
  });

  it("is case-insensitive on resource name", () => {
    const result = buildQuery(TEST_SCHEMA, "Products", ["id"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("products");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — invalid field handling (partial success)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — invalid fields (partial success)", () => {
  it("produces a query with valid fields when some are invalid", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "inventoryManagement"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.query).toContain("id");
    expect(result.query).toContain("title");
    expect(result.query).toBeTruthy();
  });

  it("falls back to 'id' when all requested fields are invalid", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["inventoryManagement", "inventoryPolicy", "inventoryQuantity"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBe(4); // 3 field warnings + 1 fallback warning
    expect(result.query).toContain("id");
  });

  it("includes full field list for Product in the warning", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["inventoryManagement"],
      {},
    );

    const warning = result.warnings[0]!;
    expect(warning).toContain("inventoryManagement");
    expect(warning).toContain("does not exist on type");
    expect(warning).toContain("Product");
    // Should list available scalar fields
    expect(warning).toContain("totalInventory");
    expect(warning).toContain("title");
    expect(warning).toContain("handle");
    expect(warning).toContain("status");
    // Should list connection fields
    expect(warning).toContain("variants");
    expect(warning).toContain("images");
  });

  it("includes full field list for nested type in the warning", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["totalPriceSet.shopMoney.badField"],
      {},
    );

    expect(result.warnings.length).toBeGreaterThan(0);
    const warning = result.warnings.find((w) => w.includes("badField"));
    expect(warning).toBeDefined();
    expect(warning).toContain("amount");
    expect(warning).toContain("currencyCode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — sort key validation
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — sort key validation", () => {
  it("drops invalid sortKey and adds warning", () => {
    const result = buildQuery(TEST_SCHEMA, "draftOrders", ["id", "createdAt"], {
      sortKey: "CREATED_AT",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.query).not.toContain("sortKey");

    const warning = result.warnings.find((w) => w.includes("sortKey"));
    expect(warning).toContain("CREATED_AT");
    expect(warning).toContain("not valid");
    expect(warning).toContain("draftOrders");
    // Should list valid enum values
    expect(warning).toContain("NUMBER");
    expect(warning).toContain("UPDATED_AT");
    expect(warning).toContain("STATUS");
  });

  it("drops NUMBER_OF_ORDERS on customers and lists valid keys", () => {
    const result = buildQuery(TEST_SCHEMA, "customers", ["id", "firstName"], {
      sortKey: "NUMBER_OF_ORDERS",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.query).not.toContain("sortKey");
    expect(result.query).toContain("id");

    const warning = result.warnings.find((w) => w.includes("sortKey"));
    expect(warning).toContain("ORDERS_COUNT");
  });

  it("keeps valid sortKey for orders", () => {
    const result = buildQuery(TEST_SCHEMA, "orders", ["id"], {
      sortKey: "CREATED_AT",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("sortKey: CREATED_AT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — hard errors (query not found)
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — hard errors", () => {
  it("returns error for non-existent resource", () => {
    const result = buildQuery(TEST_SCHEMA, "campaigns", ["id"], {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("campaigns");
    expect(result.errors[0]).toContain("not found");
    expect(result.query).toBe("");
  });

  it("suggests similar queries", () => {
    const result = buildQuery(TEST_SCHEMA, "product", ["id"], {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("products");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — real terminal failure regression tests
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — regression tests from real LLM failures", () => {
  it("inventoryPolicy on Product: warns but still produces query", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "inventoryPolicy", "inventoryQuantity"],
      { filter: "inventory_policy:shopify" },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.query).toBeTruthy();
    expect(result.query).toContain("id");
    expect(result.query).toContain("title");
  });

  it("images as flat field on Product: warns but produces query with valid fields", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "images"],
      { filter: "images.exists:true" },
    );

    expect(result.errors).toHaveLength(0);
    // images IS a valid field (ImageConnection), so it should be auto-wrapped
    expect(result.query).toBeTruthy();
    expect(result.query).toContain("images(first: 10)");
  });

  it("CREATED_AT sort key on draftOrders: drops sort key, query still works", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "draftOrders",
      ["id", "createdAt"],
      { sortKey: "CREATED_AT", reverse: true },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toBeTruthy();
    expect(result.query).not.toContain("sortKey");
    expect(result.query).toContain("reverse: true");
    expect(result.query).toContain("id");
    expect(result.query).toContain("createdAt");
  });

  it("NUMBER_OF_ORDERS sort key on customers: drops sort key", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "customers",
      ["id", "firstName", "lastName", "numberOfOrders"],
      { filter: "numberOfOrders:>=3", sortKey: "NUMBER_OF_ORDERS", reverse: true },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toBeTruthy();
    expect(result.query).not.toContain("sortKey");
    expect(result.query).toContain("numberOfOrders");
  });

  it("campaigns query: returns hard error with no query", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "campaigns",
      ["id", "name", "createdAt"],
      { filter: "status:sent" },
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.query).toBe("");
  });

  it("inventoryManagement on Product: retries produce actionable field list", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "inventoryManagement"],
      { filter: "inventory_management:shopify" },
    );

    const warning = result.warnings.find((w) => w.includes("inventoryManagement"));
    expect(warning).toBeDefined();
    expect(warning).toContain("totalInventory");
    expect(warning).toContain("tracksInventory");
    expect(warning).toContain("variants");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — seed rule exact field lists
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — seed rule field validation", () => {
  const seedRuleCalls = [
    { name: "sftp_inventory_sync", resource: "products", fields: ["id", "title", "totalInventory"], filter: "totalInventory:>0", limit: 5 },
    { name: "sftp_product_images", resource: "products", fields: ["id", "title", "featuredMedia", "createdAt"], limit: 5 },
    { name: "sheets_sales_tracking", resource: "orders", fields: ["id", "name", "createdAt"], filter: "created_at:>=2026-01-01T00:00:00Z", limit: 5 },
    { name: "sheets_price_audit", resource: "products", fields: ["id", "title", "variants"], limit: 5 },
    { name: "email_repeat_customers", resource: "customers", fields: ["id", "firstName", "lastName", "numberOfOrders"], filter: "orders_count:>=3", limit: 10 },
    { name: "order_followup", resource: "orders", fields: ["id", "name", "createdAt", "displayFulfillmentStatus"], limit: 10 },
    { name: "postgres_analytics", resource: "orders", fields: ["id", "name", "createdAt", "updatedAt"], limit: 3, sortKey: "CREATED_AT", reverse: true },
    { name: "mysql_inventory", resource: "products", fields: ["id", "title", "totalInventory"], filter: "totalInventory:>0", limit: 5 },
    { name: "postgres_segments", resource: "customers", fields: ["id", "firstName", "lastName", "numberOfOrders"], limit: 5 },
    { name: "airtable_returns", resource: "orders", fields: ["id", "name", "createdAt", "displayFinancialStatus"], filter: "financial_status:refunded", limit: 5 },
    { name: "airtable_roadmap", resource: "products", fields: ["id", "title", "status", "totalInventory"], limit: 5 },
    { name: "gdrive_backup", resource: "products", fields: ["id"], limit: 1 },
    { name: "customapi_sync", resource: "products", fields: ["id", "title", "updatedAt"], limit: 5 },
  ];

  for (const rule of seedRuleCalls) {
    it(`seed rule "${rule.name}" produces valid GraphQL with zero errors and zero warnings`, () => {
      const result = buildQuery(TEST_SCHEMA, rule.resource, rule.fields, {
        filter: rule.filter,
        limit: rule.limit,
        sortKey: rule.sortKey,
        reverse: rule.reverse,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.query).toBeTruthy();
      expect(result.query).toContain(rule.resource);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// validateFieldsAgainstSchema — raw GraphQL validation
// ═══════════════════════════════════════════════════════════════════════════

describe("validateFieldsAgainstSchema", () => {
  it("returns no errors for valid query", () => {
    const query = `{
      products(first: 5) {
        edges {
          node {
            id
            title
            status
          }
        }
      }
    }`;

    const errors = validateFieldsAgainstSchema(query, TEST_SCHEMA);
    expect(errors).toHaveLength(0);
  });

  it("detects invalid field on Product", () => {
    const query = `{
      products(first: 5) {
        edges {
          node {
            id
            inventoryManagement
          }
        }
      }
    }`;

    const errors = validateFieldsAgainstSchema(query, TEST_SCHEMA);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("inventoryManagement");
    expect(errors[0]!.message).toContain("Product");
  });

  it("includes full field list in suggestions", () => {
    const query = `{
      products(first: 5) {
        edges {
          node {
            id
            badFieldName
          }
        }
      }
    }`;

    const errors = validateFieldsAgainstSchema(query, TEST_SCHEMA);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.suggestions.length).toBeGreaterThan(10);
    expect(errors[0]!.suggestions.some((s) => s.includes("title"))).toBe(true);
  });

  it("validates nested fields", () => {
    const query = `{
      orders(first: 5) {
        edges {
          node {
            id
            totalPriceSet {
              shopMoney {
                fakeField
              }
            }
          }
        }
      }
    }`;

    const errors = validateFieldsAgainstSchema(query, TEST_SCHEMA);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("fakeField");
    expect(errors[0]!.message).toContain("MoneyV2");
  });

  it("formats validation errors with full field lists", () => {
    const errors = [
      {
        path: ".products.inventoryManagement",
        message: "Field 'inventoryManagement' does not exist on type 'Product'.",
        suggestions: ["id (ID!)", "title (String!)", "totalInventory (Int!)"],
      },
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain("SCHEMA VALIDATION FAILED");
    expect(formatted).toContain("inventoryManagement");
    expect(formatted).toContain("totalInventory");
  });
});
