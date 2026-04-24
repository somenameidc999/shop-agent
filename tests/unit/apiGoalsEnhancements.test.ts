/**
 * API Goals Route — Enhancement Tests
 *
 * Tests for normalizeExecution with new fields (dryRunResult, feedbackRating,
 * compositeScore, dismissedAt, triggerSource) and the new GET query types.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: vi.fn() },
}));

vi.mock("../../app/services/goals.server", () => ({
  getGoalExecutionsForShop: vi.fn(),
  getGoalsForShop: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  inferGoalDetails: vi.fn(),
  dismissGoalExecution: vi.fn(),
  batchExecuteGoalExecutions: vi.fn(),
  batchDismissGoalExecutions: vi.fn(),
  undismissGoalExecution: vi.fn(),
  getRecentlyDismissedExecutions: vi.fn(),
  dryRunGoalExecution: vi.fn(),
  getDashboardStats: vi.fn(),
}));

vi.mock("../../app/services/feedback.server", () => ({
  recordFeedback: vi.fn(),
}));

vi.mock("../../app/jobs/scheduler.server", () => ({
  enqueueGoalAnalysis: vi.fn(),
  enqueueGoalExecution: vi.fn(),
  enqueueOutcomeMeasurement: vi.fn(),
}));

vi.mock("../../app/db.server", () => ({
  default: {
    goalExecution: { findUnique: vi.fn() },
    goal: { findUnique: vi.fn() },
    backgroundJob: { findUnique: vi.fn() },
  },
}));

import { normalizeExecution } from "../../app/routes/api.goals";

describe("normalizeExecution — new enhancement fields", () => {
  const base = {
    id: "exec-1",
    title: "Test",
    description: "A test execution",
    category: "inventory",
    priority: "medium",
    status: "new",
    mcpServersUsed: "shopify",
  };

  it("includes dryRunResult in output", () => {
    const result = normalizeExecution({
      ...base,
      dryRunResult: "Would update 3 prices",
    });
    expect(result.dryRunResult).toBe("Would update 3 prices");
  });

  it("defaults dryRunResult to null when absent", () => {
    const result = normalizeExecution(base);
    expect(result.dryRunResult).toBeNull();
  });

  it("includes feedbackRating in output", () => {
    const result = normalizeExecution({
      ...base,
      feedbackRating: 5,
    });
    expect(result.feedbackRating).toBe(5);
  });

  it("defaults feedbackRating to null when absent", () => {
    const result = normalizeExecution(base);
    expect(result.feedbackRating).toBeNull();
  });

  it("includes compositeScore in output", () => {
    const result = normalizeExecution({
      ...base,
      compositeScore: 85.5,
    });
    expect(result.compositeScore).toBe(85.5);
  });

  it("defaults compositeScore to null when absent", () => {
    const result = normalizeExecution(base);
    expect(result.compositeScore).toBeNull();
  });

  it("includes dismissedAt in output", () => {
    const now = new Date();
    const result = normalizeExecution({
      ...base,
      status: "dismissed",
      dismissedAt: now,
    });
    expect(result.dismissedAt).toBe(now);
  });

  it("defaults dismissedAt to null when absent", () => {
    const result = normalizeExecution(base);
    expect(result.dismissedAt).toBeNull();
  });

  it("includes triggerSource in output", () => {
    const result = normalizeExecution({
      ...base,
      triggerSource: "webhook",
    });
    expect(result.triggerSource).toBe("webhook");
  });

  it("defaults triggerSource to null when absent", () => {
    const result = normalizeExecution(base);
    expect(result.triggerSource).toBeNull();
  });

  it("preserves all new fields alongside existing ones", () => {
    const result = normalizeExecution({
      ...base,
      dryRunResult: "Preview",
      feedbackRating: 4,
      compositeScore: 72,
      dismissedAt: null,
      triggerSource: "scheduled",
      estimatedRevenue: JSON.stringify({ min: 100, max: 200 }),
      actionSteps: JSON.stringify(["step 1", "step 2"]),
    });

    // New fields
    expect(result.dryRunResult).toBe("Preview");
    expect(result.feedbackRating).toBe(4);
    expect(result.compositeScore).toBe(72);
    expect(result.triggerSource).toBe("scheduled");

    // Existing JSON parsing still works
    expect(result.estimatedRevenue).toEqual({ min: 100, max: 200 });
    expect(result.actionSteps).toEqual(["step 1", "step 2"]);

    // Status normalization still works
    expect(result.status).toBe("pending");
  });
});
