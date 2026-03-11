import { useState, useEffect, useCallback, useRef } from "react";
import { GoalExecutionCard, type GoalExecution } from "./GoalExecutionCard";
import { AGENT_NAME } from "../../config/agent";

type CategoryFilter = "all" | GoalExecution["category"];
type SortOption = "impactScore" | "priority" | "newest";

interface GoalSummary {
  id: string;
  title: string;
  ruleKey: string;
  category: string;
}

type GeneratingPhase = "queued" | "running" | "analyzing" | "done" | "error";

interface GeneratingState {
  phase: GeneratingPhase;
  jobId: string | null;
  startedAt: number;
  error: string | null;
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "catalog", label: "Catalog" },
  { value: "reporting", label: "Reporting" },
  { value: "customer", label: "Customer" },
  { value: "marketing", label: "Marketing" },
  { value: "operations", label: "Operations" },
  { value: "inventory", label: "Inventory" },
  { value: "sync", label: "Sync" },
  { value: "general", label: "General" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "impactScore", label: "Impact Score" },
  { value: "priority", label: "Priority" },
  { value: "newest", label: "Newest" },
];

const CATEGORY_COLORS: Record<string, string> = {
  catalog: "#8B5CF6",
  reporting: "#10B981",
  customer: "#3B82F6",
  marketing: "#EC4899",
  operations: "#F59E0B",
  inventory: "#7C3AED",
  sync: "#F97316",
  general: "#6B7280",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const JOB_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

const PHASE_STEPS: { phase: GeneratingPhase; label: string; detail: string }[] = [
  { phase: "queued", label: "Request queued", detail: "Preparing to analyze your store data..." },
  { phase: "running", label: "Connecting to data sources", detail: "Gathering data from your connected services..." },
  { phase: "analyzing", label: "Analyzing your store", detail: "AI is reviewing your data and generating insights..." },
  { phase: "done", label: "Complete", detail: "Recommendations are ready!" },
];

function GeneratingView({ state }: { readonly state: GeneratingState }) {
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

  const currentPhaseIndex = PHASE_STEPS.findIndex((s) => s.phase === state.phase);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: "60px 40px",
      }}
    >
      {/* Animated icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <s-spinner size="large" accessibilityLabel="Generating recommendations" />
      </div>

      {/* Status text */}
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--s-color-text, #1a1a1a)",
            marginBottom: 8,
          }}
        >
          {AGENT_NAME} is analyzing your store
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            lineHeight: 1.6,
          }}
        >
          {PHASE_STEPS[currentPhaseIndex]?.detail || "Working on it..."}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--s-color-text-secondary, #919191)",
            marginTop: 8,
          }}
        >
          Elapsed: {formatElapsed(elapsed)}
        </div>
      </div>

      {/* Step progress */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          width: "100%",
          maxWidth: 360,
        }}
      >
        {PHASE_STEPS.filter((s) => s.phase !== "done").map((step, i) => {
          const isActive = i === currentPhaseIndex;
          const isComplete = i < currentPhaseIndex;
          const isPending = i > currentPhaseIndex;

          return (
            <div key={step.phase} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 24,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: isActive
                      ? "2px solid #4F46E5"
                      : isComplete
                        ? "2px solid #16A34A"
                        : "2px solid var(--s-color-border-secondary, #e3e3e3)",
                    background: isComplete ? "#16A34A" : "var(--s-color-bg-surface, #fff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s ease",
                    flexShrink: 0,
                  }}
                >
                  {isComplete ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isActive ? (
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#4F46E5",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  ) : null}
                </div>
                {i < 2 && (
                  <div
                    style={{
                      width: 2,
                      height: 28,
                      background: isComplete
                        ? "#16A34A"
                        : "var(--s-color-border-secondary, #e3e3e3)",
                      transition: "background 0.3s ease",
                    }}
                  />
                )}
              </div>

              <div style={{ paddingTop: 2, paddingBottom: i < 2 ? 16 : 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    color: isPending
                      ? "var(--s-color-text-secondary, #919191)"
                      : "var(--s-color-text, #1a1a1a)",
                    transition: "color 0.3s ease",
                  }}
                >
                  {step.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

export function GoalsPanel() {
  const [executions, setExecutions] = useState<GoalExecution[]>([]);
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generating, setGenerating] = useState<GeneratingState | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("impactScore");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const jobPollRef = useRef<NodeJS.Timeout | null>(null);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const fetchExecutions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sortBy });
      if (selectedGoalId) params.set("goalId", selectedGoalId);
      const response = await fetch(`/api/goals?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch (error) {
      console.error("Failed to fetch goal executions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sortBy, selectedGoalId]);

  const fetchGoals = useCallback(async () => {
    try {
      const response = await fetch("/api/goals?type=goals");
      if (response.ok) {
        const data = await response.json();
        setGoals(
          (data.goals || []).map((g: GoalSummary) => ({
            id: g.id,
            title: g.title,
            ruleKey: g.ruleKey,
            category: g.category,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch goals:", error);
    }
  }, []);

  const pollJobStatus = useCallback(
    (jobId: string, startedAt: number) => {
      stopJobPolling();

      const poll = async () => {
        if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
          stopJobPolling();
          setGenerating({
            phase: "error",
            jobId,
            startedAt,
            error: "Generation is taking longer than expected. Your recommendations may still appear shortly.",
          });
          return;
        }

        try {
          const response = await fetch(`/api/goals?type=job&jobId=${jobId}`);
          if (!response.ok) return;

          const job = await response.json();

          if (job.status === "completed") {
            stopJobPolling();
            setGenerating({ phase: "done", jobId, startedAt, error: null });
            await fetchExecutions();
            setTimeout(() => setGenerating(null), 1500);
          } else if (job.status === "failed") {
            stopJobPolling();
            setGenerating({
              phase: "error",
              jobId,
              startedAt,
              error: job.error || "Generation failed. Please try again.",
            });
          } else if (job.status === "running") {
            const elapsed = Date.now() - startedAt;
            const phase = elapsed > 10_000 ? "analyzing" : "running";
            setGenerating((prev) => prev ? { ...prev, phase } : null);
          }
        } catch (error) {
          console.error("Failed to poll job status:", error);
        }
      };

      void poll();
      jobPollRef.current = setInterval(() => void poll(), JOB_POLL_INTERVAL_MS);
    },
    [fetchExecutions, stopJobPolling],
  );

  const handleRefresh = useCallback(async () => {
    const startedAt = Date.now();
    setGenerating({ phase: "queued", jobId: null, startedAt, error: null });

    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setGenerating({
          phase: "error",
          jobId: null,
          startedAt,
          error: (errorData as { error?: string }).error || "Failed to start generation.",
        });
        return;
      }

      const data = await response.json();
      const jobId = (data as { jobId?: string }).jobId;

      if (!jobId) {
        setGenerating({
          phase: "error",
          jobId: null,
          startedAt,
          error: "No job ID returned. Please try again.",
        });
        return;
      }

      setGenerating({ phase: "queued", jobId, startedAt, error: null });
      pollJobStatus(jobId, startedAt);
    } catch (error) {
      console.error("Failed to generate recommendations:", error);
      setGenerating({
        phase: "error",
        jobId: null,
        startedAt,
        error: "Network error. Please check your connection and try again.",
      });
    }
  }, [pollJobStatus]);

  const handleExecute = useCallback(
    async (execution: GoalExecution) => {
      try {
        setExecutions((prev) =>
          prev.map((e) =>
            e.id === execution.id ? { ...e, status: "in_progress" as const } : e
          )
        );

        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "execute", executionId: execution.id }),
        });

        if (!response.ok) {
          setExecutions((prev) =>
            prev.map((e) =>
              e.id === execution.id ? { ...e, status: "failed" as const } : e
            )
          );
        }
      } catch (error) {
        console.error("Failed to execute goal:", error);
        setExecutions((prev) =>
          prev.map((e) =>
            e.id === execution.id ? { ...e, status: "failed" as const } : e
          )
        );
      }
    },
    [],
  );

  const handleDismiss = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", executionId: id }),
      });

      if (response.ok) {
        setExecutions((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (error) {
      console.error("Failed to dismiss goal execution:", error);
    }
  }, []);

  const handleMeasureOutcome = useCallback(async (id: string) => {
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "measure_outcome", executionId: id }),
      });
      // Refresh to pick up status change
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchExecutions();
    } catch (error) {
      console.error("Failed to measure outcome:", error);
    }
  }, [fetchExecutions]);

  useEffect(() => {
    void fetchExecutions();
    void fetchGoals();
  }, [fetchExecutions, fetchGoals]);

  useEffect(() => {
    return () => stopJobPolling();
  }, [stopJobPolling]);

  useEffect(() => {
    const hasInProgress = executions.some((e) => e.status === "in_progress");

    if (hasInProgress && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(() => {
        void fetchExecutions();
      }, 3000);
    } else if (!hasInProgress && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [executions, fetchExecutions]);

  const filteredExecutions =
    selectedCategory === "all"
      ? executions
      : executions.filter((e) => e.category === selectedCategory);

  const pendingCount = executions.filter((e) => e.status === "pending").length;
  const completedCount = executions.filter((e) => e.status === "completed").length;

  // Calculate total revenue opportunity (sum of midpoint estimates for pending recs)
  const totalRevenueOpportunity = executions
    .filter((e) => e.status === "pending" && e.estimatedRevenue)
    .reduce((sum, e) => {
      const rev = e.estimatedRevenue!;
      return sum + (rev.min + rev.max) / 2;
    }, 0);

  // Count high-confidence recommendations
  const highConfidenceCount = executions.filter(
    (e) => e.status === "pending" && e.confidenceLevel === "high"
  ).length;

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <s-spinner size="large" accessibilityLabel="Loading goals" />
      </div>
    );
  }

  // Show generating view when a job is in progress
  if (generating && generating.phase !== "error") {
    return <GeneratingView state={generating} />;
  }

  if (executions.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 80,
        }}
      >
        {generating?.phase === "error" && (
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "14px 20px",
              borderRadius: 12,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#DC2626",
              fontSize: 14,
              lineHeight: 1.5,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            {generating.error}
            <button
              type="button"
              onClick={() => setGenerating(null)}
              style={{
                all: "unset",
                cursor: "pointer",
                marginLeft: 12,
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <s-icon type="lightbulb" />
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--s-color-text, #1a1a1a)",
              marginBottom: 8,
            }}
          >
            No recommendations yet
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--s-color-text-secondary, #616161)",
              maxWidth: 400,
              lineHeight: 1.5,
            }}
          >
            {AGENT_NAME} analyzes your connected data sources based on your goals
            and generates actionable recommendations. Click below to generate your first batch.
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          style={{
            padding: "12px 24px",
            background: "var(--s-color-bg-fill-emphasis, #303030)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            marginTop: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--s-color-bg-fill-emphasis, #303030)"; }}
        >
          Generate Recommendations
        </button>
      </div>
    );
  }

  return (
    <div>
      {generating?.phase === "error" && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: 12,
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#DC2626",
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{generating.error}</span>
          <button
            type="button"
            onClick={() => setGenerating(null)}
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
      )}

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 24 }}>
          {totalRevenueOpportunity > 0 && (
            <>
              <div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#16A34A",
                    lineHeight: 1,
                  }}
                >
                  {formatCurrency(totalRevenueOpportunity)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--s-color-text-secondary, #616161)",
                    marginTop: 4,
                  }}
                >
                  Revenue Opportunity
                </div>
              </div>
              <div
                style={{
                  width: 1,
                  background: "var(--s-color-border-secondary, #e3e3e3)",
                }}
              />
            </>
          )}
          {highConfidenceCount > 0 && (
            <>
              <div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#16A34A",
                    lineHeight: 1,
                  }}
                >
                  {highConfidenceCount}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--s-color-text-secondary, #616161)",
                    marginTop: 4,
                  }}
                >
                  High Confidence
                </div>
              </div>
              <div
                style={{
                  width: 1,
                  background: "var(--s-color-border-secondary, #e3e3e3)",
                }}
              />
            </>
          )}
          <div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--s-color-text, #1a1a1a)",
                lineHeight: 1,
              }}
            >
              {pendingCount}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--s-color-text-secondary, #616161)",
                marginTop: 4,
              }}
            >
              Pending
            </div>
          </div>
          <div
            style={{
              width: 1,
              background: "var(--s-color-border-secondary, #e3e3e3)",
            }}
          />
          <div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#16A34A",
                lineHeight: 1,
              }}
            >
              {completedCount}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--s-color-text-secondary, #616161)",
                marginTop: 4,
              }}
            >
              Completed
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Sort control */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={{
              padding: "8px 32px 8px 12px",
              border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--s-color-text-secondary, #616161)",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 10px center",
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={generating !== null && generating.phase !== "error"}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: "var(--s-color-text-secondary, #616161)",
              border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: generating && generating.phase !== "error" ? "not-allowed" : "pointer",
              transition: "background 0.15s, border-color 0.15s",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!generating || generating.phase === "error") {
                e.currentTarget.style.background = "var(--s-color-bg-surface-hover, #f6f6f7)";
                e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
              }
            }}
            onMouseLeave={(e) => {
              if (!generating || generating.phase === "error") {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)";
              }
            }}
          >
            <s-icon type="refresh" />
            Refresh
          </button>
        </div>
      </div>

      {/* Goal-based filter chips */}
      {goals.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedGoalId(null)}
            style={{
              padding: "6px 14px",
              background: selectedGoalId === null
                ? "var(--s-color-bg-fill-emphasis, #303030)"
                : "transparent",
              color: selectedGoalId === null
                ? "#fff"
                : "var(--s-color-text-secondary, #616161)",
              border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            All Goals
          </button>
          {goals.map((goal) => {
            const color = CATEGORY_COLORS[goal.category] ?? "#6B7280";
            const isSelected = selectedGoalId === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setSelectedGoalId(isSelected ? null : goal.id)}
                style={{
                  padding: "6px 14px",
                  background: isSelected ? color + "20" : "transparent",
                  color: isSelected ? color : "var(--s-color-text-secondary, #616161)",
                  border: `1px solid ${isSelected ? color + "40" : "var(--s-color-border-secondary, #e3e3e3)"}`,
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
                {goal.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Category filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 24,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {CATEGORIES.map((category) => {
          const count =
            category.value === "all"
              ? executions.length
              : executions.filter((e) => e.category === category.value).length;
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => setSelectedCategory(category.value)}
              style={{
                padding: "8px 16px",
                background:
                  selectedCategory === category.value
                    ? "var(--s-color-bg-fill-emphasis, #303030)"
                    : "transparent",
                color:
                  selectedCategory === category.value
                    ? "#fff"
                    : "var(--s-color-text-secondary, #616161)",
                border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) => {
                if (selectedCategory !== category.value) {
                  e.currentTarget.style.background = "var(--s-color-bg-surface-hover, #f6f6f7)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedCategory !== category.value) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {category.label}
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                  background:
                    selectedCategory === category.value
                      ? "rgba(255,255,255,0.2)"
                      : "var(--s-color-bg-surface-secondary, #f6f6f7)",
                  padding: "1px 6px",
                  borderRadius: 8,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Execution cards grid */}
      {filteredExecutions.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--s-color-text-secondary, #616161)",
            fontSize: 14,
          }}
        >
          No {selectedCategory} recommendations right now.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 20,
          }}
        >
          {filteredExecutions.map((execution) => (
            <GoalExecutionCard
              key={execution.id}
              execution={execution}
              onExecute={handleExecute}
              onDismiss={handleDismiss}
              onMeasureOutcome={handleMeasureOutcome}
            />
          ))}
        </div>
      )}
    </div>
  );
}
