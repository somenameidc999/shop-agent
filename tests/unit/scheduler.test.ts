import * as scheduler from "../../app/jobs/scheduler.server";

vi.mock("../../app/db.server", () => ({
  default: {
    shop: { findMany: vi.fn() },
    backgroundJob: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import prisma from "../../app/db.server";

const mockPrisma = prisma as unknown as {
  shop: { findMany: ReturnType<typeof vi.fn> };
  backgroundJob: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe("Job Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    scheduler.shutdownScheduler();
    vi.useRealTimers();
  });

  describe("initScheduler", () => {
    it("does not throw when called", () => {
      mockPrisma.shop.findMany.mockResolvedValue([]);
      expect(() => scheduler.initScheduler()).not.toThrow();
    });

    it("is idempotent — calling multiple times is safe", () => {
      mockPrisma.shop.findMany.mockResolvedValue([]);
      scheduler.initScheduler();
      scheduler.initScheduler();
      scheduler.initScheduler();
    });
  });

  describe("shutdownScheduler", () => {
    it("does not throw when called without prior init", () => {
      expect(() => scheduler.shutdownScheduler()).not.toThrow();
    });

    it("cleans up after initScheduler", () => {
      mockPrisma.shop.findMany.mockResolvedValue([]);
      scheduler.initScheduler();
      expect(() => scheduler.shutdownScheduler()).not.toThrow();
    });
  });

  describe("enqueueGoalAnalysis", () => {
    const shop = "test-shop.myshopify.com";

    it("creates a new job when no pending/running job exists", async () => {
      const createdJob = {
        id: "job-1",
        shop,
        jobType: "goal_analysis",
        status: "pending",
      };
      mockPrisma.backgroundJob.findFirst.mockResolvedValue(null);
      mockPrisma.backgroundJob.create.mockResolvedValue(createdJob);

      const result = await scheduler.enqueueGoalAnalysis(shop);

      expect(result).toEqual(createdJob);
      expect(mockPrisma.backgroundJob.create).toHaveBeenCalledOnce();
      expect(mockPrisma.backgroundJob.create).toHaveBeenCalledWith({
        data: {
          shop,
          jobType: "goal_analysis",
          status: "pending",
          payload: JSON.stringify({ shop }),
          maxAttempts: 3,
        },
      });
    });

    it("returns existing job and skips creation when a pending job exists", async () => {
      const existingJob = {
        id: "existing-pending",
        shop,
        jobType: "goal_analysis",
        status: "pending",
      };
      mockPrisma.backgroundJob.findFirst.mockResolvedValue(existingJob);

      const result = await scheduler.enqueueGoalAnalysis(shop);

      expect(result).toEqual(existingJob);
      expect(mockPrisma.backgroundJob.create).not.toHaveBeenCalled();
    });

    it("queries findFirst with the correct where clause", async () => {
      mockPrisma.backgroundJob.findFirst.mockResolvedValue(null);
      mockPrisma.backgroundJob.create.mockResolvedValue({ id: "new" });

      await scheduler.enqueueGoalAnalysis(shop);

      expect(mockPrisma.backgroundJob.findFirst).toHaveBeenCalledWith({
        where: {
          shop,
          jobType: "goal_analysis",
          status: { in: ["pending", "running"] },
        },
      });
    });
  });

  describe("enqueueGoalExecution", () => {
    const shop = "test-shop.myshopify.com";
    const executionId = "exec-abc-123";

    it("creates a new job with shop and executionId in the payload", async () => {
      const createdJob = {
        id: "exec-job-1",
        shop,
        jobType: "goal_execute",
        status: "pending",
      };
      mockPrisma.backgroundJob.create.mockResolvedValue(createdJob);

      const result = await scheduler.enqueueGoalExecution(shop, executionId);

      expect(result).toEqual(createdJob);
      expect(mockPrisma.backgroundJob.create).toHaveBeenCalledWith({
        data: {
          shop,
          jobType: "goal_execute",
          status: "pending",
          payload: JSON.stringify({ shop, executionId }),
          maxAttempts: 3,
        },
      });
    });

    it("sets jobType to goal_execute", async () => {
      mockPrisma.backgroundJob.create.mockResolvedValue({ id: "j" });

      await scheduler.enqueueGoalExecution(shop, executionId);

      const callArgs = mockPrisma.backgroundJob.create.mock.calls[0][0];
      expect(callArgs.data.jobType).toBe("goal_execute");
    });
  });
});
