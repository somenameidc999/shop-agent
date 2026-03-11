/**
 * Goals API Route
 *
 * Provides endpoints for managing goals and goal executions:
 * - GET: List goals, goal executions, or infer goal details
 * - POST: Create goals, execute, dismiss, generate analyses, measure outcomes
 * - PUT: Update goals
 * - DELETE: Delete goals
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getGoalsForShop,
  getGoalExecutionsForShop,
  createGoal,
  updateGoal,
  deleteGoal,
  inferGoalDetails,
  dismissGoalExecution,
} from "../services/goals.server";
import {
  enqueueGoalAnalysis,
  enqueueGoalExecution,
  enqueueOutcomeMeasurement,
} from "../jobs/scheduler.server";
import prisma from "../db.server";

function parseJsonField(value: unknown): unknown {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeExecution(rec: Record<string, unknown>) {
  let status = rec.status as string;
  if (status === "new") status = "pending";
  if (status === "executed") status = "completed";
  if (status === "executing") status = "in_progress";
  if (status === "error") status = "failed";

  // Parse linked goals from join table
  const goalExecutionLinks = rec.goalExecutionLinks as
    | Array<{ goal: { id: string; title: string; ruleKey: string; category: string } }>
    | undefined;

  const linkedGoals = goalExecutionLinks
    ? goalExecutionLinks.map((link) => link.goal)
    : [];

  return {
    ...rec,
    status,
    mcpServersUsed: typeof rec.mcpServersUsed === "string"
      ? (rec.mcpServersUsed as string).split(",").filter(Boolean)
      : rec.mcpServersUsed,
    estimatedRevenue: parseJsonField(rec.estimatedRevenue),
    estimatedConversionLift: parseJsonField(rec.estimatedConversionLift),
    estimatedAovImpact: parseJsonField(rec.estimatedAovImpact),
    actionSteps: parseJsonField(rec.actionSteps),
    outcomeData: parseJsonField(rec.outcomeData),
    baselineData: parseJsonField(rec.baselineData),
    linkedGoals,
    goalExecutionLinks: undefined,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "executions";

  if (type === "job") {
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return Response.json({ error: "jobId is required" }, { status: 400 });
    }
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job || job.shop !== session.shop) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }
    return Response.json({
      id: job.id,
      status: job.status,
      jobType: job.jobType,
      error: job.error,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
    });
  }

  if (type === "goals") {
    const goals = await getGoalsForShop(session.shop);
    const parsed = goals.map((g) => ({
      ...g,
      requiredServers: JSON.parse(g.requiredServers) as string[],
    }));
    return Response.json({ goals: parsed });
  }

  // Default: return executions
  const status = url.searchParams.get("status") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const goalId = url.searchParams.get("goalId") || undefined;
  const sortBy = (url.searchParams.get("sortBy") || undefined) as
    | "impactScore" | "priority" | "newest" | undefined;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  if (limit < 1 || limit > 100) {
    return Response.json(
      { error: "limit must be between 1 and 100" },
      { status: 400 },
    );
  }

  if (offset < 0) {
    return Response.json(
      { error: "offset must be non-negative" },
      { status: 400 },
    );
  }

  const filters: {
    status?: string;
    category?: string;
    goalId?: string;
    sortBy?: "impactScore" | "priority" | "newest";
  } = {};
  if (status) filters.status = status;
  if (category) filters.category = category;
  if (goalId) filters.goalId = goalId;
  if (sortBy) filters.sortBy = sortBy;

  const { data: rawExecutions, total } = await getGoalExecutionsForShop(
    session.shop,
    filters,
    { limit, offset },
  );

  const executions = rawExecutions.map((e) => normalizeExecution(e as unknown as Record<string, unknown>));

  return Response.json({ executions, total });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const goalId = url.searchParams.get("goalId");
    if (!goalId) {
      return Response.json({ error: "goalId is required" }, { status: 400 });
    }
    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal || goal.shop !== session.shop) {
      return Response.json({ error: "Goal not found" }, { status: 404 });
    }
    await deleteGoal(goalId);
    return Response.json({ success: true, message: "Goal deleted" });
  }

  if (request.method === "PUT") {
    const body = await request.json() as {
      goalId?: string;
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      analysisPrompt?: string;
      actionPrompt?: string;
      cronIntervalMins?: number;
      outcomeMeasureDays?: number;
      requiredServers?: string[];
      enabled?: boolean;
    };
    if (!body.goalId) {
      return Response.json({ error: "goalId is required" }, { status: 400 });
    }
    const goal = await prisma.goal.findUnique({ where: { id: body.goalId } });
    if (!goal || goal.shop !== session.shop) {
      return Response.json({ error: "Goal not found" }, { status: 404 });
    }
    const { goalId, ...updateData } = body;
    const updated = await updateGoal(goalId, updateData);
    return Response.json({
      success: true,
      goal: { ...updated, requiredServers: JSON.parse(updated.requiredServers) },
    });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const actionType = body.action as string | undefined;

  if (!actionType) {
    return Response.json({ error: "action field is required" }, { status: 400 });
  }

  // Action: create goal
  if (actionType === "create") {
    try {
      const goal = await createGoal(session.shop, {
        title: body.title as string,
        description: body.description as string,
        priority: body.priority as string | undefined,
        cronIntervalMins: body.cronIntervalMins as number | undefined,
        outcomeMeasureDays: body.outcomeMeasureDays as number | undefined,
        category: body.category as string | undefined,
        analysisPrompt: body.analysisPrompt as string | undefined,
        actionPrompt: body.actionPrompt as string | undefined,
        requiredServers: body.requiredServers as string[] | undefined,
      });
      return Response.json({
        success: true,
        goal: { ...goal, requiredServers: JSON.parse(goal.requiredServers) },
      });
    } catch (error) {
      console.error("[API] Error creating goal:", error);
      return Response.json(
        { error: "Failed to create goal", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  // Action: infer goal details with AI
  if (actionType === "infer") {
    try {
      const result = await inferGoalDetails(
        session.shop,
        body.title as string,
        body.description as string,
      );
      return Response.json({ success: true, inference: result });
    } catch (error) {
      console.error("[API] Error inferring goal details:", error);
      return Response.json(
        { error: "Failed to infer goal details", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  // Action: generate (analyze goals → create executions)
  if (actionType === "generate") {
    try {
      const job = await enqueueGoalAnalysis(session.shop);
      return Response.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Goal analysis job enqueued",
      });
    } catch (error) {
      console.error("[API] Error enqueuing goal analysis:", error);
      return Response.json(
        { error: "Failed to enqueue analysis job", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  // Action: execute a goal execution
  if (actionType === "execute") {
    const executionId = body.executionId as string | undefined;
    if (!executionId) {
      return Response.json(
        { error: "executionId is required for execute action" },
        { status: 400 },
      );
    }

    try {
      const execution = await prisma.goalExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        return Response.json({ error: "GoalExecution not found" }, { status: 404 });
      }

      if (execution.shop !== session.shop) {
        return Response.json(
          { error: "GoalExecution does not belong to this shop" },
          { status: 403 },
        );
      }

      const job = await enqueueGoalExecution(session.shop, executionId);

      return Response.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Goal execution job enqueued",
      });
    } catch (error) {
      console.error("[API] Error executing goal execution:", error);
      return Response.json(
        { error: "Failed to execute", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  // Action: dismiss
  if (actionType === "dismiss") {
    const executionId = body.executionId as string | undefined;
    if (!executionId) {
      return Response.json(
        { error: "executionId is required for dismiss action" },
        { status: 400 },
      );
    }

    try {
      const execution = await prisma.goalExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        return Response.json({ error: "GoalExecution not found" }, { status: 404 });
      }

      if (execution.shop !== session.shop) {
        return Response.json(
          { error: "GoalExecution does not belong to this shop" },
          { status: 403 },
        );
      }

      const dismissed = await dismissGoalExecution(executionId);
      return Response.json({
        success: true,
        execution: dismissed,
        message: "Goal execution dismissed",
      });
    } catch (error) {
      console.error("[API] Error dismissing goal execution:", error);
      return Response.json(
        { error: "Failed to dismiss", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  // Action: measure outcome
  if (actionType === "measure_outcome") {
    const executionId = body.executionId as string | undefined;
    if (!executionId) {
      return Response.json(
        { error: "executionId is required for measure_outcome action" },
        { status: 400 },
      );
    }

    try {
      const execution = await prisma.goalExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        return Response.json({ error: "GoalExecution not found" }, { status: 404 });
      }

      if (execution.shop !== session.shop) {
        return Response.json(
          { error: "GoalExecution does not belong to this shop" },
          { status: 403 },
        );
      }

      const job = await enqueueOutcomeMeasurement(session.shop, executionId);

      return Response.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Outcome measurement job enqueued",
      });
    } catch (error) {
      console.error("[API] Error enqueuing outcome measurement:", error);
      return Response.json(
        { error: "Failed to enqueue outcome measurement", details: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  return Response.json({ error: `Unknown action: ${actionType}` }, { status: 400 });
}
