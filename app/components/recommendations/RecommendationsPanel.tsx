import { useState, useEffect, useCallback, useRef } from "react";
import { RecommendationCard, type Recommendation } from "./RecommendationCard";
import { AGENT_NAME } from "../../config/agent";

interface RecommendationsPanelProps {
  readonly onChatHandoff?: (prompt: string) => void;
}

type CategoryFilter = "all" | Recommendation["category"];

type GeneratingPhase = "queued" | "running" | "analyzing" | "done" | "error";

interface GeneratingState {
  phase: GeneratingPhase;
  jobId: string | null;
  startedAt: number;
  error: string | null;
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inventory", label: "Inventory" },
  { value: "customer", label: "Customer" },
  { value: "reporting", label: "Reporting" },
  { value: "sync", label: "Sync" },
  { value: "marketing", label: "Marketing" },
];

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
  const isError = state.phase === "error";

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
      {/* Animated icon area */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: isError
            ? "#FEF2F2"
            : "linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {isError ? (
          <s-icon type="alert-circle" />
        ) : (
          <s-spinner size="large" accessibilityLabel="Generating recommendations" />
        )}
      </div>

      {/* Status text */}
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: isError ? "#DC2626" : "var(--s-color-text, #1a1a1a)",
            marginBottom: 8,
          }}
        >
          {isError ? "Something went wrong" : `${AGENT_NAME} is analyzing your store`}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            lineHeight: 1.6,
          }}
        >
          {isError
            ? state.error || "An error occurred while generating recommendations. Please try again."
            : PHASE_STEPS[currentPhaseIndex]?.detail || "Working on it..."}
        </div>
        {!isError && (
          <div
            style={{
              fontSize: 12,
              color: "var(--s-color-text-secondary, #919191)",
              marginTop: 8,
            }}
          >
            Elapsed: {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      {/* Step progress */}
      {!isError && (
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
                {/* Connector line + circle */}
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
                  {i < PHASE_STEPS.length - 2 && (
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

                {/* Label */}
                <div style={{ paddingTop: 2, paddingBottom: i < PHASE_STEPS.length - 2 ? 16 : 0 }}>
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
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

export function RecommendationsPanel({
  onChatHandoff,
}: RecommendationsPanelProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [generating, setGenerating] = useState<GeneratingState | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const jobPollRef = useRef<NodeJS.Timeout | null>(null);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current) {
      clearInterval(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const fetchRecommendations = useCallback(async () => {
    try {
      const response = await fetch("/api/goals");
      if (response.ok) {
        const data = await response.json();
        setRecommendations(data.executions || []);
      }
    } catch (error) {
      console.error("Failed to fetch recommendations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pollJobStatus = useCallback(
    (jobId: string, startedAt: number) => {
      stopJobPolling();

      const poll = async () => {
        // Check for timeout
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
            await fetchRecommendations();
            // Brief pause so user sees "done" state
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
            // After 10s of running, show "analyzing" phase
            const phase = elapsed > 10_000 ? "analyzing" : "running";
            setGenerating((prev) => prev ? { ...prev, phase } : null);
          }
          // "pending" → stay in "queued" phase
        } catch (error) {
          console.error("Failed to poll job status:", error);
        }
      };

      // Poll immediately then on interval
      void poll();
      jobPollRef.current = setInterval(() => void poll(), JOB_POLL_INTERVAL_MS);
    },
    [fetchRecommendations, stopJobPolling],
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
    async (recommendation: Recommendation) => {
      try {
        setRecommendations((prev) =>
          prev.map((r) =>
            r.id === recommendation.id ? { ...r, status: "in_progress" as const } : r
          )
        );

        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "execute", executionId: recommendation.id }),
        });

        if (response.ok) {
          const data = await response.json();

          if (data.handoff && data.prompt && onChatHandoff) {
            onChatHandoff(data.prompt);
          }

          setRecommendations((prev) =>
            prev.map((r) =>
              r.id === recommendation.id
                ? { ...r, status: data.status || "completed" }
                : r
            )
          );
        } else {
          setRecommendations((prev) =>
            prev.map((r) =>
              r.id === recommendation.id ? { ...r, status: "failed" as const } : r
            )
          );
        }
      } catch (error) {
        console.error("Failed to execute recommendation:", error);
        setRecommendations((prev) =>
          prev.map((r) =>
            r.id === recommendation.id ? { ...r, status: "failed" as const } : r
          )
        );
      }
    },
    [onChatHandoff]
  );

  const handleDismiss = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", executionId: id }),
      });

      if (response.ok) {
        setRecommendations((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error("Failed to dismiss recommendation:", error);
    }
  }, []);

  useEffect(() => {
    void fetchRecommendations();
  }, [fetchRecommendations]);

  // Cleanup job polling on unmount
  useEffect(() => {
    return () => stopJobPolling();
  }, [stopJobPolling]);

  useEffect(() => {
    const hasInProgress = recommendations.some((r) => r.status === "in_progress");

    if (hasInProgress && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(() => {
        void fetchRecommendations();
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
  }, [recommendations, fetchRecommendations]);

  const filteredRecommendations =
    selectedCategory === "all"
      ? recommendations
      : recommendations.filter((r) => r.category === selectedCategory);

  const pendingCount = recommendations.filter((r) => r.status === "pending").length;
  const completedCount = recommendations.filter((r) => r.status === "completed").length;

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
        <s-spinner size="large" accessibilityLabel="Loading recommendations" />
      </div>
    );
  }

  // Show generating view when a generation job is in progress
  if (generating && generating.phase !== "error") {
    return <GeneratingView state={generating} />;
  }

  if (recommendations.length === 0) {
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
        {/* Error banner if generation failed */}
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
            {AGENT_NAME} analyzes your connected data sources and generates
            actionable recommendations. Click below to generate your first batch.
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
            transition: "background 0.15s",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            marginTop: 8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "var(--s-color-bg-fill-emphasis, #303030)";
          }}
        >
          Generate Recommendations
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Error banner if generation failed while recommendations exist */}
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
                color: "var(--s-color-text, #1a1a1a)",
                lineHeight: 1,
              }}
            >
              {recommendations.length}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--s-color-text-secondary, #616161)",
                marginTop: 4,
              }}
            >
              Total
            </div>
          </div>
        </div>

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
              e.currentTarget.style.background =
                "var(--s-color-bg-surface-hover, #f6f6f7)";
              e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
            }
          }}
          onMouseLeave={(e) => {
            if (!generating || generating.phase === "error") {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor =
                "var(--s-color-border-secondary, #e3e3e3)";
            }
          }}
        >
          <s-icon type="refresh" />
          Refresh
        </button>
      </div>

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
              ? recommendations.length
              : recommendations.filter((r) => r.category === category.value).length;
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
                  e.currentTarget.style.background =
                    "var(--s-color-bg-surface-hover, #f6f6f7)";
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

      {/* Recommendation cards grid */}
      {filteredRecommendations.length === 0 ? (
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
          {filteredRecommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onExecute={handleExecute}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
