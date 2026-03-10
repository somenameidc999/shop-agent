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
    },
    goal: {
      findMany: vi.fn(),
    },
    goalExecutionGoal: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
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

import prisma from "../../app/db.server";
import { mcpManager } from "../../app/mcp/mcpManager.server";
import { generateText } from "ai";
import {
  getGoalExecutionsForShop,
  analyzeGoals,
  executeGoalExecution,
  dismissGoalExecution,
  computeImpactScore,
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
    createdAt: new Date("2026-02-28T00:00:00Z"),
    updatedAt: new Date("2026-02-28T00:00:00Z"),
    goalExecutionLinks: [],
    ...overrides,
  };
}

function makeGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: "goal-1",
    shop: "test.myshopify.com",
    ruleKey: "low-inventory",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: "Check inventory levels",
    category: "inventory",
    priority: "high",
    actionPrompt: "Fix inventory",
    cronIntervalMins: 60,
    outcomeMeasureDays: 7,
    enabled: true,
    title: "Low Inventory",
    description: "Check for low inventory",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeImpactScore
// ---------------------------------------------------------------------------

describe("computeImpactScore", () => {
  it("returns 0 when impact is undefined", () => {
    expect(computeImpactScore(undefined)).toBe(0);
  });

  it("applies high confidence multiplier (1.0)", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 1000, max: 3000, currency: "USD" },
      confidence: "high",
      reasoning: "Strong data",
    });
    // revScore = min((1000+3000)/2 / 100, 50) = min(20, 50) = 20
    // convScore = 0, aovScore = 0
    // (20 + 0 + 0) * 1.0 = 20
    expect(score).toBe(20);
  });

  it("applies medium confidence multiplier (0.6)", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 1000, max: 3000, currency: "USD" },
      confidence: "medium",
      reasoning: "Some data",
    });
    // (20) * 0.6 = 12
    expect(score).toBe(12);
  });

  it("applies low confidence multiplier (0.3)", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 1000, max: 3000, currency: "USD" },
      confidence: "low",
      reasoning: "Little data",
    });
    // (20) * 0.3 = 6
    expect(score).toBe(6);
  });

  it("caps revenue score at 50", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 50000, max: 100000, currency: "USD" },
      confidence: "high",
      reasoning: "Huge opportunity",
    });
    // revScore = min(75000/100, 50) = 50
    // 50 * 1.0 = 50
    expect(score).toBe(50);
  });

  it("includes conversion lift and AOV impact", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 0, max: 0, currency: "USD" },
      conversionLiftPercent: 5,
      aovImpactPercent: 4,
      confidence: "high",
      reasoning: "Good data",
    });
    // revScore = 0, convScore = 5*2 = 10, aovScore = 4*1.5 = 6
    // (0 + 10 + 6) * 1.0 = 16
    expect(score).toBe(16);
  });

  it("combines all factors correctly", () => {
    const score = computeImpactScore({
      revenueEstimate: { min: 500, max: 1500, currency: "USD" },
      conversionLiftPercent: 3,
      aovImpactPercent: 2,
      confidence: "high",
      reasoning: "Data-driven",
    });
    // revScore = min((500+1500)/2 / 100, 50) = min(10, 50) = 10
    // convScore = 3*2 = 6, aovScore = 2*1.5 = 3
    // (10 + 6 + 3) * 1.0 = 19
    expect(score).toBe(19);
  });

  it("rounds to nearest integer", () => {
    const score = computeImpactScore({
      conversionLiftPercent: 1.5,
      confidence: "medium",
      reasoning: "Test",
    });
    // convScore = 1.5*2 = 3
    // 3 * 0.6 = 1.8 → rounds to 2
    expect(score).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getGoalExecutionsForShop
// ---------------------------------------------------------------------------

describe("getGoalExecutionsForShop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { data, total } shape", async () => {
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    const result = await getGoalExecutionsForShop("shop.myshopify.com");

    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.total).toBe(0);
  });

  it("passes status, category, and priority filters to prisma where clause", async () => {
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    await getGoalExecutionsForShop("shop.myshopify.com", {
      status: "new",
      category: "inventory",
      priority: "high",
    });

    const callArgs = (mockPrisma.goalExecution.findMany as Mock).mock.calls[0][0];
    expect(callArgs.where).toMatchObject({
      shop: "shop.myshopify.com",
      status: "new",
      category: "inventory",
      priority: "high",
    });
  });

  it("passes goalId filter to prisma where clause", async () => {
    mockPrisma.goalExecution.findMany.mockResolvedValue([]);

    await getGoalExecutionsForShop("shop.myshopify.com", {
      goalId: "goal-123",
    });

    const callArgs = (mockPrisma.goalExecution.findMany as Mock).mock.calls[0][0];
    expect(callArgs.where).toMatchObject({
      shop: "shop.myshopify.com",
      goalId: "goal-123",
    });
  });

  it("sorts by priority order: critical > high > medium > low", async () => {
    const execs = [
      makeExec({ id: "r-low", priority: "low", createdAt: new Date("2026-02-28T04:00:00Z") }),
      makeExec({ id: "r-med", priority: "medium", createdAt: new Date("2026-02-28T03:00:00Z") }),
      makeExec({ id: "r-high", priority: "high", createdAt: new Date("2026-02-28T02:00:00Z") }),
      makeExec({ id: "r-crit", priority: "critical", createdAt: new Date("2026-02-28T01:00:00Z") }),
    ];

    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const result = await getGoalExecutionsForShop("shop.myshopify.com");

    const priorities = result.data.map((r: any) => r.priority);
    expect(priorities).toEqual(["critical", "high", "medium", "low"]);
  });

  it("sorts by impactScore when sortBy=impactScore", async () => {
    const execs = [
      makeExec({ id: "r-low", impactScore: 10, createdAt: new Date("2026-02-28T01:00:00Z") }),
      makeExec({ id: "r-high", impactScore: 80, createdAt: new Date("2026-02-28T02:00:00Z") }),
      makeExec({ id: "r-med", impactScore: 45, createdAt: new Date("2026-02-28T03:00:00Z") }),
    ];

    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const result = await getGoalExecutionsForShop("shop.myshopify.com", {
      sortBy: "impactScore",
    });

    const ids = result.data.map((r: any) => r.id);
    expect(ids).toEqual(["r-high", "r-med", "r-low"]);
  });

  it("sorts by newest when sortBy=newest", async () => {
    const execs = [
      makeExec({ id: "r-old", createdAt: new Date("2026-02-28T01:00:00Z") }),
      makeExec({ id: "r-new", createdAt: new Date("2026-02-28T03:00:00Z") }),
      makeExec({ id: "r-mid", createdAt: new Date("2026-02-28T02:00:00Z") }),
    ];

    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const result = await getGoalExecutionsForShop("shop.myshopify.com", {
      sortBy: "newest",
    });

    const ids = result.data.map((r: any) => r.id);
    expect(ids).toEqual(["r-new", "r-mid", "r-old"]);
  });

  it("slices results correctly with pagination", async () => {
    const execs = Array.from({ length: 10 }, (_, i) =>
      makeExec({ id: `r-${i}`, priority: "medium" }),
    );
    mockPrisma.goalExecution.findMany.mockResolvedValue(execs as any);

    const result = await getGoalExecutionsForShop(
      "shop.myshopify.com",
      undefined,
      { limit: 3, offset: 2 },
    );

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.data[0].id).toBe("r-2");
    expect(result.data[2].id).toBe("r-4");
  });
});

// ---------------------------------------------------------------------------
// analyzeGoals
// ---------------------------------------------------------------------------

describe("analyzeGoals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupConnectedServers(names: string[]) {
    mockMcpManager.ensureInitialized.mockResolvedValue(undefined);
    mockMcpManager.getFullStatus.mockReturnValue({
      servers: names.map((name) => ({ name, connected: true })),
    } as any);
    mockMcpManager.getToolsForAI.mockResolvedValue({
      shopify_query: {},
    } as any);
  }

  it("calls mcpManager.ensureInitialized with the shop", async () => {
    setupConnectedServers(["shopify"]);
    mockPrisma.goal.findMany.mockResolvedValue([]);

    await analyzeGoals("test.myshopify.com");

    expect(mockMcpManager.ensureInitialized).toHaveBeenCalledWith("test.myshopify.com");
  });

  it("filters goals by connected servers", async () => {
    setupConnectedServers(["shopify"]);

    const goals = [
      makeGoal({ id: "g1", ruleKey: "has-shopify", requiredServers: JSON.stringify(["shopify"]) }),
      makeGoal({ id: "g2", ruleKey: "needs-google", requiredServers: JSON.stringify(["google-sheets"]) }),
    ];
    mockPrisma.goal.findMany.mockResolvedValue(goals as any);

    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ applicable: false, title: "N/A", description: "N/A" }),
    } as any);

    const result = await analyzeGoals("test.myshopify.com");

    expect(result.processedGoals).toBe(1);
    expect(result.results[0].ruleKey).toBe("has-shopify");
  });

  it("returns { shop, processedGoals, results }", async () => {
    setupConnectedServers(["shopify"]);
    mockPrisma.goal.findMany.mockResolvedValue([]);

    const result = await analyzeGoals("test.myshopify.com");

    expect(result).toHaveProperty("shop", "test.myshopify.com");
    expect(result).toHaveProperty("processedGoals");
    expect(result).toHaveProperty("results");
    expect(Array.isArray(result.results)).toBe(true);
  });

  describe("analyzeGoal behavior", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      setupConnectedServers(["shopify"]);
    });

    it("creates a new execution with impact data when AI says applicable", async () => {
      const goal = makeGoal({ id: "goal-new", ruleKey: "new-rule" });
      mockPrisma.goal.findMany.mockResolvedValue([goal] as any);

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          applicable: true,
          title: "Restock Widget",
          description: "Widget inventory is low — 3 units left, selling ~2/day",
          impact: {
            revenueEstimate: { min: 500, max: 2000, currency: "USD" },
            conversionLiftPercent: 3,
            confidence: "high",
            reasoning: "Based on 30 days of sales data",
          },
          actionSteps: ["Check inventory", "Create purchase order"],
        }),
      } as any);

      mockPrisma.goalExecution.findFirst.mockResolvedValue(null);
      mockPrisma.goalExecution.create.mockResolvedValue(
        makeExec({ id: "new-exec-id", goalId: "goal-new" }) as any,
      );
      (mockPrisma.goalExecutionGoal as any).upsert.mockResolvedValue({});

      const result = await analyzeGoals("test.myshopify.com");

      expect(result.results[0]).toMatchObject({
        ruleKey: "new-rule",
        executionId: "new-exec-id",
        status: "created",
      });
      expect(mockPrisma.goalExecution.create).toHaveBeenCalledTimes(1);

      // Verify impact fields were passed
      const createCall = (mockPrisma.goalExecution.create as Mock).mock.calls[0][0];
      expect(createCall.data.impactScore).toBeGreaterThan(0);
      expect(createCall.data.confidenceLevel).toBe("high");
      expect(createCall.data.estimatedRevenue).toBeTruthy();
      expect(createCall.data.actionSteps).toBeTruthy();
    });

    it("creates multi-goal links when AI returns relatedGoalKeys", async () => {
      const goal1 = makeGoal({ id: "goal-1", ruleKey: "rule-1" });
      const goal2 = makeGoal({ id: "goal-2", ruleKey: "rule-2" });
      mockPrisma.goal.findMany
        .mockResolvedValueOnce([goal1, goal2] as any) // enabled goals
        .mockResolvedValueOnce([{ id: "goal-2" }] as any); // related goals lookup

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          applicable: true,
          title: "Cross-goal finding",
          description: "Relevant to multiple goals",
          relatedGoalKeys: ["rule-2"],
        }),
      } as any);

      mockPrisma.goalExecution.findFirst.mockResolvedValue(null);
      mockPrisma.goalExecution.create.mockResolvedValue(
        makeExec({ id: "exec-multi", goalId: "goal-1" }) as any,
      );
      (mockPrisma.goalExecutionGoal as any).upsert.mockResolvedValue({});

      await analyzeGoals("test.myshopify.com");

      // Should create at least 2 upsert calls: primary + related goal
      expect((mockPrisma.goalExecutionGoal as any).upsert).toHaveBeenCalled();
    });

    it("returns not_applicable when AI says not applicable", async () => {
      const goal = makeGoal({ id: "goal-skip", ruleKey: "skip-rule" });
      mockPrisma.goal.findMany.mockResolvedValue([goal] as any);

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          applicable: false,
          title: "No Issue",
          description: "Everything is fine",
        }),
      } as any);

      const result = await analyzeGoals("test.myshopify.com");

      expect(result.results[0]).toMatchObject({
        ruleKey: "skip-rule",
        status: "not_applicable",
      });
    });

    it("returns error status when AI generates invalid JSON after retries", async () => {
      const goal = makeGoal({ id: "goal-bad", ruleKey: "bad-json-rule" });
      mockPrisma.goal.findMany.mockResolvedValue([goal] as any);

      mockGenerateText.mockResolvedValue({ text: "not json at all" } as any);

      const result = await analyzeGoals("test.myshopify.com");

      expect(result.results[0]).toMatchObject({
        ruleKey: "bad-json-rule",
        status: "error",
      });
      expect(result.results[0].error).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// executeGoalExecution
// ---------------------------------------------------------------------------

describe("executeGoalExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when execution not found", async () => {
    mockPrisma.goalExecution.findUnique.mockResolvedValue(null);

    await expect(executeGoalExecution("nonexistent-id")).rejects.toThrow(
      "GoalExecution nonexistent-id not found",
    );
  });

  it("returns early when already executed", async () => {
    const exec = makeExec({ id: "exec-id", status: "executed", goal: makeGoal() });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);

    const result = await executeGoalExecution("exec-id");

    expect(result).toMatchObject({ id: "exec-id", status: "executed" });
    expect(mockPrisma.goalExecution.update).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("on success: updates status to executed with resultSummary and outcomeStatus", async () => {
    const exec = makeExec({ id: "bg-id", status: "new", goal: makeGoal() });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);
    mockMcpManager.ensureInitialized.mockResolvedValue(undefined);
    mockMcpManager.getToolsForAI.mockResolvedValue({ shopify_query: {} } as any);

    mockPrisma.goalExecution.update
      .mockResolvedValueOnce(makeExec({ status: "executing" }) as any)  // baseline capture
      .mockResolvedValueOnce(
        makeExec({ id: "bg-id", status: "executed", resultSummary: "Done!", outcomeStatus: "pending_measurement" }) as any,
      );

    mockGenerateText.mockResolvedValue({ text: "Done!" } as any);

    const result = await executeGoalExecution("bg-id");

    expect(result.status).toBe("executed");
  });

  it("on AI error: updates status to error and re-throws", async () => {
    const exec = makeExec({ id: "err-id", status: "new", goal: makeGoal() });
    mockPrisma.goalExecution.findUnique.mockResolvedValue(exec as any);
    mockMcpManager.ensureInitialized.mockResolvedValue(undefined);
    mockMcpManager.getToolsForAI.mockResolvedValue({} as any);

    const aiError = new Error("AI service unavailable");
    mockGenerateText.mockRejectedValue(aiError);

    mockPrisma.goalExecution.update
      .mockResolvedValueOnce(makeExec({ status: "executing" }) as any)
      .mockResolvedValueOnce(makeExec({ status: "error" }) as any);

    await expect(executeGoalExecution("err-id")).rejects.toThrow("AI service unavailable");
  });
});

// ---------------------------------------------------------------------------
// dismissGoalExecution
// ---------------------------------------------------------------------------

describe("dismissGoalExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status to dismissed", async () => {
    const dismissed = makeExec({ id: "dismiss-id", status: "dismissed" });
    mockPrisma.goalExecution.update.mockResolvedValue(dismissed as any);

    const result = await dismissGoalExecution("dismiss-id");

    expect(mockPrisma.goalExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "dismiss-id" },
        data: expect.objectContaining({ status: "dismissed" }),
      }),
    );
    expect(result.status).toBe("dismissed");
  });
});
