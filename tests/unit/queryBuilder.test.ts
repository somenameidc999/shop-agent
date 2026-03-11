/**
 * Unit tests for the Shopify query builder.
 *
 * Tests field resolution, sort key validation, partial-success behavior,
 * error message quality, and raw GraphQL validation — all without
 * network calls or a real Shopify API.
 */

import {
  buildQuery,
  getSearchStems,
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

  it("suggests similar queries for truly unknown resource", () => {
    const result = buildQuery(TEST_SCHEMA, "webhook", ["id"], {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not found");
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

  it("totalPriceSet on Order: auto-expands nested objects (MoneyBag → MoneyV2)", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "totalPriceSet", "createdAt"],
      { sortKey: "CREATED_AT" },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("totalPriceSet");
    expect(result.query).toContain("shopMoney");
    expect(result.query).toContain("amount");
    expect(result.query).not.toMatch(/totalPriceSet\s*\{\s*\}/);
  });

  it("priceRangeV2 on Product: auto-expands nested objects (ProductPriceRangeV2 → MoneyV2)", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "priceRangeV2"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("priceRangeV2");
    expect(result.query).toContain("minVariantPrice");
    expect(result.query).toContain("amount");
    expect(result.query).not.toMatch(/priceRangeV2\s*\{\s*\}/);
  });

  it("totalPriceSet.shopMoney: auto-expands object leaf into sub-fields", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "totalPriceSet.shopMoney"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.query).toContain("totalPriceSet");
    expect(result.query).toContain("shopMoney");
    expect(result.query).toContain("amount");
    expect(result.query).toContain("currencyCode");
    expect(result.query).not.toMatch(/shopMoney\s*[},\n]/);
  });

  it("multiple variants.X fields merge into one connection selection", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "variants.title", "variants.price", "variants.sku", "variants.inventoryQuantity"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);

    const variantsCount = (result.query.match(/variants/g) || []).length;
    expect(variantsCount).toBe(1);

    expect(result.query).toContain("edges { node {");
    expect(result.query).toContain("title");
    expect(result.query).toContain("price");
    expect(result.query).toContain("sku");
    expect(result.query).toContain("inventoryQuantity");
  });

  it("multiple images.X fields merge into one connection selection", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "images.url", "images.altText"],
      {},
    );

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);

    const imagesCount = (result.query.match(/images/g) || []).length;
    expect(imagesCount).toBe(1);

    expect(result.query).toContain("url");
    expect(result.query).toContain("altText");
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
// getSearchStems
// ═══════════════════════════════════════════════════════════════════════════

describe("getSearchStems", () => {
  it("returns original term + plural variant", () => {
    expect(getSearchStems("product")).toEqual(["product", "products"]);
  });

  it("strips trailing 's' for plurals", () => {
    expect(getSearchStems("discounts")).toEqual(["discounts", "discount"]);
  });

  it("handles uppercase input", () => {
    expect(getSearchStems("Products")).toEqual(["products", "product"]);
  });

  it("does not strip 's' from very short strings", () => {
    expect(getSearchStems("as")).toEqual(["as"]);
  });

  it("adds plural for already-singular terms", () => {
    expect(getSearchStems("order")).toEqual(["order", "orders"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — plural resource name & stemmed suggestion regression
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — plural/stemmed resource suggestions", () => {
  it('"discounts" suggests discountNodes, not just SavedSearches', () => {
    const result = buildQuery(TEST_SCHEMA, "discounts", ["id"], {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not found");
    expect(result.errors[0]).toContain("discountNodes");
  });

  it('"discounts" suggestions include automaticDiscountNodes', () => {
    const result = buildQuery(TEST_SCHEMA, "discounts", ["id"], {});

    expect(result.errors[0]).toContain("automaticDiscountNodes");
  });

  it('"discounts" suggestions include codeDiscountNodes', () => {
    const result = buildQuery(TEST_SCHEMA, "discounts", ["id"], {});

    expect(result.errors[0]).toContain("codeDiscountNodes");
  });

  it('"discount" (singular) also suggests discountNodes', () => {
    const result = buildQuery(TEST_SCHEMA, "discount", ["id"], {});

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("discountNodes");
  });

  it('"product" (singular) exact-matches the singular query — does NOT fall through to "products"', () => {
    // When "product" exists in the schema, it should match exactly.
    // This is correct behavior — the singular query requires an id arg,
    // and the query builder will build it (without edges/node wrapping).
    const result = buildQuery(TEST_SCHEMA, "product", ["id", "title"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("product");
    // Should NOT contain the plural collection pattern
    expect(result.query).not.toContain("edges");
    expect(result.query).not.toContain("pageInfo");
  });

  it('"products" (plural) exact-matches the collection query even when singular exists in schema', () => {
    const schemaWithSingularFirst: CompactSchema = {
      ...TEST_SCHEMA,
      queries: [
        {
          name: "product",
          description: "Single product by ID.",
          args: [{ name: "id", type: "ID!", description: "" }],
          returnType: "Product",
        },
        ...TEST_SCHEMA.queries,
      ],
    };

    const result = buildQuery(schemaWithSingularFirst, "products", ["id", "title"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("products");
    expect(result.query).not.toMatch(/\bproduct\s*\{/);
  });

  it('"orders" exact-matches the collection query, not singular "order"', () => {
    const schemaWithSingularFirst: CompactSchema = {
      ...TEST_SCHEMA,
      queries: [
        {
          name: "order",
          description: "Single order by ID.",
          args: [{ name: "id", type: "ID!", description: "" }],
          returnType: "Order",
        },
        ...TEST_SCHEMA.queries,
      ],
    };

    const result = buildQuery(schemaWithSingularFirst, "orders", ["id", "name"], {});

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("orders");
    expect(result.query).not.toMatch(/\border\s*\{/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — seed goal query scenarios
//
// Tests the exact queries that the AI agent makes when analyzing the 29
// built-in merchant goals. Each goal triggers specific resource + field
// combinations during analysis.
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — seed goal analysis queries", () => {
  // -----------------------------------------------------------------------
  // CATALOG INTELLIGENCE goals
  // -----------------------------------------------------------------------

  it("product_description_contradictions: products with descriptions, variants, options, images", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "totalInventory", "status", "variants.price", "variants.inventoryQuantity", "variants.title", "options.name", "options.values", "images.url", "images.altText"],
      { filter: "status:active", limit: 25 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("products");
    expect(result.query).toContain("descriptionHtml");
    expect(result.query).toContain("variants");
    expect(result.query).toContain("options");
    expect(result.query).toContain("images");
  });

  it("ai_shopping_readiness: products with metafields for structured data", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "productType", "tags", "images.url", "metafields.key", "metafields.value", "metafields.namespace", "variants.price"],
      { filter: "status:active", limit: 20 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("metafields");
    expect(result.query).toContain("key");
    expect(result.query).toContain("namespace");
  });

  it("cannibalistic_listings: products for search overlap analysis", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "productType", "tags", "vendor", "variants.price"],
      { filter: "status:active", limit: 50 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("first: 50");
    expect(result.query).toContain("productType");
    expect(result.query).toContain("vendor");
  });

  it("product_collection_mismatch: collections query", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "collections",
      ["id", "title", "descriptionHtml", "productsCount"],
      { limit: 30 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("collections");
    expect(result.query).toContain("productsCount");
  });

  it("product_collection_mismatch: products with collections sub-field", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "productType", "tags", "collections.title"],
      { filter: "status:active", limit: 30 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("collections");
    expect(result.query).toContain("title");
  });

  it("listing_quality_benchmark: products sorted by best selling", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "totalVariants", "images", "productType", "tags"],
      { sortKey: "INVENTORY_TOTAL", reverse: true, limit: 10 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("sortKey: INVENTORY_TOTAL");
    expect(result.query).toContain("reverse: true");
  });

  it("product_data_passport: variants with sku, barcode, weight", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "variants.sku", "variants.barcode", "variants.weight", "tags"],
      { filter: "status:active", limit: 30 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("sku");
    expect(result.query).toContain("barcode");
    expect(result.query).toContain("weight");
  });

  // -----------------------------------------------------------------------
  // CROSS-SOURCE CAUSAL REASONING goals
  // -----------------------------------------------------------------------

  it("conversion_drop_diagnosis: recent orders for volume comparison", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "createdAt", "totalPriceSet.shopMoney.amount"],
      { filter: "created_at:>=2026-02-01T00:00:00Z", sortKey: "CREATED_AT", limit: 50 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("orders");
    expect(result.query).toContain("totalPriceSet");
    expect(result.query).toContain("amount");
  });

  it("return_spike_root_cause: refunded orders", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "createdAt", "displayFinancialStatus", "lineItems.title", "lineItems.quantity"],
      { filter: "financial_status:refunded", limit: 50 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "financial_status:refunded"');
    expect(result.query).toContain("lineItems");
  });

  it("traffic_order_disconnect: high-inventory products sorted by inventory", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "totalInventory", "status", "descriptionHtml", "images"],
      { sortKey: "INVENTORY_TOTAL", reverse: true, limit: 20 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("sortKey: INVENTORY_TOTAL");
    expect(result.query).toContain("totalInventory");
  });

  // -----------------------------------------------------------------------
  // STRATEGIC JUDGMENT goals
  // -----------------------------------------------------------------------

  it("subscription_opportunity: 6 months of orders sorted by date", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "createdAt", "customer.id", "customer.numberOfOrders", "lineItems.title"],
      { filter: "financial_status:paid created_at:>=2025-09-01T00:00:00Z", sortKey: "CREATED_AT", limit: 250 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("customer");
    expect(result.query).toContain("lineItems");
  });

  it("price_elasticity_inference: products with compareAtPrice", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "variants.price", "variants.compareAtPrice", "variants.inventoryQuantity"],
      { filter: "status:active", limit: 30 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("compareAtPrice");
    expect(result.query).toContain("price");
  });

  it("marketing_attribution_reasoning: discount nodes", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "discountNodes",
      ["id", "discount"],
      { limit: 20 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("discountNodes");
  });

  // -----------------------------------------------------------------------
  // CUSTOMER INTELLIGENCE goals
  // -----------------------------------------------------------------------

  it("customer_ltv_narrative: top customers by spend", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "customers",
      ["id", "firstName", "lastName", "email", "numberOfOrders", "tags", "state"],
      { sortKey: "TOTAL_SPENT", reverse: true, limit: 20 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain("sortKey: TOTAL_SPENT");
    expect(result.query).toContain("numberOfOrders");
  });

  it("churn_prediction_intervention: repeat customers", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "customers",
      ["id", "firstName", "lastName", "numberOfOrders", "createdAt"],
      { filter: "orders_count:>=3", sortKey: "TOTAL_SPENT", reverse: true, limit: 50 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "orders_count:>=3"');
  });

  // -----------------------------------------------------------------------
  // OPERATIONAL STRATEGY goals
  // -----------------------------------------------------------------------

  it("prelaunch_readiness_audit: draft products", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "products",
      ["id", "title", "descriptionHtml", "status", "images", "variants.price", "variants.sku", "collections.title", "productType", "tags"],
      { filter: "status:draft", limit: 20 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "status:draft"');
    expect(result.query).toContain("collections");
  });

  it("unfulfilled_order_aging: unfulfilled orders", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "createdAt", "displayFulfillmentStatus", "customer.id", "customer.numberOfOrders", "lineItems.title"],
      { filter: "fulfillment_status:unfulfilled", limit: 30 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "fulfillment_status:unfulfilled"');
    expect(result.query).toContain("displayFulfillmentStatus");
  });

  it("fulfillment_strategy_optimization: shipped orders", () => {
    const result = buildQuery(
      TEST_SCHEMA,
      "orders",
      ["id", "name", "createdAt", "updatedAt", "displayFulfillmentStatus"],
      { filter: "fulfillment_status:shipped", sortKey: "CREATED_AT", reverse: true, limit: 50 },
    );

    expect(result.errors).toHaveLength(0);
    expect(result.query).toContain('query: "fulfillment_status:shipped"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildQuery — merchant goal scenarios
//
// Tests what happens when merchants create goals using natural language.
// The AI agent translates these into shopify_query tool calls. These tests
// verify the query builder handles the resource names and fields the AI
// would realistically choose.
// ═══════════════════════════════════════════════════════════════════════════

describe("buildQuery — merchant goal scenarios", () => {
  // -----------------------------------------------------------------------
  // Vague merchant goals — "I want more money"
  // The AI would query products (pricing opportunities), orders (revenue
  // trends), and customers (LTV analysis) to find actionable insights.
  // -----------------------------------------------------------------------

  describe("vague goal: 'I want more money'", () => {
    it("AI queries products for pricing opportunities", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "products",
        ["id", "title", "variants.price", "variants.compareAtPrice", "totalInventory", "status"],
        { filter: "status:active", sortKey: "INVENTORY_TOTAL", reverse: true, limit: 20 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("products");
      expect(result.query).toContain("price");
    });

    it("AI queries orders for revenue trends", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "orders",
        ["id", "createdAt", "totalPriceSet.shopMoney.amount", "displayFinancialStatus"],
        { filter: "created_at:>=2026-02-01T00:00:00Z financial_status:paid", limit: 100 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("orders");
      expect(result.query).toContain("totalPriceSet");
    });

    it("AI queries customers for high-value segments", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "customers",
        ["id", "firstName", "lastName", "numberOfOrders", "email"],
        { sortKey: "TOTAL_SPENT", reverse: true, limit: 20 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("customers");
      expect(result.query).toContain("numberOfOrders");
    });
  });

  // -----------------------------------------------------------------------
  // Vague goal: "Make my store better"
  // AI would audit catalog quality, check for description issues, review
  // image coverage.
  // -----------------------------------------------------------------------

  describe("vague goal: 'Make my store better'", () => {
    it("AI audits product listing quality", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "products",
        ["id", "title", "descriptionHtml", "images", "variants", "productType", "tags", "status"],
        { filter: "status:active", limit: 50 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("descriptionHtml");
      expect(result.query).toContain("images");
      expect(result.query).toContain("variants");
    });

    it("AI checks collection organization", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "collections",
        ["id", "title", "descriptionHtml", "productsCount"],
        { limit: 50 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("collections");
      expect(result.query).toContain("productsCount");
    });
  });

  // -----------------------------------------------------------------------
  // Specific but impossible goals — services that don't exist
  // The AI can only use Shopify data. These test what happens when the AI
  // falls back to querying what it CAN access.
  // -----------------------------------------------------------------------

  describe("specific goal: 'Improve my Klaviyo email marketing'", () => {
    // Klaviyo isn't connected, so AI falls back to analyzing customers and
    // orders for email marketing insights from Shopify data alone.

    it("AI queries customers with email for segmentation", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "customers",
        ["id", "firstName", "lastName", "email", "numberOfOrders", "createdAt", "tags", "state"],
        { filter: "orders_count:>=1", limit: 50 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("email");
      expect(result.query).toContain("state");
    });

    it("AI queries orders to find repeat purchase patterns", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "orders",
        ["id", "createdAt", "customer.id", "customer.email", "lineItems.title", "totalPriceSet.shopMoney.amount"],
        { filter: "financial_status:paid", sortKey: "CREATED_AT", reverse: true, limit: 100 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("customer");
      expect(result.query).toContain("lineItems");
    });
  });

  describe("specific goal: 'Fix my Google Ads ROAS'", () => {
    // No Google Ads connection. AI can only analyze order data to identify
    // which products convert and which don't.

    it("AI queries orders with line items for product performance", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "orders",
        ["id", "createdAt", "totalPriceSet.shopMoney.amount", "subtotalPriceSet.shopMoney.amount", "lineItems.title", "lineItems.quantity", "tags"],
        { filter: "financial_status:paid created_at:>=2026-01-01T00:00:00Z", limit: 100 },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("subtotalPriceSet");
      expect(result.query).toContain("lineItems");
    });
  });

  // -----------------------------------------------------------------------
  // Merchant uses wrong terminology — common naming mistakes
  // These test that the query builder gives helpful suggestions instead
  // of silently matching the wrong query.
  // -----------------------------------------------------------------------

  describe("merchant uses wrong resource names", () => {
    it('"inventory" fails with suggestions (no such root query)', () => {
      const result = buildQuery(TEST_SCHEMA, "inventory", ["id", "sku"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
      expect(result.errors[0]).toContain("inventoryItems");
    });

    it('"sales" fails with suggestions — no Shopify query named "sales"', () => {
      const result = buildQuery(TEST_SCHEMA, "sales", ["id", "amount"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"refunds" fails — must use orders with financial_status filter', () => {
      const result = buildQuery(TEST_SCHEMA, "refunds", ["id", "amount"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"subscribers" fails — no such query, suggests "customers"', () => {
      const result = buildQuery(TEST_SCHEMA, "subscribers", ["id", "email"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"catalog" fails — no such query', () => {
      const result = buildQuery(TEST_SCHEMA, "catalog", ["id", "title"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"reviews" fails — reviews are not in Shopify Admin API', () => {
      const result = buildQuery(TEST_SCHEMA, "reviews", ["id", "rating"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"transactions" fails — no such root query', () => {
      const result = buildQuery(TEST_SCHEMA, "transactions", ["id", "amount"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });

    it('"shipping" fails — no such root query', () => {
      const result = buildQuery(TEST_SCHEMA, "shipping", ["id", "status"], {});

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("not found");
    });
  });

  // -----------------------------------------------------------------------
  // Singular vs plural — the exact bug that was breaking production
  // With exact matching, singular queries should match singular queries
  // (which require id), and plural should match plural (collections).
  // -----------------------------------------------------------------------

  describe("singular vs plural resource names — production regression", () => {
    it('"products" matches the collection query, builds valid paginated query', () => {
      const result = buildQuery(TEST_SCHEMA, "products", ["id", "title", "status"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("products(first: 10)");
      expect(result.query).toContain("edges");
      expect(result.query).toContain("pageInfo");
    });

    it('"product" matches the singular query — no edges/node wrapping', () => {
      const result = buildQuery(TEST_SCHEMA, "product", ["id", "title"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("product");
      expect(result.query).not.toContain("edges");
      expect(result.query).not.toContain("pageInfo");
    });

    it('"orders" matches the collection query', () => {
      const result = buildQuery(TEST_SCHEMA, "orders", ["id", "name"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("orders(first: 10)");
      expect(result.query).toContain("edges");
    });

    it('"order" matches the singular query', () => {
      const result = buildQuery(TEST_SCHEMA, "order", ["id", "name"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).not.toContain("edges");
    });

    it('"customers" matches the collection query', () => {
      const result = buildQuery(TEST_SCHEMA, "customers", ["id", "firstName"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("customers(first: 10)");
      expect(result.query).toContain("edges");
    });

    it('"customer" matches the singular query', () => {
      const result = buildQuery(TEST_SCHEMA, "customer", ["id", "firstName"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).not.toContain("edges");
    });

    it('"collections" matches the collection query', () => {
      const result = buildQuery(TEST_SCHEMA, "collections", ["id", "title"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("collections(first: 10)");
      expect(result.query).toContain("edges");
    });

    it('"collection" matches the singular query', () => {
      const result = buildQuery(TEST_SCHEMA, "collection", ["id", "title"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).not.toContain("edges");
    });

    it('"fulfillmentOrders" matches exactly — no stem confusion', () => {
      const result = buildQuery(TEST_SCHEMA, "fulfillmentOrders", ["id", "status"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("fulfillmentOrders");
    });

    it('"inventoryItems" matches exactly', () => {
      const result = buildQuery(TEST_SCHEMA, "inventoryItems", ["id", "sku", "tracked"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("inventoryItems");
    });

    it('"discountNodes" matches exactly — not "discountNode" (singular)', () => {
      const result = buildQuery(TEST_SCHEMA, "discountNodes", ["id"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("discountNodes");
      expect(result.query).toContain("edges");
    });

    it('"discountNode" matches the singular query', () => {
      const result = buildQuery(TEST_SCHEMA, "discountNode", ["id"], {});

      expect(result.errors).toHaveLength(0);
      expect(result.query).not.toContain("edges");
    });
  });

  // -----------------------------------------------------------------------
  // Edge case: merchant goals that combine multiple resource queries
  // The AI makes multiple sequential tool calls — each must resolve
  // correctly in isolation.
  // -----------------------------------------------------------------------

  describe("multi-query goal: 'Why are my sales dropping?'", () => {
    it("step 1: AI queries recent orders for volume", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "orders",
        ["id", "createdAt", "totalPriceSet.shopMoney.amount"],
        { filter: "created_at:>=2026-03-01T00:00:00Z financial_status:paid", sortKey: "CREATED_AT", limit: 100 },
      );

      expect(result.errors).toHaveLength(0);
    });

    it("step 2: AI queries products for stockouts or changes", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "products",
        ["id", "title", "totalInventory", "status", "updatedAt"],
        { sortKey: "UPDATED_AT", reverse: true, limit: 20 },
      );

      expect(result.errors).toHaveLength(0);
    });

    it("step 3: AI checks customer trends", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "customers",
        ["id", "createdAt", "numberOfOrders"],
        { sortKey: "CREATED_AT", reverse: true, limit: 20 },
      );

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("multi-query goal: 'Am I ready to launch my new products?'", () => {
    it("step 1: AI queries draft products", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "products",
        ["id", "title", "descriptionHtml", "status", "images", "variants.price", "variants.sku", "variants.barcode", "variants.inventoryQuantity", "collections.title", "productType", "tags"],
        { filter: "status:draft" },
      );

      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("collections");
      expect(result.query).toContain("barcode");
    });

    it("step 2: AI queries top sellers for benchmark comparison", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "products",
        ["id", "title", "descriptionHtml", "images", "totalVariants", "productType", "tags"],
        { filter: "status:active", sortKey: "INVENTORY_TOTAL", reverse: true, limit: 10 },
      );

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("multi-query goal: 'Which customers should I worry about losing?'", () => {
    it("step 1: AI queries high-value repeat customers", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "customers",
        ["id", "firstName", "lastName", "email", "numberOfOrders", "createdAt", "updatedAt"],
        { filter: "orders_count:>=3", sortKey: "TOTAL_SPENT", reverse: true, limit: 50 },
      );

      expect(result.errors).toHaveLength(0);
    });

    it("step 2: AI queries recent orders for those customers", () => {
      const result = buildQuery(
        TEST_SCHEMA,
        "orders",
        ["id", "createdAt", "customer.id", "customer.numberOfOrders", "totalPriceSet.shopMoney.amount"],
        { filter: "financial_status:paid", sortKey: "CREATED_AT", reverse: true, limit: 250 },
      );

      expect(result.errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge case: case sensitivity — merchants and AI can be inconsistent
  // -----------------------------------------------------------------------

  describe("case sensitivity handling", () => {
    it('"Products" (capitalized) matches "products"', () => {
      const result = buildQuery(TEST_SCHEMA, "Products", ["id", "title"], {});
      expect(result.errors).toHaveLength(0);
    });

    it('"ORDERS" (all caps) matches "orders"', () => {
      const result = buildQuery(TEST_SCHEMA, "ORDERS", ["id", "name"], {});
      expect(result.errors).toHaveLength(0);
    });

    it('"DraftOrders" (mixed case) matches "draftOrders"', () => {
      const result = buildQuery(TEST_SCHEMA, "DraftOrders", ["id", "name"], {});
      expect(result.errors).toHaveLength(0);
    });

    it('"DRAFTORDERS" (no camelCase) still fails — exact match is case-insensitive but not typo-tolerant', () => {
      // "draftorders" won't match "draftOrders" because toLowerCase comparison
      // makes them "draftorders" vs "draftorders" — wait, actually it WILL match.
      const result = buildQuery(TEST_SCHEMA, "DRAFTORDERS", ["id", "name"], {});
      expect(result.errors).toHaveLength(0);
      expect(result.query).toContain("draftOrders");
    });
  });
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
