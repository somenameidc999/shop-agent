#!/usr/bin/env tsx
/**
 * Test Goals Script
 *
 * Quick script to test the goal engine without running the full app.
 *
 * Usage:
 *   npx tsx scripts/test-recommendations.ts <shop-domain>
 *
 * Example:
 *   npx tsx scripts/test-recommendations.ts quickstart-64227888.myshopify.com
 */

import { analyzeGoals } from "../app/services/goals.server";
import { mcpManager } from "../app/mcp/mcpManager.server";
import prisma from "../app/db.server";

const shop = process.argv[2];

if (!shop) {
  console.error("Error: Shop domain required");
  console.error("Usage: npx tsx scripts/test-recommendations.ts <shop-domain>");
  process.exit(1);
}

async function testGoals() {
  console.log("Testing Goal Engine");
  console.log("===================\n");

  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shop },
    });

    if (!shopRecord) {
      console.error(`Shop "${shop}" not found in database`);
      console.error("Available shops:");
      const shops = await prisma.shop.findMany({ select: { shop: true } });
      shops.forEach((s) => console.error(`  - ${s.shop}`));
      process.exit(1);
    }

    console.log(`Found shop: ${shop}\n`);

    console.log("Initializing MCP manager...");
    await mcpManager.ensureInitialized(shop);

    const status = mcpManager.getFullStatus();
    console.log(`MCP manager initialized`);
    console.log(`  Connected servers: ${status.servers.filter((s) => s.connected).length}`);
    console.log(`  Total servers: ${status.servers.length}\n`);

    status.servers.forEach((server) => {
      const icon = server.connected ? "+" : "-";
      console.log(`  ${icon} ${server.name} (${server.serverType})`);
      if (server.connected) {
        console.log(`    Tools: ${server.tools.join(", ")}`);
      }
    });
    console.log();

    const goals = await prisma.goal.findMany({
      where: { shop, enabled: true },
    });

    console.log(`Found ${goals.length} enabled goals:`);
    goals.forEach((goal) => {
      console.log(`  - ${goal.ruleKey} (${goal.category}, ${goal.priority})`);
      console.log(`    Required servers: ${goal.requiredServers || "none"}`);
    });
    console.log();

    console.log("Analyzing goals...\n");
    const result = await analyzeGoals(shop);

    console.log("Analysis complete!");
    console.log(`  Processed goals: ${result.processedGoals}`);
    console.log(`  Results:`);
    result.results.forEach((r) => {
      const icon = r.status === "created" ? "+" : "-";
      console.log(`    ${icon} ${r.ruleKey}: ${r.status}`);
      if (r.status === "error" && "error" in r) {
        console.log(`      Error: ${r.error}`);
      }
      if (r.status === "created" && "executionId" in r) {
        console.log(`      Execution ID: ${r.executionId}`);
      }
    });
    console.log();

    const executions = await prisma.goalExecution.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    console.log(`Latest goal executions for ${shop}:`);
    if (executions.length === 0) {
      console.log("  (none)");
    } else {
      executions.forEach((exec) => {
        console.log(`  - [${exec.status}] ${exec.title}`);
        console.log(`    ${exec.description}`);
        console.log(`    Category: ${exec.category}, Priority: ${exec.priority}`);
        console.log(`    Created: ${exec.createdAt.toISOString()}`);
        console.log();
      });
    }

    console.log("Test complete!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await mcpManager.shutdown();
    await prisma.$disconnect();
  }
}

testGoals();
