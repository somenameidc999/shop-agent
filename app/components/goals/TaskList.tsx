/**
 * TaskList — presentational task list for the landing page.
 *
 * Data flows from the route loader (via props). Mutations go through
 * useFetcher; revalidation keeps the loader data fresh. Polls while any
 * execution is in flight.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useFetchers, useRevalidator } from "react-router";
import type { GoalExecution } from "./GoalExecutionCard";
import { TaskCard } from "./TaskCard";
import { AGENT_NAME } from "../../config/agent";

export type GeneratingPhase = "queued" | "running" | "analyzing" | "done" | "error";

export interface GeneratingState {
  readonly phase: GeneratingPhase;
  readonly jobId: string | null;
  readonly startedAt: number;
  readonly error: string | null;
}

const POLL_INTERVAL_MS = 3_000;

const PHASE_DETAIL: Record<GeneratingPhase, string> = {
  queued: "Preparing to analyze your store data...",
  running: "Gathering data from your connected services...",
  analyzing: "AI is reviewing your data and generating insights...",
  done: "Recommendations are ready!",
  error: "",
};

export function GeneratingView({ state }: { readonly state: GeneratingState }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.startedAt]);

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "48px 40px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <s-spinner size="large" accessibilityLabel="Generating recommendations" />
      </div>

      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--s-color-text, #1a1a1a)",
            marginBottom: 6,
          }}
        >
          {AGENT_NAME} is analyzing your store
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            lineHeight: 1.5,
          }}
        >
          {PHASE_DETAIL[state.phase] || "Working on it..."}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--s-color-text-secondary, #919191)",
            marginTop: 6,
          }}
        >
          Elapsed: {formatElapsed(elapsed)}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({
  error,
  onDismiss,
}: {
  readonly error: string | null;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      style={{
        padding: "14px 20px",
        borderRadius: 12,
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        color: "#DC2626",
        fontSize: 14,
        lineHeight: 1.5,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>{error}</span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          all: "unset",
          cursor: "pointer",
          fontWeight: 600,
          textDecoration: "underline",
          flexShrink: 0,
          marginLeft: 16,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

interface TaskListProps {
  readonly executions: readonly GoalExecution[];
  readonly generating: GeneratingState | null;
  readonly onGenerate: () => void;
  readonly onDismissGenerateError: () => void;
}

export function TaskList({
  executions,
  generating,
  onGenerate,
  onDismissGenerateError,
}: TaskListProps) {
  const executeFetcher = useFetcher<{ success?: boolean }>();
  const fetchers = useFetchers();
  const revalidator = useRevalidator();

  // Track executionIds currently submitting an "execute" action so we can
  // paint them as in_progress before the worker flips the DB status.
  const pendingExecuteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of fetchers) {
      if (f.state === "idle") continue;
      const body = f.json as { action?: string; executionId?: string } | undefined;
      if (body?.action === "execute" && body.executionId) {
        ids.add(body.executionId);
      }
    }
    return ids;
  }, [fetchers]);

  // After an execute submission resolves, refresh loader data so the card
  // moves into its server-reported state.
  useEffect(() => {
    if (executeFetcher.state === "idle" && executeFetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [executeFetcher.state, executeFetcher.data, revalidator]);

  // Poll while anything is in flight. Covers the optimistic window,
  // the queued-but-not-yet-running window, and the worker-running window.
  const hasInFlight =
    executions.some((e) => e.status === "in_progress" || e.queued) ||
    pendingExecuteIds.size > 0;

  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(() => revalidator.revalidate(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasInFlight, revalidator]);

  const handleExecute = useCallback(
    (execution: GoalExecution) => {
      executeFetcher.submit(
        { action: "execute", executionId: execution.id },
        {
          method: "POST",
          action: "/api/goals",
          encType: "application/json",
        },
      );
    },
    [executeFetcher],
  );

  const displayed: GoalExecution[] = executions.map((e) =>
    pendingExecuteIds.has(e.id) && e.status === "pending"
      ? { ...e, status: "in_progress" as const }
      : e,
  );

  const actionable = displayed.filter(
    (e) => e.status === "pending" || e.status === "in_progress" || e.status === "failed",
  );

  if (generating && generating.phase !== "error") {
    return <GeneratingView state={generating} />;
  }

  if (actionable.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "60px 40px",
        }}
      >
        {generating?.phase === "error" && (
          <ErrorBanner error={generating.error} onDismiss={onDismissGenerateError} />
        )}

        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#F0FDF4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#16A34A",
          }}
        >
          <s-icon type="check-circle-filled" />
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--s-color-text, #1a1a1a)",
              marginBottom: 6,
            }}
          >
            You're all caught up
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--s-color-text-secondary, #616161)",
              maxWidth: 360,
              lineHeight: 1.5,
            }}
          >
            No pending tasks right now. Generate new recommendations to see what {AGENT_NAME} finds.
          </div>
        </div>
        <s-button variant="primary" onClick={onGenerate}>
          Generate recommendations
        </s-button>
      </div>
    );
  }

  return (
    <div>
      {generating?.phase === "error" && (
        <ErrorBanner error={generating.error} onDismiss={onDismissGenerateError} />
      )}

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--s-color-text-secondary, #616161)",
          marginBottom: 16,
        }}
      >
        {actionable.length} item{actionable.length !== 1 ? "s" : ""} need
        {actionable.length === 1 ? "s" : ""} attention
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {actionable.map((execution) => (
          <TaskCard
            key={execution.id}
            execution={execution}
            onExecute={handleExecute}
          />
        ))}
      </div>
    </div>
  );
}
