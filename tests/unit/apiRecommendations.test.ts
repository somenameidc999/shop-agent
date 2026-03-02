/**
 * API Goals route — normalizeExecution unit tests
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
}));

vi.mock("../../app/jobs/scheduler.server", () => ({
  enqueueGoalAnalysis: vi.fn(),
  enqueueGoalExecution: vi.fn(),
}));

vi.mock("../../app/db.server", () => ({
  default: {
    goalExecution: { findUnique: vi.fn() },
    goal: { findUnique: vi.fn() },
  },
}));

import { normalizeExecution } from "../../app/routes/api.goals";

describe("normalizeExecution", () => {
  const base = {
    id: "exec-1",
    title: "Test",
    description: "A test execution",
    category: "inventory",
    priority: "medium",
    status: "new",
    mcpServersUsed: "shopify",
  };

  describe("status mapping", () => {
    it('maps "new" → "pending"', () => {
      const result = normalizeExecution({ ...base, status: "new" });
      expect(result.status).toBe("pending");
    });

    it('maps "executed" → "completed"', () => {
      const result = normalizeExecution({ ...base, status: "executed" });
      expect(result.status).toBe("completed");
    });

    it('maps "executing" → "in_progress"', () => {
      const result = normalizeExecution({ ...base, status: "executing" });
      expect(result.status).toBe("in_progress");
    });

    it('maps "error" → "failed"', () => {
      const result = normalizeExecution({ ...base, status: "error" });
      expect(result.status).toBe("failed");
    });

    it('passes through "dismissed" unchanged', () => {
      const result = normalizeExecution({ ...base, status: "dismissed" });
      expect(result.status).toBe("dismissed");
    });
  });

  describe("mcpServersUsed parsing", () => {
    it("splits comma-separated string into array", () => {
      const result = normalizeExecution({ ...base, mcpServersUsed: "shopify,google-sheets" });
      expect(result.mcpServersUsed).toEqual(["shopify", "google-sheets"]);
    });

    it("wraps a single server in an array", () => {
      const result = normalizeExecution({ ...base, mcpServersUsed: "shopify" });
      expect(result.mcpServersUsed).toEqual(["shopify"]);
    });

    it("returns empty array for empty string", () => {
      const result = normalizeExecution({ ...base, mcpServersUsed: "" });
      expect(result.mcpServersUsed).toEqual([]);
    });

    it("filters out empty strings from trailing commas", () => {
      const result = normalizeExecution({ ...base, mcpServersUsed: "shopify," });
      expect(result.mcpServersUsed).toEqual(["shopify"]);
    });
  });

  describe("full record transformation", () => {
    it("preserves all other fields", () => {
      const input = {
        id: "exec-42",
        title: "Sync inventory",
        description: "Sync inventory across channels",
        category: "sync",
        priority: "high",
        status: "new",
        mcpServersUsed: "shopify,postgres",
        shop: "test.myshopify.com",
        createdAt: "2026-02-28T00:00:00Z",
      };

      const result = normalizeExecution(input);

      expect(result.id).toBe("exec-42");
      expect(result.title).toBe("Sync inventory");
      expect(result.status).toBe("pending");
      expect(result.mcpServersUsed).toEqual(["shopify", "postgres"]);
    });
  });
});
