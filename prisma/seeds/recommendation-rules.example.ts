/**
 * Example Goal Seed
 *
 * This file shows how to seed initial goals into the database.
 * Copy this file and customize the goals for your specific use case.
 *
 * To run: npx tsx prisma/seeds/recommendation-rules.example.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOP = "quickstart-64227888.myshopify.com";

const exampleGoals = [
  {
    ruleKey: "slow-database-queries",
    title: "Slow Database Queries Detected",
    description: "Performance optimization opportunity",
    category: "reporting",
    priority: "high",
    requiredServers: JSON.stringify(["postgres__default"]),
    analysisPrompt: `Check if:
1. Use the postgres query tool to check for slow queries
2. Look for queries taking longer than 2 seconds
3. Identify which tables/operations are affected
If slow queries are found, recommend optimization.`,
    actionPrompt: `Review the slow queries identified. Create appropriate indexes using postgres query tool. Verify the indexes were created successfully. Provide a summary of what was optimized.`,
    cronIntervalMins: 240,
  },
  {
    ruleKey: "low-inventory-products",
    title: "Low Inventory Alert",
    description: "Products running low on inventory",
    category: "inventory",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `Check if:
1. Use shopify_query with resource="products", fields=["id","title","totalInventory"], limit=20
2. Identify products with inventory below 10 units
If low inventory products are found, recommend restocking.`,
    actionPrompt: `List all products with inventory below 10 units. Provide recommended reorder quantities based on current levels. Prioritize by how low the stock is.`,
    cronIntervalMins: 60,
  },
];

async function seedGoals() {
  console.log("Seeding example goals...");

  for (const goal of exampleGoals) {
    await prisma.goal.upsert({
      where: { shop_ruleKey: { shop: SHOP, ruleKey: goal.ruleKey } },
      update: { ...goal, shop: SHOP },
      create: { ...goal, shop: SHOP },
    });
    console.log(`  Seeded goal: ${goal.ruleKey}`);
  }

  console.log(`Seeded ${exampleGoals.length} example goals`);
}

seedGoals()
  .catch((error) => {
    console.error("Error seeding goals:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
