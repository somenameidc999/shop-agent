/**
 * Goals Service — Batch Operations, Undismiss, Dry Run, Dashboard Stats
 *
 * Tests for all new enhancement functions added to goals.server.ts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    goalExecution: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
    goalExecutionGoal: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    backgroundJob: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../app/mcp/mcpManager.server", () => ({
  mcpManager: {
    ensureInitialized: vi.fn(),
    getFullStatus: vi.fn(),
    getToolsForAI: vi.fn(),
  },
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(),
}));

vi.mock("../../app/jobs/scheduler.server", () => ({
  enqueueGoalExecution: vi.fn(),
  enqueueDelayedOutcomeMeasurement: vi.fn(),
}));

import prisma from "../../app/db.server";
import { mcpManager } from "../../app/mcp/mcpManager.server";
import { generateText } from "ai";
import {
  batchExecuteGoalExecutions,
  batchDismissGoalExecutions,
  undismissGoalExecution,
  getRecentlyDismissedExecutions,
  dryRunGoalExecution,
  getDashboardStats,
  dismissGoalExecution,
} from "../../app/services/goals.server";

const mockPrisma = vi.mocked(prisma);
const mockMcpManager = vi.mocked(mcpManager);
const mockGenerateText = vi.mocked(generateText);

function makeExec(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-1",
    shop: "test.myshopify.com",
    goalId: "goal-1",
    title: "Test Execution",
    description: "A test",
    category: "inventory",
    priority: "medium",
    actionPrompt: "do something",
    mcpServersUsed: "shopify",
    metadata: null,
    status: "new",
    resultSummary: null,
    impactScore: null,
    confidenceLevel: null,
    estimatedRevenue: null,
    estimatedConversionLift: null,
    estimatedAovImpact: null,
    impactReasoning: null,
    actionSteps: null,
    outcomeStatus: null,
    outcomeData: null,
    outcomeMeasuredAt: null,
    baselineData: null,
    expiresAt: null,
    executedAt: null,
    dismissedAt: null,
    dismissedBy: null,
    dryRunResult: null,
    customParameters: null,
    triggerSource: null,
    webhookEventType: null,
    escalatedAt: null,
    feedbackRating: null,
    feedbackNote: null,
    compositeScore: null,
    createdAt: new Date("2026-02-28T00:00:00Z"),
    updatedAt: new Date("2026-02-28T00:00:00Z"),
    goalExecutionLinks: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// batchDismissGoalExecutions
// ---------------------------------------------------------------------------

describe("batchDismissGoalExecutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses multiple executions at once", async () => {
    mockPrisma.goalExecution.updateMany.mockResolvedValue({ count: 3 } as any);

    const count = await batchDismissGoalExecutions(
      "test.myshopify.com",
      ["exec-1", "exec-2", "exec-3"],
    );

    expect(count).toBe(3);
    expect(mockPrisma.goalExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["exec-1", "exec-2", "exec-3"] },
          shop: "test.myshopify.com",
          status: "new",
        },
        data: expect.objectContaining({
          status: "dismissed",
          dismissedBy: "batch",
        }),
      }),
    );
  });

  it("sets dismissedAt timestamp", async () => {
    mockPrisma.goalExecution.updateMany.mockResolvedValue({ count: 1 } as any);

    await batchDismissGoalExecutions("test.myshopify.com", ["exec-1"]);

    const call = (mockPrisma.goalExecution.updateMany as Mock).mock.calls[0][0];
    expect(call.data.dismissedAt).toBeInstanceOf(Date);
  });

  it("returns 0 when no executions match", async () => {
    mockPrisma.goalExecution.updateMany.mockResolvedValue({ count: 0 } as any);

    const count = await batchDismissGoalExecutions("test.myshopify.com", ["nonexistent"]);

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// undismissGoalExecution
// ---------------------------------------------------------------------------

describe("undismissGoalExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores a recently dismissed execution to new status", async () => {
    const dismissed = makeExec({
      id: "exec-undo",
      status: "dismissed",
      dismissedAt: new Date(), // just now
    });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(dismissed as any);
    mockPrisma.goalExecution.update.mockResolvedValue(
      makeExec({ id: "exec-undo", status: "new", dismissedAt: null }) as any,
    );

    const result = await undismissGoalExecution("exec-undo", "test.myshopify.com");

    expect(result.status).toBe("new");
    expect(mockPrisma.goalExecution.update).toHaveBeenCalledWith({
      where: { id: "exec-undo" },
      data: {
        status: "new",
        dismissedAt: null,
        dismissedBy: null,
      },
    });
  });

  it("throws when execution not found", async () => {
    mockPrisma.goalExecution.findUnique.mockResolvedValue(null);

    await expect(
      undismissGoalExecution("nonexistent", "test.myshopify.com"),
    ).rejects.toThrow("GoalExecution not found");
  });

  it("throws when execution belongs to different shop", async () => {
    const exec = makeExec({ shop: "other.myshopify.com", status: "dismissed" });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);

    await expect(
      undismissGoalExecution("exec-1", "test.myshopify.com"),
    ).rejects.toThrow("GoalExecution not found");
  });

  it("throws when execution is not dismissed", async () => {
    const exec = makeExec({ status: "new" });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);

    await expect(
      undismissGoalExecution("exec-1", "test.myshopify.com"),
    ).rejects.toThrow("GoalExecution is not dismissed");
  });

  it("throws when dismissed more than 30 minutes ago", async () => {
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    const exec = makeExec({
      status: "dismissed",
      dismissedAt: thirtyFiveMinutesAgo,
    });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);

    await expect(
      undismissGoalExecution("exec-1", "test.myshopify.com"),
    ).rejects.toThrow("Cannot undo dismiss after 30 minutes");
  });
});

// ---------------------------------------------------------------------------
// getRecentlyDismissedExecutions
// ---------------------------------------------------------------------------

describe("getRecentlyDismissedExecutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries dismissed executions since the given date", async () => {
    const since = new Date("2026-03-10T00:00:00Z");
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    await getRecentlyDismissedExecutions("test.myshopify.com", since);

    const call = (mockPrisma.goalExecution.findMany as Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({
      shop: "test.myshopify.com",
      status: "dismissed",
      dismissedAt: { gte: since },
    });
    expect(call.orderBy).toEqual({ dismissedAt: "desc" });
  });

  it("returns executions with linked goals", async () => {
    const dismissed = [
      makeExec({
        id: "d-1",
        status: "dismissed",
        dismissedAt: new Date(),
        goalExecutionLinks: [
          { goal: { id: "g-1", title: "Goal 1", ruleKey: "rule-1", category: "inventory" } },
        ],
      }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(dismissed as any);

    const result = await getRecentlyDismissedExecutions(
      "test.myshopify.com",
      new Date("2026-03-10T00:00:00Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d-1");
  });
});

// ---------------------------------------------------------------------------
// dismissGoalExecution (updated with dismissedAt/dismissedBy)
// ---------------------------------------------------------------------------

describe("dismissGoalExecution (enhanced)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets dismissedAt and dismissedBy fields", async () => {
    mockPrisma.goalExecution.update.mockResolvedValue(
      makeExec({ status: "dismissed", dismissedAt: new Date(), dismissedBy: "manual" }) as any,
    );

    await dismissGoalExecution("exec-1");

    const call = (mockPrisma.goalExecution.update as Mock).mock.calls[0][0];
    expect(call.data.status).toBe("dismissed");
    expect(call.data.dismissedAt).toBeInstanceOf(Date);
    expect(call.data.dismissedBy).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// dryRunGoalExecution
// ---------------------------------------------------------------------------

describe("dryRunGoalExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when execution not found", async () => {
    mockPrisma.goalExecution.findUnique.mockResolvedValue(null);

    await expect(dryRunGoalExecution("nonexistent")).rejects.toThrow(
      "GoalExecution nonexistent not found",
    );
  });

  it("runs AI with read-only tool filtering and returns preview", async () => {
    const exec = makeExec({
      id: "dry-1",
      goal: {
        id: "goal-1",
        outcomeMeasureDays: 7,
      },
    });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);
    mockMcpManager.ensureInitialized.mockResolvedValue(undefined);
    mockMcpManager.getToolsForAI.mockResolvedValue({
      shopify_query: { description: "Query" },
      shopify_find: { description: "Find" },
      shopify_graphql: { description: "GraphQL mutations" },
      shopify_execute: { description: "Execute" },
    } as any);
    mockPrisma.goalExecution.update.mockResolvedValue(exec as any);

    mockGenerateText.mockResolvedValue({
      text: "Would update 3 product prices to improve margins",
    } as any);

    const result = await dryRunGoalExecution("dry-1");

    expect(result.preview).toBe("Would update 3 product prices to improve margins");

    // Verify graphql and execute tools were filtered out
    const aiCall = mockGenerateText.mock.calls[0][0] as any;
    if (aiCall.tools) {
      const toolNames = Object.keys(aiCall.tools);
      expect(toolNames).toContain("shopify_query");
      expect(toolNames).toContain("shopify_find");
      expect(toolNames).not.toContain("shopify_graphql");
      expect(toolNames).not.toContain("shopify_execute");
    }
  });

  it("caches the dry run result in the database", async () => {
    const exec = makeExec({ id: "cache-1", goal: { id: "g1", outcomeMeasureDays: 7 } });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);
    mockMcpManager.ensureInitialized.mockResolvedValue(undefined);
    mockMcpManager.getToolsForAI.mockResolvedValue({} as any);
    mockPrisma.goalExecution.update.mockResolvedValue(exec as any);

    mockGenerateText.mockResolvedValue({ text: "Preview result" } as any);

    await dryRunGoalExecution("cache-1");

    expect(mockPrisma.goalExecution.update).toHaveBeenCalledWith({
      where: { id: "cache-1" },
      data: { dryRunResult: "Preview result" },
    });
  });
});

// ---------------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------------

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct stats structure with empty data", async () => {
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    const stats = await getDashboardStats("test.myshopify.com");

    expect(stats).toEqual({
      revenueOpportunity: 0,
      successRate: 0,
      measuredImpact: 0,
      executedCount: 0,
      errorCount: 0,
      pendingCount: 0,
      highConfidenceCount: 0,
      trends: expect.any(Array),
      goalHealth: [],
      measuredCount: 0,
    });
  });

  it("calculates revenue opportunity from pending executions", async () => {
    const execs = [
      makeExec({
        id: "e1",
        status: "new",
        estimatedRevenue: JSON.stringify({ min: 100, max: 300 }),
      }),
      makeExec({
        id: "e2",
        status: "new",
        estimatedRevenue: JSON.stringify({ min: 200, max: 400 }),
      }),
      makeExec({
        id: "e3",
        status: "executed",
        estimatedRevenue: JSON.stringify({ min: 1000, max: 2000 }),
      }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const stats = await getDashboardStats("test.myshopify.com");

    // Only pending (new) executions: (100+300)/2 + (200+400)/2 = 200 + 300 = 500
    expect(stats.revenueOpportunity).toBe(500);
  });

  it("calculates success rate from executed vs errored", async () => {
    const execs = [
      makeExec({ id: "e1", status: "executed" }),
      makeExec({ id: "e2", status: "executed" }),
      makeExec({ id: "e3", status: "executed" }),
      makeExec({ id: "e4", status: "error" }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const stats = await getDashboardStats("test.myshopify.com");

    expect(stats.successRate).toBe(0.75); // 3/(3+1)
    expect(stats.executedCount).toBe(3);
    expect(stats.errorCount).toBe(1);
  });

  it("calculates measured impact from outcome data", async () => {
    const execs = [
      makeExec({
        id: "e1",
        status: "executed",
        outcomeStatus: "measured",
        outcomeData: JSON.stringify({ revenueDelta: 500 }),
      }),
      makeExec({
        id: "e2",
        status: "executed",
        outcomeStatus: "measured",
        outcomeData: JSON.stringify({ revenueDelta: -100 }),
      }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const stats = await getDashboardStats("test.myshopify.com");

    expect(stats.measuredImpact).toBe(400); // 500 + (-100)
    expect(stats.measuredCount).toBe(2);
  });

  it("counts high-confidence pending executions", async () => {
    const execs = [
      makeExec({ id: "e1", status: "new", confidenceLevel: "high" }),
      makeExec({ id: "e2", status: "new", confidenceLevel: "high" }),
      makeExec({ id: "e3", status: "new", confidenceLevel: "medium" }),
      makeExec({ id: "e4", status: "executed", confidenceLevel: "high" }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const stats = await getDashboardStats("test.myshopify.com");

    expect(stats.highConfidenceCount).toBe(2); // Only pending + high
  });

  it("calculates goal health scores", async () => {
    const execs = [
      makeExec({ id: "e1", goalId: "g1", status: "executed" }),
      makeExec({ id: "e2", goalId: "g1", status: "executed" }),
      makeExec({ id: "e3", goalId: "g1", status: "dismissed" }),
      makeExec({ id: "e4", goalId: "g2", status: "dismissed" }),
    ];
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const stats = await getDashboardStats("test.myshopify.com");

    const g1 = stats.goalHealth.find((g) => g.goalId === "g1");
    expect(g1?.executed).toBe(2);
    expect(g1?.dismissed).toBe(1);
    expect(g1?.healthScore).toBeCloseTo(2 / 3); // 2 executed out of 3 total

    const g2 = stats.goalHealth.find((g) => g.goalId === "g2");
    expect(g2?.healthScore).toBe(0); // 0 executed out of 1
  });

  it("generates 4 weekly trend buckets", async () => {
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    const stats = await getDashboardStats("test.myshopify.com");

    expect(stats.trends).toHaveLength(4);
    stats.trends.forEach((t) => {
      expect(t).toHaveProperty("week");
      expect(t).toHaveProperty("created");
      expect(t).toHaveProperty("executed");
    });
  });
});
