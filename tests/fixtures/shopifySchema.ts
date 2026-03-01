/**
 * Minimal Shopify Admin API schema fixture for unit testing.
 *
 * Mirrors the real introspection output structure (CompactSchema) with
 * just enough types to test all buildQuery code paths:
 *   - Connection queries (products, orders, customers, draftOrders)
 *   - Scalar fields, object fields, connection sub-fields
 *   - Sort key enums per query
 *   - Nested types (MoneyBag, MoneyV2, Image, etc.)
 */

import type { CompactSchema } from "../../app/mcp/servers/shopify/queryBuilder";

export const TEST_SCHEMA: CompactSchema = {
  apiVersion: "2025-10",
  queries: [
    {
      name: "products",
      description: "List of products.",
      args: [
        { name: "first", type: "Int", description: "" },
        { name: "query", type: "String", description: "" },
        { name: "sortKey", type: "ProductSortKeys", description: "" },
        { name: "reverse", type: "Boolean", description: "" },
      ],
      returnType: "ProductConnection!",
    },
    {
      name: "orders",
      description: "List of orders.",
      args: [
        { name: "first", type: "Int", description: "" },
        { name: "query", type: "String", description: "" },
        { name: "sortKey", type: "OrderSortKeys", description: "" },
        { name: "reverse", type: "Boolean", description: "" },
      ],
      returnType: "OrderConnection!",
    },
    {
      name: "customers",
      description: "List of customers.",
      args: [
        { name: "first", type: "Int", description: "" },
        { name: "query", type: "String", description: "" },
        { name: "sortKey", type: "CustomerSortKeys", description: "" },
        { name: "reverse", type: "Boolean", description: "" },
      ],
      returnType: "CustomerConnection!",
    },
    {
      name: "draftOrders",
      description: "List of draft orders.",
      args: [
        { name: "first", type: "Int", description: "" },
        { name: "query", type: "String", description: "" },
        { name: "sortKey", type: "DraftOrderSortKeys", description: "" },
        { name: "reverse", type: "Boolean", description: "" },
      ],
      returnType: "DraftOrderConnection!",
    },
    {
      name: "shop",
      description: "The shop.",
      args: [],
      returnType: "Shop!",
    },
  ],
  mutations: [
    {
      name: "productCreate",
      description: "Creates a product.",
      args: [
        { name: "input", type: "ProductInput!", description: "" },
      ],
      returnType: "ProductCreatePayload",
    },
  ],
  types: [
    // -- Sort key enums --
    {
      name: "ProductSortKeys",
      kind: "ENUM",
      description: "",
      enumValues: ["TITLE", "PRODUCT_TYPE", "VENDOR", "INVENTORY_TOTAL", "UPDATED_AT", "CREATED_AT", "PUBLISHED_AT", "ID", "RELEVANCE"],
    },
    {
      name: "OrderSortKeys",
      kind: "ENUM",
      description: "",
      enumValues: ["PROCESSED_AT", "TOTAL_PRICE", "CREATED_AT", "UPDATED_AT", "FINANCIAL_STATUS", "FULFILLMENT_STATUS", "ORDER_NUMBER", "ID", "RELEVANCE"],
    },
    {
      name: "CustomerSortKeys",
      kind: "ENUM",
      description: "",
      enumValues: ["NAME", "LOCATION", "ORDERS_COUNT", "LAST_ORDER_DATE", "TOTAL_SPENT", "UPDATED_AT", "CREATED_AT", "ID", "RELEVANCE"],
    },
    {
      name: "DraftOrderSortKeys",
      kind: "ENUM",
      description: "",
      enumValues: ["NUMBER", "UPDATED_AT", "STATUS", "TOTAL_PRICE", "ID", "RELEVANCE"],
    },
    // -- Connection types --
    {
      name: "ProductConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[ProductEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "ProductEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "Product!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "OrderConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[OrderEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "OrderEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "Order!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "CustomerConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[CustomerEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "CustomerEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "Customer!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "DraftOrderConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[DraftOrderEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "DraftOrderEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "DraftOrder!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "PageInfo",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "hasNextPage", type: "Boolean!", description: "" },
        { name: "endCursor", type: "String", description: "" },
      ],
    },
    // -- Node types --
    {
      name: "Product",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "title", type: "String!", description: "" },
        { name: "handle", type: "String!", description: "" },
        { name: "status", type: "ProductStatus!", description: "" },
        { name: "vendor", type: "String!", description: "" },
        { name: "productType", type: "String!", description: "" },
        { name: "tags", type: "[String!]!", description: "" },
        { name: "totalInventory", type: "Int!", description: "" },
        { name: "createdAt", type: "DateTime!", description: "" },
        { name: "updatedAt", type: "DateTime!", description: "" },
        { name: "publishedAt", type: "DateTime", description: "" },
        { name: "description", type: "String!", description: "" },
        { name: "descriptionHtml", type: "HTML!", description: "" },
        { name: "featuredMedia", type: "Media", description: "" },
        { name: "variants", type: "ProductVariantConnection!", description: "" },
        { name: "images", type: "ImageConnection!", description: "" },
        { name: "priceRangeV2", type: "ProductPriceRangeV2!", description: "" },
        { name: "totalVariants", type: "Int!", description: "" },
        { name: "tracksInventory", type: "Boolean!", description: "" },
      ],
    },
    {
      name: "Order",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "name", type: "String!", description: "" },
        { name: "createdAt", type: "DateTime!", description: "" },
        { name: "updatedAt", type: "DateTime!", description: "" },
        { name: "displayFulfillmentStatus", type: "OrderDisplayFulfillmentStatus!", description: "" },
        { name: "displayFinancialStatus", type: "OrderDisplayFinancialStatus", description: "" },
        { name: "totalPriceSet", type: "MoneyBag!", description: "" },
        { name: "subtotalPriceSet", type: "MoneyBag!", description: "" },
        { name: "lineItems", type: "LineItemConnection!", description: "" },
        { name: "customer", type: "Customer", description: "" },
        { name: "email", type: "String", description: "" },
        { name: "note", type: "String", description: "" },
        { name: "tags", type: "[String!]!", description: "" },
      ],
    },
    {
      name: "Customer",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "firstName", type: "String", description: "" },
        { name: "lastName", type: "String", description: "" },
        { name: "email", type: "String", description: "" },
        { name: "phone", type: "String", description: "" },
        { name: "numberOfOrders", type: "UnsignedInt64!", description: "" },
        { name: "createdAt", type: "DateTime!", description: "" },
        { name: "updatedAt", type: "DateTime!", description: "" },
        { name: "tags", type: "[String!]!", description: "" },
        { name: "state", type: "CustomerState!", description: "" },
      ],
    },
    {
      name: "DraftOrder",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "name", type: "String!", description: "" },
        { name: "createdAt", type: "DateTime!", description: "" },
        { name: "updatedAt", type: "DateTime!", description: "" },
        { name: "status", type: "DraftOrderStatus!", description: "" },
        { name: "totalPrice", type: "String!", description: "" },
        { name: "lineItems", type: "DraftOrderLineItemConnection!", description: "" },
        { name: "customer", type: "Customer", description: "" },
      ],
    },
    {
      name: "Shop",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "name", type: "String!", description: "" },
        { name: "email", type: "String!", description: "" },
        { name: "myshopifyDomain", type: "String!", description: "" },
        { name: "plan", type: "ShopPlan!", description: "" },
        { name: "currencyCode", type: "CurrencyCode!", description: "" },
      ],
    },
    // -- Nested object types --
    {
      name: "MoneyBag",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "shopMoney", type: "MoneyV2!", description: "" },
        { name: "presentmentMoney", type: "MoneyV2!", description: "" },
      ],
    },
    {
      name: "MoneyV2",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "amount", type: "Decimal!", description: "" },
        { name: "currencyCode", type: "CurrencyCode!", description: "" },
      ],
    },
    {
      name: "ProductVariantConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[ProductVariantEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "ProductVariantEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "ProductVariant!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "ProductVariant",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "title", type: "String!", description: "" },
        { name: "price", type: "Money!", description: "" },
        { name: "sku", type: "String", description: "" },
        { name: "inventoryPolicy", type: "ProductVariantInventoryPolicy!", description: "" },
        { name: "inventoryQuantity", type: "Int", description: "" },
        { name: "barcode", type: "String", description: "" },
        { name: "compareAtPrice", type: "Money", description: "" },
        { name: "weight", type: "Float", description: "" },
      ],
    },
    {
      name: "ImageConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[ImageEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "ImageEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "Image!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "Image",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "url", type: "URL!", description: "" },
        { name: "altText", type: "String", description: "" },
        { name: "width", type: "Int", description: "" },
        { name: "height", type: "Int", description: "" },
      ],
    },
    {
      name: "ProductPriceRangeV2",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "minVariantPrice", type: "MoneyV2!", description: "" },
        { name: "maxVariantPrice", type: "MoneyV2!", description: "" },
      ],
    },
    {
      name: "LineItemConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[LineItemEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "LineItemEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "LineItem!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "LineItem",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "title", type: "String!", description: "" },
        { name: "quantity", type: "Int!", description: "" },
      ],
    },
    {
      name: "DraftOrderLineItemConnection",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "edges", type: "[DraftOrderLineItemEdge!]!", description: "" },
        { name: "pageInfo", type: "PageInfo!", description: "" },
      ],
    },
    {
      name: "DraftOrderLineItemEdge",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "node", type: "DraftOrderLineItem!", description: "" },
        { name: "cursor", type: "String!", description: "" },
      ],
    },
    {
      name: "DraftOrderLineItem",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "id", type: "ID!", description: "" },
        { name: "title", type: "String!", description: "" },
        { name: "quantity", type: "Int!", description: "" },
      ],
    },
    {
      name: "ProductCreatePayload",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "product", type: "Product", description: "" },
        { name: "userErrors", type: "[UserError!]!", description: "" },
      ],
    },
    {
      name: "UserError",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "field", type: "[String!]", description: "" },
        { name: "message", type: "String!", description: "" },
      ],
    },
    {
      name: "ShopPlan",
      kind: "OBJECT",
      description: "",
      fields: [
        { name: "displayName", type: "String!", description: "" },
        { name: "partnerDevelopment", type: "Boolean!", description: "" },
        { name: "shopifyPlus", type: "Boolean!", description: "" },
      ],
    },
  ],
};
