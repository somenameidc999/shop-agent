import prisma from "../db.server";

// Record merchant feedback on a recommendation
export async function recordFeedback(
  shop: string,
  goalId: string,
  executionId: string | null,
  feedbackType: "execute" | "dismiss" | "helpful" | "not_helpful",
  rating?: number,
  note?: string,
) {
  return prisma.merchantFeedback.create({
    data: { shop, goalId, executionId, feedbackType, rating, note },
  });
}

// Get feedback stats for a specific goal
export async function getGoalFeedbackStats(shop: string, goalId: string) {
  const feedbacks = await prisma.merchantFeedback.findMany({
    where: { shop, goalId },
  });

  const executeCount = feedbacks.filter(f => f.feedbackType === "execute").length;
  const dismissCount = feedbacks.filter(f => f.feedbackType === "dismiss").length;
  const helpfulCount = feedbacks.filter(f => f.feedbackType === "helpful").length;
  const notHelpfulCount = feedbacks.filter(f => f.feedbackType === "not_helpful").length;
  const total = executeCount + dismissCount;

  return {
    executeCount,
    dismissCount,
    helpfulCount,
    notHelpfulCount,
    executeRate: total > 0 ? executeCount / total : 0,
    avgRating: feedbacks.filter(f => f.rating != null).length > 0
      ? feedbacks.filter(f => f.rating != null).reduce((sum, f) => sum + (f.rating ?? 0), 0) / feedbacks.filter(f => f.rating != null).length
      : null,
  };
}

// Get aggregated feedback summary for a shop (for dashboard)
export async function getShopFeedbackSummary(shop: string) {
  const feedbacks = await prisma.merchantFeedback.findMany({
    where: { shop },
  });

  const byGoal = new Map<string, { execute: number; dismiss: number; helpful: number; notHelpful: number }>();

  for (const f of feedbacks) {
    const entry = byGoal.get(f.goalId) ?? { execute: 0, dismiss: 0, helpful: 0, notHelpful: 0 };
    if (f.feedbackType === "execute") entry.execute++;
    if (f.feedbackType === "dismiss") entry.dismiss++;
    if (f.feedbackType === "helpful") entry.helpful++;
    if (f.feedbackType === "not_helpful") entry.notHelpful++;
    byGoal.set(f.goalId, entry);
  }

  const goalStats = Array.from(byGoal.entries()).map(([goalId, stats]) => ({
    goalId,
    ...stats,
    executeRate: (stats.execute + stats.dismiss) > 0
      ? stats.execute / (stats.execute + stats.dismiss)
      : 0,
  }));

  const totalExecute = feedbacks.filter(f => f.feedbackType === "execute").length;
  const totalDismiss = feedbacks.filter(f => f.feedbackType === "dismiss").length;

  return {
    goalStats,
    overallExecuteRate: (totalExecute + totalDismiss) > 0
      ? totalExecute / (totalExecute + totalDismiss)
      : 0,
    totalFeedbacks: feedbacks.length,
  };
}

// Compute composite score: confidence × impact × historical success rate
export function computeCompositeScore(
  impactScore: number,
  confidenceLevel: string | null,
  goalExecuteRate: number,
): number {
  const confidenceMultiplier: Record<string, number> = {
    high: 1.0,
    medium: 0.7,
    low: 0.4,
  };
  const confMult = confidenceMultiplier[confidenceLevel ?? "low"] ?? 0.4;
  // Blend: 70% raw impact × confidence, 30% historical success rate
  const historicalBoost = goalExecuteRate > 0 ? 0.7 + (0.3 * goalExecuteRate) : 0.7;
  return Math.round(impactScore * confMult * historicalBoost);
}
