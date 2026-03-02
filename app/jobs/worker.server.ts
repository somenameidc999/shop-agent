import prisma from "../db.server";
import {
  handleGoalAnalysis,
  handleGoalExecution,
} from "./handlers.server";

const POLL_INTERVAL_MS = 10_000;
const MAX_CONCURRENT_JOBS = 2;
const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000;

let workerInstance: NodeJS.Timeout | null = null;
let activeJobs = 0;

interface JobPayload {
  [key: string]: unknown;
}

interface JobResult {
  [key: string]: unknown;
}

type JobHandler = (
  job: {
    id: string;
    shop: string;
    payload: JobPayload;
  }
) => Promise<JobResult>;

const jobHandlers: Record<string, JobHandler> = {
  goal_analysis: async (job) => {
    console.log(`[Worker] Processing goal_analysis for shop ${job.shop}`);
    const result = await handleGoalAnalysis(job.payload as { shop: string });
    return result as JobResult;
  },
  goal_execute: async (job) => {
    console.log(`[Worker] Processing goal_execute for shop ${job.shop}`);
    const result = await handleGoalExecution(
      job.payload as { shop: string; executionId: string }
    );
    return result as JobResult;
  },
};

async function processJob(jobId: string): Promise<void> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.status !== "running") {
    return;
  }

  try {
    const handler = jobHandlers[job.jobType];
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.jobType}`);
    }

    const payload = JSON.parse(job.payload) as JobPayload;
    const result = await handler({
      id: job.id,
      shop: job.shop,
      payload,
    });

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        result: JSON.stringify(result),
        completedAt: new Date(),
      },
    });

    console.log(`[Worker] Job ${jobId} completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.maxAttempts) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: errorMessage,
          attempts: newAttempts,
          completedAt: new Date(),
        },
      });
      console.error(`[Worker] Job ${jobId} failed after ${newAttempts} attempts:`, errorMessage);
    } else {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "pending",
          error: errorMessage,
          attempts: newAttempts,
          scheduledAt: new Date(Date.now() + 60_000),
        },
      });
      console.warn(`[Worker] Job ${jobId} failed, retry ${newAttempts}/${job.maxAttempts}:`, errorMessage);
    }
  }
}

async function recoverStaleJobs(): Promise<void> {
  try {
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

    const staleJobs = await prisma.backgroundJob.findMany({
      where: {
        status: "running",
        startedAt: { lt: staleThreshold },
      },
      orderBy: { startedAt: "asc" },
    });

    if (staleJobs.length === 0) return;

    const keepIds: string[] = [];
    const cancelIds: string[] = [];
    const seen = new Set<string>();

    for (const job of staleJobs) {
      const key = `${job.shop}::${job.jobType}`;
      if (seen.has(key)) {
        cancelIds.push(job.id);
      } else {
        seen.add(key);
        keepIds.push(job.id);
      }
    }

    if (keepIds.length > 0) {
      await prisma.backgroundJob.updateMany({
        where: { id: { in: keepIds } },
        data: { status: "pending", error: "Job recovered from stale running state" },
      });
    }

    if (cancelIds.length > 0) {
      await prisma.backgroundJob.updateMany({
        where: { id: { in: cancelIds } },
        data: { status: "failed", error: "Deduplicated stale job — another for same shop+type recovered", completedAt: new Date() },
      });
    }

    console.warn(`[Worker] Recovered ${keepIds.length} stale job(s), cancelled ${cancelIds.length} duplicate(s)`);
  } catch (error) {
    console.error("[Worker] Error recovering stale jobs:", error);
  }
}

async function pollJobs(): Promise<void> {
  try {
    await recoverStaleJobs();

    const availableSlots = MAX_CONCURRENT_JOBS - activeJobs;
    if (availableSlots <= 0) {
      return;
    }

    const pendingJobs = await prisma.backgroundJob.findMany({
      where: {
        status: "pending",
        scheduledAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
      take: availableSlots * 2,
    });

    const seen = new Set<string>();
    const deduped: typeof pendingJobs = [];
    const duplicateIds: string[] = [];

    for (const job of pendingJobs) {
      const key = `${job.shop}::${job.jobType}`;
      if (seen.has(key)) {
        duplicateIds.push(job.id);
      } else {
        seen.add(key);
        deduped.push(job);
      }
    }

    if (duplicateIds.length > 0) {
      await prisma.backgroundJob.updateMany({
        where: { id: { in: duplicateIds } },
        data: { status: "failed", error: "Deduplicated: another job for same shop+type exists", completedAt: new Date() },
      });
      console.warn(`[Worker] Deduplicated ${duplicateIds.length} duplicate pending job(s)`);
    }

    const jobsToRun = deduped.slice(0, availableSlots);

    for (const job of jobsToRun) {
      const updated = await prisma.backgroundJob.updateMany({
        where: {
          id: job.id,
          status: "pending",
        },
        data: {
          status: "running",
          startedAt: new Date(),
        },
      });

      if (updated.count > 0) {
        activeJobs++;
        processJob(job.id)
          .catch((error) => {
            console.error(`[Worker] Unexpected error processing job ${job.id}:`, error);
          })
          .finally(() => {
            activeJobs--;
          });
      }
    }
  } catch (error) {
    console.error("[Worker] Error polling jobs:", error);
  }
}

export function initWorker(): void {
  if (workerInstance) {
    console.log("[Worker] Worker already running");
    return;
  }

  console.log("[Worker] Starting background job worker");
  workerInstance = setInterval(() => {
    pollJobs().catch((error) => {
      console.error("[Worker] Poll error:", error);
    });
  }, POLL_INTERVAL_MS);

  pollJobs().catch((error) => {
    console.error("[Worker] Initial poll error:", error);
  });
}

export function stopWorker(): void {
  if (workerInstance) {
    clearInterval(workerInstance);
    workerInstance = null;
    console.log("[Worker] Background job worker stopped");
  }
}

export function registerJobHandler(jobType: string, handler: JobHandler): void {
  jobHandlers[jobType] = handler;
  console.log(`[Worker] Registered handler for job type: ${jobType}`);
}
