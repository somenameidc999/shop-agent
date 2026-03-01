/**
 * Job Handlers unit tests
 *
 * Tests the background job handler functions including:
 * - Goal analysis handler
 * - Goal execution handler
 * - Job dispatcher routing
 */

import { describe, it, expect, vi } from "vitest";
import * as handlers from "../../app/jobs/handlers.server";

vi.mock("../../app/services/goals.server", () => ({
  analyzeGoals: vi.fn(),
  executeGoalExecution: vi.fn(),
}));

describe("Job Handlers", () => {
  describe("handleGoalAnalysis", () => {
    it("should be a function", () => {
      expect(typeof handlers.handleGoalAnalysis).toBe("function");
    });

    it("should accept payload parameter", () => {
      expect(handlers.handleGoalAnalysis.length).toBe(1);
    });
  });

  describe("handleGoalExecution", () => {
    it("should be a function", () => {
      expect(typeof handlers.handleGoalExecution).toBe("function");
    });

    it("should accept payload parameter", () => {
      expect(handlers.handleGoalExecution.length).toBe(1);
    });
  });

  describe("handleJob", () => {
    it("should be a function", () => {
      expect(typeof handlers.handleJob).toBe("function");
    });

    it("should accept jobType and payload parameters", () => {
      expect(handlers.handleJob.length).toBe(2);
    });

    it("should throw error for unknown job type", async () => {
      await expect(
        handlers.handleJob("unknown_job_type", {})
      ).rejects.toThrow("Unknown job type: unknown_job_type");
    });
  });
});
