import { useState, useEffect, useCallback, useRef } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

interface BackgroundJob {
  id: string;
  jobType: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  attempts: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  goal_analysis: "Analyze Goals",
  goal_execute: "Execute Recommendation",
  outcome_measurement: "Measure Outcome",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: "Queued", bg: "#FEF9C3", color: "#854D0E" },
  running: { label: "Running", bg: "#DBEAFE", color: "#1D4ED8" },
  completed: { label: "Completed", bg: "#DCFCE7", color: "#15803D" },
  failed: { label: "Failed", bg: "#FEE2E2", color: "#DC2626" },
};

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "#F3F4F6", color: "#374151" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {status === "running" && <s-spinner size="base" accessibilityLabel="" />}
      {cfg.label}
    </span>
  );
}

const PAGE_SIZE = 20;

export default function JobsPage() {
  const [mounted, setMounted] = useState(false);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchJobs = useCallback(async (pageIndex: number) => {
    try {
      const offset = pageIndex * PAGE_SIZE;
      const res = await fetch(`/api/jobs?limit=${PAGE_SIZE}&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs ?? []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      }
    } catch (e) {
      console.error("Failed to fetch jobs:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void fetchJobs(page);
  }, [mounted, page, fetchJobs]);

  const retryJob = useCallback(
    async (jobId: string) => {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.add(jobId);
        return next;
      });
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry", jobId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Retry failed:", data);
        }
        await fetchJobs(page);
      } catch (e) {
        console.error("Retry error:", e);
      } finally {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [page, fetchJobs],
  );

  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "running");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => void fetchJobs(page), 3000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, page, fetchJobs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE + jobs.length);
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const style = {
    page: {
      maxWidth: 900,
      margin: "0 auto",
      padding: "32px 24px",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    } as React.CSSProperties,
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    } as React.CSSProperties,
    title: { fontSize: 20, fontWeight: 700, color: "var(--s-color-text, #1a1a1a)" },
    refreshBtn: {
      all: "unset" as const,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 8,
      border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--s-color-text, #1a1a1a)",
      background: "var(--s-color-bg-surface, #fff)",
    } as React.CSSProperties,
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      background: "var(--s-color-bg-surface, #fff)",
      border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
      borderRadius: 12,
      overflow: "hidden",
    } as React.CSSProperties,
    th: {
      padding: "11px 16px",
      textAlign: "left" as const,
      fontSize: 12,
      fontWeight: 600,
      color: "var(--s-color-text-secondary, #616161)",
      background: "var(--s-color-bg-surface-secondary, #f9f9f9)",
      borderBottom: "1px solid var(--s-color-border-secondary, #e3e3e3)",
    } as React.CSSProperties,
    td: {
      padding: "12px 16px",
      fontSize: 13,
      color: "var(--s-color-text, #1a1a1a)",
      borderBottom: "1px solid var(--s-color-border-secondary, #e3e3e3)",
      verticalAlign: "top" as const,
    } as React.CSSProperties,
    empty: {
      padding: "64px 24px",
      textAlign: "center" as const,
      color: "var(--s-color-text-secondary, #616161)",
      fontSize: 14,
    } as React.CSSProperties,
    pager: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 16,
      gap: 12,
    } as React.CSSProperties,
    pagerRange: {
      fontSize: 13,
      color: "var(--s-color-text-secondary, #616161)",
    } as React.CSSProperties,
    pagerBtns: { display: "flex", gap: 8 } as React.CSSProperties,
    pagerBtn: (enabled: boolean): React.CSSProperties => ({
      all: "unset",
      cursor: enabled ? "pointer" : "not-allowed",
      padding: "6px 14px",
      borderRadius: 8,
      border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
      fontSize: 13,
      fontWeight: 600,
      color: enabled
        ? "var(--s-color-text, #1a1a1a)"
        : "var(--s-color-text-secondary, #919191)",
      background: "var(--s-color-bg-surface, #fff)",
      opacity: enabled ? 1 : 0.6,
    }),
    retryBtn: (enabled: boolean): React.CSSProperties => ({
      all: "unset",
      cursor: enabled ? "pointer" : "not-allowed",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 6,
      border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
      fontSize: 12,
      fontWeight: 600,
      color: enabled
        ? "var(--s-color-text, #1a1a1a)"
        : "var(--s-color-text-secondary, #919191)",
      background: "var(--s-color-bg-surface, #fff)",
      opacity: enabled ? 1 : 0.5,
    }),
  };

  if (!mounted) {
    return (
      <div style={{ ...style.page, ...style.empty }}>
        <s-spinner size="large" accessibilityLabel="Loading" />
      </div>
    );
  }

  return (
    <div style={style.page}>
      <div style={style.header}>
        <div>
          <div style={style.title}>Background Jobs</div>
          <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", marginTop: 4 }}>
            History of all tasks run by the agent
          </div>
        </div>
        <button type="button" style={style.refreshBtn} onClick={() => void fetchJobs(page)}>
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div style={{ ...style.empty }}>
          <s-spinner size="large" accessibilityLabel="Loading jobs" />
        </div>
      ) : jobs.length === 0 ? (
        <div style={style.empty}>No jobs yet. Jobs appear here when the agent analyzes goals or executes recommendations.</div>
      ) : (
        <table style={style.table}>
          <thead>
            <tr>
              <th style={style.th}>Type</th>
              <th style={style.th}>Status</th>
              <th style={style.th}>Started</th>
              <th style={style.th}>Duration</th>
              <th style={style.th}>Attempts</th>
              <th style={style.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, i) => (
              <tr key={job.id} style={{ background: i % 2 === 1 ? "var(--s-color-bg-surface-secondary, #f9f9f9)" : undefined }}>
                <td style={style.td}>
                  <div style={{ fontWeight: 600 }}>
                    {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #919191)", marginTop: 2 }}>
                    {job.id.slice(0, 8)}…
                  </div>
                </td>
                <td style={style.td}>
                  <StatusBadge status={job.status} />
                  {job.error && (
                    <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4, maxWidth: 260 }}>
                      {job.error}
                    </div>
                  )}
                </td>
                <td style={{ ...style.td, whiteSpace: "nowrap" }}>
                  {formatTime(job.startedAt ?? job.createdAt)}
                </td>
                <td style={{ ...style.td, whiteSpace: "nowrap" }}>
                  {formatDuration(job.startedAt, job.completedAt)}
                </td>
                <td style={{ ...style.td, whiteSpace: "nowrap" }}>
                  {job.attempts} / {job.maxAttempts}
                </td>
                <td style={{ ...style.td, whiteSpace: "nowrap" }}>
                  {(() => {
                    const isRetrying = retryingIds.has(job.id);
                    const canRetry = job.status === "failed" && !isRetrying;
                    return (
                      <button
                        type="button"
                        style={style.retryBtn(canRetry)}
                        disabled={!canRetry}
                        onClick={() => canRetry && void retryJob(job.id)}
                        title={
                          job.status === "failed"
                            ? "Retry this job"
                            : "Only failed jobs can be retried"
                        }
                      >
                        {isRetrying ? (
                          <s-spinner size="base" accessibilityLabel="Retrying" />
                        ) : null}
                        Retry
                      </button>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && total > 0 && (
        <div style={style.pager}>
          <div style={style.pagerRange}>
            {rangeStart}–{rangeEnd} of {total}
          </div>
          <div style={style.pagerBtns}>
            <button
              type="button"
              style={style.pagerBtn(canPrev)}
              disabled={!canPrev}
              onClick={() => canPrev && setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              style={style.pagerBtn(canNext)}
              disabled={!canNext}
              onClick={() => canNext && setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
