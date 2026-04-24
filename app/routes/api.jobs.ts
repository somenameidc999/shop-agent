import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function formatJob(job: {
  id: string;
  jobType: string;
  status: string;
  payload: string | null;
  result: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  shop: string;
}) {
  return {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    error: job.error ?? undefined,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    createdAt: job.createdAt.toISOString(),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");

  try {
    if (jobId) {
      const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
      if (!job || job.shop !== session.shop) {
        return Response.json({ error: "Job not found" }, { status: 404 });
      }
      return Response.json(formatJob(job));
    }

    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      prisma.backgroundJob.count({ where: { shop: session.shop } }),
    ]);
    return Response.json({ jobs: jobs.map(formatJob), total, limit, offset });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch jobs", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  let body: { action?: unknown; jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "retry") {
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : null;
  if (!jobId) {
    return Response.json({ error: "jobId is required" }, { status: 400 });
  }

  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job || job.shop !== session.shop) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "failed") {
    return Response.json(
      { error: `Only failed jobs can be retried (current status: ${job.status})` },
      { status: 409 },
    );
  }

  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      attempts: 0,
      error: null,
      startedAt: null,
      completedAt: null,
      scheduledAt: new Date(),
    },
  });

  return Response.json(formatJob(updated));
}
