/**
 * Landing Page — task list showing what needs attention.
 *
 * Initial data is loaded server-side via the route loader. "Generate" is
 * wired to the App Bridge TitleBar primary action; the generate job is
 * polled with a fetcher and the loader is revalidated when the job
 * finishes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getGoalExecutionsForShop } from "../services/goals.server";
import { normalizeExecution } from "./api.goals";
import type { GoalExecution } from "../components/goals/GoalExecutionCard";
import { TaskList, type GeneratingState } from "../components/goals/TaskList";

const JOB_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { data } = await getGoalExecutionsForShop(
    session.shop,
    { sortBy: "impactScore" },
    { limit: 50, offset: 0 },
  );
  const executions = data.map((e) =>
    normalizeExecution(e as unknown as Record<string, unknown>),
  ) as unknown as GoalExecution[];
  return { executions };
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

type GenerateResponse = { jobId?: string; error?: string };
type JobStatusResponse = { status: string; error: string | null };

export default function RecommendationsPage() {
  const { executions } = useLoaderData<typeof loader>();
  const [greeting] = useState(getGreeting);

  const generateFetcher = useFetcher<GenerateResponse>();
  const jobFetcher = useFetcher<JobStatusResponse>();
  const revalidator = useRevalidator();

  const [generating, setGenerating] = useState<GeneratingState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleGenerate = useCallback(() => {
    const startedAt = Date.now();
    setGenerating({ phase: "queued", jobId: null, startedAt, error: null });
    generateFetcher.submit(
      { action: "generate" },
      {
        method: "POST",
        action: "/api/goals",
        encType: "application/json",
      },
    );
  }, [generateFetcher]);

  const dismissError = useCallback(() => {
    setGenerating(null);
  }, []);

  // Capture jobId once the generate POST resolves.
  useEffect(() => {
    if (generateFetcher.state !== "idle" || !generateFetcher.data) return;
    const { jobId, error } = generateFetcher.data;
    setGenerating((prev) => {
      if (!prev || prev.jobId) return prev;
      if (error || !jobId) {
        return {
          ...prev,
          phase: "error",
          error: error ?? "Failed to start generation.",
        };
      }
      return { ...prev, jobId };
    });
  }, [generateFetcher.state, generateFetcher.data]);

  // Poll job status while a jobId is active.
  useEffect(() => {
    if (!generating?.jobId) return;
    if (generating.phase === "done" || generating.phase === "error") return;

    const jobId = generating.jobId;
    const startedAt = generating.startedAt;

    const tick = () => {
      if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
        stopPolling();
        setGenerating((prev) =>
          prev
            ? {
                ...prev,
                phase: "error",
                error:
                  "Generation is taking longer than expected. Your recommendations may still appear shortly.",
              }
            : prev,
        );
        return;
      }
      jobFetcher.load(`/api/goals?type=job&jobId=${jobId}`);
    };

    tick();
    pollRef.current = setInterval(tick, JOB_POLL_INTERVAL_MS);
    return stopPolling;
  }, [generating?.jobId, generating?.startedAt, generating?.phase, jobFetcher, stopPolling]);

  // React to job status updates.
  useEffect(() => {
    if (!jobFetcher.data) return;
    const { status, error } = jobFetcher.data;

    if (status === "completed") {
      stopPolling();
      setGenerating((prev) => (prev ? { ...prev, phase: "done" } : prev));
      void revalidator.revalidate();
      const t = setTimeout(() => setGenerating(null), 1500);
      return () => clearTimeout(t);
    }
    if (status === "failed") {
      stopPolling();
      setGenerating((prev) =>
        prev
          ? { ...prev, phase: "error", error: error ?? "Generation failed. Please try again." }
          : prev,
      );
      return;
    }
    if (status === "running") {
      setGenerating((prev) => {
        if (!prev) return prev;
        const elapsed = Date.now() - prev.startedAt;
        const phase = elapsed > 10_000 ? "analyzing" : "running";
        return { ...prev, phase };
      });
    }
  }, [jobFetcher.data, revalidator, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const isGenerating =
    generating !== null && generating.phase !== "error" && generating.phase !== "done";

  // `variant` is a TitleBar-specific attribute on its button child; it isn't in
  // the standard HTMLButtonElement types, so we spread it via a cast.
  const titleBarPrimaryProps = {
    variant: "primary",
  } as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <>
      <TitleBar title={greeting}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          {...titleBarPrimaryProps}
        >
          {isGenerating ? "Generating..." : "Generate recommendations"}
        </button>
      </TitleBar>

      <div style={{ padding: "24px 32px", maxWidth: 800, margin: "0 auto" }}>
        {/* <div style={{ marginBottom: 28 }}>
          <p
            style={{
              fontSize: 14,
              color: "var(--s-color-text-secondary, #616161)",
              margin: 0,
            }}
          >
            Here's what needs your attention.
          </p>
        </div> */}

        <TaskList
          executions={executions}
          generating={generating}
          onGenerate={handleGenerate}
          onDismissGenerateError={dismissError}
        />
      </div>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
