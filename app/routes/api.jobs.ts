/**
 * Jobs API Route
 *
 * Provides job status polling endpoint for background jobs.
 * GET handler with ?jobId=xxx query param
 * Returns job status: { status, result, error }
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GET handler: Get job status by jobId
 * Query params: jobId (required)
 * Returns: { status: "pending" | "running" | "completed" | "failed", result?: string, error?: string }
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const jobId = url.searchParams.get("jobId");

  if (!jobId) {
    return Response.json(
      { error: "jobId query parameter is required" },
      { status: 400 },
    );
  }

  try {
    // Fetch the job
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify the job belongs to this shop
    if (job.shop !== session.shop) {
      return Response.json(
        { error: "Job does not belong to this shop" },
        { status: 403 },
      );
    }

    // Map database status to API status
    // Database statuses: "pending", "running", "completed", "failed"
    let status: "pending" | "running" | "completed" | "failed";

    if (job.status === "pending") {
      status = "pending";
    } else if (job.status === "running") {
      status = "running";
    } else if (job.status === "completed") {
      status = "completed";
    } else if (job.status === "failed") {
      status = "failed";
    } else {
      // Handle any unexpected status values
      status = job.status as "pending" | "running" | "completed" | "failed";
    }

    // Build response
    const response: {
      status: "pending" | "running" | "completed" | "failed";
      jobId: string;
      jobType: string;
      result?: string;
      error?: string;
      attempts?: number;
      maxAttempts?: number;
      startedAt?: string;
      completedAt?: string;
    } = {
      status,
      jobId: job.id,
      jobType: job.jobType,
    };

    // Include result if completed
    if (job.result) {
      response.result = job.result;
    }

    // Include error if failed
    if (job.error) {
      response.error = job.error;
    }

    // Include attempt information
    response.attempts = job.attempts;
    response.maxAttempts = job.maxAttempts;

    // Include timestamps
    if (job.startedAt) {
      response.startedAt = job.startedAt.toISOString();
    }
    if (job.completedAt) {
      response.completedAt = job.completedAt.toISOString();
    }

    return Response.json(response);
  } catch (error) {
    console.error("[API] Error fetching job status:", error);
    return Response.json(
      {
        error: "Failed to fetch job status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
