/**
 * Background Job Handlers
 *
 * Exports handler functions for each job type.
 * Each handler receives a job payload and executes the corresponding service function.
 */

import {
  analyzeGoals,
  executeGoalExecution,
} from "../services/goals.server";

interface GoalAnalysisPayload {
  shop: string;
}

interface GoalExecutePayload {
  shop: string;
  executionId: string;
}

export async function handleGoalAnalysis(
  payload: GoalAnalysisPayload,
) {
  console.info(`[JobHandler] Starting goal_analysis for shop: ${payload.shop}`);
  const result = await analyzeGoals(payload.shop);
  console.info(`[JobHandler] Completed goal_analysis for shop: ${payload.shop}`);
  return result;
}

export async function handleGoalExecution(
  payload: GoalExecutePayload,
) {
  console.info(
    `[JobHandler] Starting goal_execute for execution: ${payload.executionId}`,
  );
  const result = await executeGoalExecution(payload.executionId);
  console.info(
    `[JobHandler] Completed goal_execute for execution: ${payload.executionId}`,
  );
  return result;
}

export async function handleJob(jobType: string, payload: unknown) {
  switch (jobType) {
    case "goal_analysis":
      return handleGoalAnalysis(payload as GoalAnalysisPayload);

    case "goal_execute":
      return handleGoalExecution(payload as GoalExecutePayload);

    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
}
