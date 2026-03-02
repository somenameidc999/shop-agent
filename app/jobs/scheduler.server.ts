/**
 * Background Job Scheduler
 *
 * Manages periodic job scheduling for goal analysis and other background tasks.
 * Uses setInterval to enqueue jobs at configurable intervals.
 * Singleton pattern ensures safe multiple calls.
 */

import prisma from "../db.server";

const GOAL_ANALYSIS_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SCHEDULER_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

let schedulerInitialized = false;
let schedulerInterval: NodeJS.Timeout | null = null;

export function initScheduler() {
  if (schedulerInitialized) {
    console.info("[Scheduler] Already initialized, skipping");
    return;
  }

  console.info("[Scheduler] Initializing job scheduler");

  schedulerInterval = setInterval(() => {
    void enqueueGoalAnalysisJobs();
  }, SCHEDULER_CHECK_INTERVAL_MS);

  void enqueueGoalAnalysisJobs();

  schedulerInitialized = true;
  console.info("[Scheduler] Job scheduler initialized");
}

export function shutdownScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerInitialized = false;
  console.info("[Scheduler] Job scheduler shut down");
}

async function enqueueGoalAnalysisJobs() {
  try {
    const shops = await prisma.shop.findMany({
      select: { shop: true },
    });

    if (shops.length === 0) {
      console.info("[Scheduler] No active shops found");
      return;
    }

    console.info(`[Scheduler] Checking ${shops.length} shops for goal analysis`);

    for (const { shop } of shops) {
      try {
        const existingJob = await prisma.backgroundJob.findFirst({
          where: {
            shop,
            jobType: "goal_analysis",
            status: { in: ["pending", "running"] },
          },
        });

        if (existingJob) {
          console.info(`[Scheduler] Shop ${shop} already has a pending/running analysis job`);
          continue;
        }

        const lastCompletedJob = await prisma.backgroundJob.findFirst({
          where: {
            shop,
            jobType: "goal_analysis",
            status: "completed",
          },
          orderBy: { completedAt: "desc" },
        });

        const now = new Date();
        const shouldEnqueue =
          !lastCompletedJob ||
          !lastCompletedJob.completedAt ||
          now.getTime() - lastCompletedJob.completedAt.getTime() >=
            GOAL_ANALYSIS_INTERVAL_MS;

        if (!shouldEnqueue) {
          const nextRunTime = new Date(
            lastCompletedJob.completedAt!.getTime() + GOAL_ANALYSIS_INTERVAL_MS,
          );
          console.info(
            `[Scheduler] Shop ${shop} analysis not due yet (next run: ${nextRunTime.toISOString()})`,
          );
          continue;
        }

        const job = await prisma.backgroundJob.create({
          data: {
            shop,
            jobType: "goal_analysis",
            status: "pending",
            payload: JSON.stringify({ shop }),
            maxAttempts: 3,
          },
        });

        console.info(
          `[Scheduler] Enqueued goal_analysis job ${job.id} for shop ${shop}`,
        );
      } catch (error) {
        console.error(`[Scheduler] Error processing shop ${shop}:`, error);
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error enqueuing goal analysis jobs:", error);
  }
}

export async function enqueueGoalAnalysis(shop: string) {
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      shop,
      jobType: "goal_analysis",
      status: { in: ["pending", "running"] },
    },
  });

  if (existing) {
    console.info(`[Scheduler] Shop ${shop} already has a pending/running analysis job ${existing.id}`);
    return existing;
  }

  const job = await prisma.backgroundJob.create({
    data: {
      shop,
      jobType: "goal_analysis",
      status: "pending",
      payload: JSON.stringify({ shop }),
      maxAttempts: 3,
    },
  });

  console.info(`[Scheduler] Manually enqueued goal_analysis job ${job.id} for shop ${shop}`);

  return job;
}

export async function enqueueGoalExecution(
  shop: string,
  executionId: string,
) {
  const job = await prisma.backgroundJob.create({
    data: {
      shop,
      jobType: "goal_execute",
      status: "pending",
      payload: JSON.stringify({ shop, executionId }),
      maxAttempts: 3,
    },
  });

  console.info(
    `[Scheduler] Enqueued goal_execute job ${job.id} for execution ${executionId}`,
  );

  return job;
}

process.on("SIGINT", shutdownScheduler);
process.on("SIGTERM", shutdownScheduler);
