import { initWorker, stopWorker, registerJobHandler } from "../../app/jobs/worker.server";
import prisma from "../../app/db.server";

vi.mock("../../app/db.server", () => ({
  default: {
    backgroundJob: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock("../../app/jobs/handlers.server", () => ({
  handleGoalAnalysis: vi.fn().mockResolvedValue({}),
  handleGoalExecution: vi.fn().mockResolvedValue({}),
  handleGoalMeasureOutcome: vi.fn().mockResolvedValue({}),
}));

const mockPrisma = prisma as any;

function makeJob(overrides: Partial<{
  id: string;
  shop: string;
  jobType: string;
  status: string;
  startedAt: Date;
  scheduledAt: Date;
  payload: string;
  attempts: number;
  maxAttempts: number;
}> = {}) {
  return {
    id: overrides.id ?? "job-1",
    shop: overrides.shop ?? "test.myshopify.com",
    jobType: overrides.jobType ?? "goal_analysis",
    status: overrides.status ?? "pending",
    startedAt: overrides.startedAt ?? null,
    scheduledAt: overrides.scheduledAt ?? new Date(0),
    payload: overrides.payload ?? JSON.stringify({ shop: "test.myshopify.com" }),
    attempts: overrides.attempts ?? 0,
    maxAttempts: overrides.maxAttempts ?? 3,
    error: null,
    result: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Background Job Worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPrisma.backgroundJob.findMany.mockResolvedValue([]);
    mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    stopWorker();
    vi.useRealTimers();
  });

  describe("initWorker", () => {
    it("does not throw when called", () => {
      expect(() => initWorker()).not.toThrow();
    });

    it("is idempotent — calling twice is safe", () => {
      initWorker();
      expect(() => initWorker()).not.toThrow();
    });
  });

  describe("stopWorker", () => {
    it("does not throw when called without prior init", () => {
      expect(() => stopWorker()).not.toThrow();
    });

    it("cleans up after initWorker", () => {
      initWorker();
      expect(() => stopWorker()).not.toThrow();
    });
  });

  describe("registerJobHandler", () => {
    it("is a function that accepts jobType and handler", () => {
      expect(typeof registerJobHandler).toBe("function");
      expect(registerJobHandler.length).toBe(2);
    });

    it("does not throw when registering a new handler", () => {
      const handler = vi.fn().mockResolvedValue({});
      expect(() =>
        registerJobHandler("custom_job_type", handler as any),
      ).not.toThrow();
    });
  });

  describe("stale job recovery deduplication", () => {
    it("recovers one stale job and cancels duplicates for the same shop+type", async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      const stale1 = makeJob({ id: "stale-1", status: "running", startedAt: staleDate });
      const stale2 = makeJob({ id: "stale-2", status: "running", startedAt: staleDate });

      let callCount = 0;
      mockPrisma.backgroundJob.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([stale1, stale2]);
        return Promise.resolve([]);
      });
      mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 1 });

      initWorker();
      await vi.advanceTimersByTimeAsync(100);

      const updateManyCalls = mockPrisma.backgroundJob.updateMany.mock.calls;
      const recoverCall = updateManyCalls.find(
        (c: any) => c[0].where?.id?.in?.includes("stale-1") && c[0].data?.status === "pending",
      );
      const cancelCall = updateManyCalls.find(
        (c: any) => c[0].where?.id?.in?.includes("stale-2") && c[0].data?.status === "failed",
      );

      expect(recoverCall).toBeDefined();
      expect(cancelCall).toBeDefined();
    });
  });

  describe("poll deduplication", () => {
    it("only processes one pending job per shop+jobType and cancels duplicates", async () => {
      const dup1 = makeJob({ id: "dup-1" });
      const dup2 = makeJob({ id: "dup-2" });

      let callCount = 0;
      mockPrisma.backgroundJob.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([dup1, dup2]);
        return Promise.resolve([]);
      });
      mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.backgroundJob.findUnique.mockImplementation((args: any) => {
        if (args.where.id === "dup-1") {
          return Promise.resolve({ ...dup1, status: "running" });
        }
        return Promise.resolve(null);
      });

      initWorker();
      await vi.advanceTimersByTimeAsync(100);

      const cancelCall = mockPrisma.backgroundJob.updateMany.mock.calls.find(
        (c: any) => c[0].where?.id?.in?.includes("dup-2") && c[0].data?.status === "failed",
      );
      expect(cancelCall).toBeDefined();
      expect(cancelCall[0].data.error).toMatch(/Deduplicated/);
    });

    it("does not dedup goal_measure_outcome jobs for different executionIds on the same shop", async () => {
      const exec1 = makeJob({
        id: "meas-1",
        jobType: "goal_measure_outcome",
        payload: JSON.stringify({ shop: "test.myshopify.com", executionId: "exec-1" }),
      });
      const exec2 = makeJob({
        id: "meas-2",
        jobType: "goal_measure_outcome",
        payload: JSON.stringify({ shop: "test.myshopify.com", executionId: "exec-2" }),
      });

      let callCount = 0;
      mockPrisma.backgroundJob.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([exec1, exec2]);
        return Promise.resolve([]);
      });
      mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.backgroundJob.findUnique.mockImplementation((args: any) => {
        const match = [exec1, exec2].find((j) => j.id === args.where.id);
        return Promise.resolve(match ? { ...match, status: "running" } : null);
      });

      initWorker();
      await vi.advanceTimersByTimeAsync(100);

      const cancelCalls = mockPrisma.backgroundJob.updateMany.mock.calls.filter(
        (c: any) => c[0].data?.status === "failed" && c[0].data?.error?.includes("Deduplicated"),
      );
      expect(cancelCalls).toHaveLength(0);
    });

    it("still dedups goal_measure_outcome jobs with the same executionId", async () => {
      const payload = JSON.stringify({ shop: "test.myshopify.com", executionId: "exec-dup" });
      const dup1 = makeJob({ id: "meas-dup-1", jobType: "goal_measure_outcome", payload });
      const dup2 = makeJob({ id: "meas-dup-2", jobType: "goal_measure_outcome", payload });

      let callCount = 0;
      mockPrisma.backgroundJob.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([dup1, dup2]);
        return Promise.resolve([]);
      });
      mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.backgroundJob.findUnique.mockImplementation((args: any) => {
        if (args.where.id === "meas-dup-1") {
          return Promise.resolve({ ...dup1, status: "running" });
        }
        return Promise.resolve(null);
      });

      initWorker();
      await vi.advanceTimersByTimeAsync(100);

      const cancelCall = mockPrisma.backgroundJob.updateMany.mock.calls.find(
        (c: any) => c[0].where?.id?.in?.includes("meas-dup-2") && c[0].data?.status === "failed",
      );
      expect(cancelCall).toBeDefined();
      expect(cancelCall[0].data.error).toMatch(/Deduplicated/);
    });

    it("allows different shop+jobType combinations to run concurrently", async () => {
      const job1 = makeJob({ id: "job-a", shop: "shop-a.myshopify.com" });
      const job2 = makeJob({ id: "job-b", shop: "shop-b.myshopify.com" });

      let callCount = 0;
      mockPrisma.backgroundJob.findMany.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([job1, job2]);
        return Promise.resolve([]);
      });
      mockPrisma.backgroundJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.backgroundJob.findUnique.mockImplementation((args: any) => {
        const match = [job1, job2].find((j) => j.id === args.where.id);
        return Promise.resolve(match ? { ...match, status: "running" } : null);
      });

      initWorker();
      await vi.advanceTimersByTimeAsync(100);

      const cancelCalls = mockPrisma.backgroundJob.updateMany.mock.calls.filter(
        (c: any) => c[0].data?.status === "failed" && c[0].data?.error?.includes("Deduplicated"),
      );
      expect(cancelCalls).toHaveLength(0);
    });
  });
});
