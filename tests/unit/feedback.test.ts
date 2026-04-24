/**
 * Feedback Service — Unit Tests
 *
 * Tests for merchant feedback recording, stats aggregation,
 * and composite score computation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    merchantFeedback: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import prisma from "../../app/db.server";
import {
  recordFeedback,
  getGoalFeedbackStats,
  getShopFeedbackSummary,
  computeCompositeScore,
} from "../../app/services/feedback.server";

const mockPrisma = vi.mocked(prisma);

function makeFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: "fb-1",
    shop: "test.myshopify.com",
    goalId: "goal-1",
    executionId: "exec-1",
    feedbackType: "helpful",
    rating: 5,
    note: null,
    createdAt: new Date("2026-03-10T00:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// recordFeedback
// ---------------------------------------------------------------------------

describe("recordFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a feedback record with all fields", async () => {
    const expected = makeFeedback();
    mockPrisma.merchantFeedback.create.mockResolvedValue(expected as any);

    const result = await recordFeedback(
      "test.myshopify.com",
      "goal-1",
      "exec-1",
      "helpful",
      5,
      "Great recommendation!",
    );

    expect(mockPrisma.merchantFeedback.create).toHaveBeenCalledWith({
      data: {
        shop: "test.myshopify.com",
        goalId: "goal-1",
        executionId: "exec-1",
        feedbackType: "helpful",
        rating: 5,
        note: "Great recommendation!",
      },
    });
    expect(result).toBe(expected);
  });

  it("creates feedback without optional fields", async () => {
    const expected = makeFeedback({ rating: undefined, note: undefined });
    mockPrisma.merchantFeedback.create.mockResolvedValue(expected as any);

    await recordFeedback(
      "test.myshopify.com",
      "goal-1",
      null,
      "dismiss",
    );

    expect(mockPrisma.merchantFeedback.create).toHaveBeenCalledWith({
      data: {
        shop: "test.myshopify.com",
        goalId: "goal-1",
        executionId: null,
        feedbackType: "dismiss",
        rating: undefined,
        note: undefined,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// getGoalFeedbackStats
// ---------------------------------------------------------------------------

describe("getGoalFeedbackStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeroed stats when no feedback exists", async () => {
    mockPrisma.merchantFeedback.findMany.mockResolvedValue([]);

    const stats = await getGoalFeedbackStats("test.myshopify.com", "goal-1");

    expect(stats).toEqual({
      executeCount: 0,
      dismissCount: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      executeRate: 0,
      avgRating: null,
    });
  });

  it("counts each feedback type correctly", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", feedbackType: "execute", rating: null }),
      makeFeedback({ id: "fb-2", feedbackType: "execute", rating: null }),
      makeFeedback({ id: "fb-3", feedbackType: "dismiss", rating: null }),
      makeFeedback({ id: "fb-4", feedbackType: "helpful", rating: 5 }),
      makeFeedback({ id: "fb-5", feedbackType: "not_helpful", rating: 1 }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const stats = await getGoalFeedbackStats("test.myshopify.com", "goal-1");

    expect(stats.executeCount).toBe(2);
    expect(stats.dismissCount).toBe(1);
    expect(stats.helpfulCount).toBe(1);
    expect(stats.notHelpfulCount).toBe(1);
  });

  it("calculates execute rate correctly", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", feedbackType: "execute", rating: null }),
      makeFeedback({ id: "fb-2", feedbackType: "execute", rating: null }),
      makeFeedback({ id: "fb-3", feedbackType: "dismiss", rating: null }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const stats = await getGoalFeedbackStats("test.myshopify.com", "goal-1");

    // 2 executes out of 3 total (execute + dismiss)
    expect(stats.executeRate).toBeCloseTo(2 / 3);
  });

  it("calculates average rating from rated entries only", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", feedbackType: "helpful", rating: 5 }),
      makeFeedback({ id: "fb-2", feedbackType: "helpful", rating: 3 }),
      makeFeedback({ id: "fb-3", feedbackType: "execute", rating: null }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const stats = await getGoalFeedbackStats("test.myshopify.com", "goal-1");

    expect(stats.avgRating).toBe(4); // (5 + 3) / 2
  });

  it("returns null avgRating when no ratings exist", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", feedbackType: "execute", rating: null }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const stats = await getGoalFeedbackStats("test.myshopify.com", "goal-1");

    expect(stats.avgRating).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getShopFeedbackSummary
// ---------------------------------------------------------------------------

describe("getShopFeedbackSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty summary when no feedback exists", async () => {
    mockPrisma.merchantFeedback.findMany.mockResolvedValue([]);

    const summary = await getShopFeedbackSummary("test.myshopify.com");

    expect(summary.goalStats).toEqual([]);
    expect(summary.overallExecuteRate).toBe(0);
    expect(summary.totalFeedbacks).toBe(0);
  });

  it("groups feedback by goal and calculates per-goal execute rate", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", goalId: "g1", feedbackType: "execute" }),
      makeFeedback({ id: "fb-2", goalId: "g1", feedbackType: "dismiss" }),
      makeFeedback({ id: "fb-3", goalId: "g2", feedbackType: "execute" }),
      makeFeedback({ id: "fb-4", goalId: "g2", feedbackType: "execute" }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const summary = await getShopFeedbackSummary("test.myshopify.com");

    expect(summary.goalStats).toHaveLength(2);

    const g1 = summary.goalStats.find((g) => g.goalId === "g1");
    expect(g1?.execute).toBe(1);
    expect(g1?.dismiss).toBe(1);
    expect(g1?.executeRate).toBe(0.5);

    const g2 = summary.goalStats.find((g) => g.goalId === "g2");
    expect(g2?.execute).toBe(2);
    expect(g2?.dismiss).toBe(0);
    expect(g2?.executeRate).toBe(1);
  });

  it("calculates overall execute rate", async () => {
    const feedbacks = [
      makeFeedback({ id: "fb-1", feedbackType: "execute" }),
      makeFeedback({ id: "fb-2", feedbackType: "execute" }),
      makeFeedback({ id: "fb-3", feedbackType: "execute" }),
      makeFeedback({ id: "fb-4", feedbackType: "dismiss" }),
    ];
    mockPrisma.merchantFeedback.findMany.mockResolvedValue(feedbacks as any);

    const summary = await getShopFeedbackSummary("test.myshopify.com");

    expect(summary.overallExecuteRate).toBe(0.75);
    expect(summary.totalFeedbacks).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// computeCompositeScore
// ---------------------------------------------------------------------------

describe("computeCompositeScore", () => {
  it("applies high confidence multiplier (1.0)", () => {
    const score = computeCompositeScore(100, "high", 0);
    // 100 * 1.0 * 0.7 = 70
    expect(score).toBe(70);
  });

  it("applies medium confidence multiplier (0.7)", () => {
    const score = computeCompositeScore(100, "medium", 0);
    // 100 * 0.7 * 0.7 = 49
    expect(score).toBe(49);
  });

  it("applies low confidence multiplier (0.4)", () => {
    const score = computeCompositeScore(100, "low", 0);
    // 100 * 0.4 * 0.7 = 28
    expect(score).toBe(28);
  });

  it("defaults to low when confidence is null", () => {
    const score = computeCompositeScore(100, null, 0);
    expect(score).toBe(28);
  });

  it("boosts score based on historical success rate", () => {
    const scoreLow = computeCompositeScore(100, "high", 0);
    const scoreHigh = computeCompositeScore(100, "high", 1.0);
    // Low: 100 * 1.0 * 0.7 = 70
    // High: 100 * 1.0 * (0.7 + 0.3*1.0) = 100 * 1.0 * 1.0 = 100
    expect(scoreLow).toBe(70);
    expect(scoreHigh).toBe(100);
  });

  it("partial success rate gives proportional boost", () => {
    const score = computeCompositeScore(100, "high", 0.5);
    // 100 * 1.0 * (0.7 + 0.3*0.5) = 100 * 0.85 = 85
    expect(score).toBe(85);
  });

  it("rounds to nearest integer", () => {
    const score = computeCompositeScore(33, "medium", 0.5);
    // 33 * 0.7 * (0.7 + 0.15) = 33 * 0.7 * 0.85 = 19.635 → 20
    expect(score).toBe(20);
  });

  it("returns 0 for zero impact score", () => {
    const score = computeCompositeScore(0, "high", 1.0);
    expect(score).toBe(0);
  });
});
