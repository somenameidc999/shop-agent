/**
 * Scheduler — Delayed Outcome Measurement Tests
 *
 * Tests the enqueueDelayedOutcomeMeasurement function.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../app/db.server", () => ({
  default: {
    backgroundJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    shop: {
      findMany: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "../../app/db.server";
import {
  enqueueDelayedOutcomeMeasurement,
  enqueueOutcomeMeasurement,
} from "../../app/jobs/scheduler.server";

const mockPrisma = vi.mocked(prisma);

describe("enqueueDelayedOutcomeMeasurement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending job with delayed scheduledAt", async () => {
    const mockJob = {
      id: "job-delayed-1",
      shop: "test.myshopify.com",
      jobType: "goal_measure_outcome",
      status: "pending",
      payload: JSON.stringify({ shop: "test.myshopify.com", executionId: "exec-1" }),
      maxAttempts: 3,
      scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    mockPrisma.backgroundJob.create.mockResolvedValue(mockJob as any);

    const now = Date.now();
    const result = await enqueueDelayedOutcomeMeasurement(
      "test.myshopify.com",
      "exec-1",
      7,
    );

    expect(result.id).toBe("job-delayed-1");

    const createCall = (mockPrisma.backgroundJob.create as Mock).mock.calls[0][0];
    expect(createCall.data.jobType).toBe("goal_measure_outcome");
    expect(createCall.data.status).toBe("pending");
    expect(createCall.data.maxAttempts).toBe(3);

    const payload = JSON.parse(createCall.data.payload);
    expect(payload.shop).toBe("test.myshopify.com");
    expect(payload.executionId).toBe("exec-1");

    // scheduledAt should be approximately 7 days from now
    const scheduledAt = new Date(createCall.data.scheduledAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(scheduledAt).toBeGreaterThanOrEqual(now + sevenDaysMs - 1000);
    expect(scheduledAt).toBeLessThanOrEqual(now + sevenDaysMs + 1000);
  });

  it("works with different delay periods", async () => {
    mockPrisma.backgroundJob.create.mockResolvedValue({ id: "job-1" } as any);

    await enqueueDelayedOutcomeMeasurement("shop.myshopify.com", "exec-2", 14);

    const createCall = (mockPrisma.backgroundJob.create as Mock).mock.calls[0][0];
    const scheduledAt = new Date(createCall.data.scheduledAt).getTime();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    expect(scheduledAt).toBeGreaterThanOrEqual(now + fourteenDaysMs - 1000);
  });
});

describe("enqueueOutcomeMeasurement (immediate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending job for immediate execution", async () => {
    const mockJob = {
      id: "job-immediate-1",
      shop: "test.myshopify.com",
      jobType: "goal_measure_outcome",
      status: "pending",
    };
    mockPrisma.backgroundJob.create.mockResolvedValue(mockJob as any);

    const result = await enqueueOutcomeMeasurement("test.myshopify.com", "exec-1");

    expect(result.id).toBe("job-immediate-1");

    const createCall = (mockPrisma.backgroundJob.create as Mock).mock.calls[0][0];
    expect(createCall.data.jobType).toBe("goal_measure_outcome");
    expect(createCall.data.status).toBe("pending");
    expect(createCall.data.maxAttempts).toBe(3);
  });
});
