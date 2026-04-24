/**
 * Recommendation Detail Page
 *
 * Full detail view for a single goal execution, including impact metrics,
 * action steps, preview, feedback, and outcome measurement.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import type { GoalExecution } from "../components/goals/GoalExecutionCard";
import { ActionPreview } from "../components/recommendations/ActionPreview";
import {
  CATEGORY_META,
  PRIORITY_META,
  STATUS_CONFIG,
  CONFIDENCE_META,
  formatServerName,
  getServerIcon,
  formatCurrency,
  getImpactScoreColor,
} from "../components/goals/constants";

export default function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [execution, setExecution] = useState<GoalExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<"helpful" | "not_helpful" | null>(null);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  const fetchExecution = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`/api/goals?type=execution&id=${id}`);
      if (!response.ok) {
        setError("Recommendation not found");
        return;
      }
      const data = await response.json();
      const exec = data.execution as GoalExecution;
      setExecution(exec);
      if (exec.feedbackRating != null) {
        setFeedbackGiven(exec.feedbackRating >= 4 ? "helpful" : "not_helpful");
      }
    } catch {
      setError("Failed to load recommendation");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchExecution();
  }, [fetchExecution]);

  // Poll while in_progress or queued
  useEffect(() => {
    if (!execution) return;
    const isActive =
      execution.status === "in_progress" || Boolean(execution.queued);
    if (!isActive) return;
    const interval = setInterval(() => void fetchExecution(), 3000);
    return () => clearInterval(interval);
  }, [execution?.status, execution?.queued, fetchExecution]);

  const handleExecute = useCallback(async () => {
    if (!execution) return;
    setExecution({ ...execution, status: "in_progress" });
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", executionId: execution.id }),
      });
      if (!response.ok) {
        setExecution({ ...execution, status: "failed" });
      }
    } catch {
      setExecution({ ...execution, status: "failed" });
    }
  }, [execution]);

  const handleDismiss = useCallback(async () => {
    if (!execution) return;
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", executionId: execution.id }),
      });
      if (response.ok) {
        void navigate("/app");
      }
    } catch (err) {
      console.error("Failed to dismiss:", err);
    }
  }, [execution, navigate]);

  const handleMeasureOutcome = useCallback(async () => {
    if (!execution) return;
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "measure_outcome", executionId: execution.id }),
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchExecution();
    } catch (err) {
      console.error("Failed to measure outcome:", err);
    }
  }, [execution, fetchExecution]);

  const handleFeedback = useCallback(
    async (type: "helpful" | "not_helpful") => {
      if (!execution) return;
      setFeedbackGiven(type);
      try {
        await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "feedback",
            executionId: execution.id,
            feedbackType: type,
            rating: type === "helpful" ? 5 : 1,
          }),
        });
      } catch (err) {
        console.error("Failed to record feedback:", err);
      }
    },
    [execution],
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 120px)" }}>
        <s-spinner size="large" accessibilityLabel="Loading" />
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div style={{ padding: "24px 32px", maxWidth: 800, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => void navigate("/app")}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            marginBottom: 20,
          }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 16, color: "var(--s-color-text-secondary, #616161)" }}>
          {error || "Recommendation not found"}
        </div>
      </div>
    );
  }

  const categoryMeta = CATEGORY_META[execution.category] ?? CATEGORY_META.general;
  const priorityMeta = PRIORITY_META[execution.priority] ?? PRIORITY_META.medium;
  const statusConfig = STATUS_CONFIG[execution.status];
  const hasImpact = execution.impactScore != null && execution.impactScore > 0;
  const confidenceMeta = execution.confidenceLevel
    ? CONFIDENCE_META[execution.confidenceLevel] ?? CONFIDENCE_META.low
    : null;
  const isExecuting = execution.status === "in_progress";
  const isCompleted = execution.status === "completed";
  const isFailed = execution.status === "failed";
  const isQueued = !isExecuting && !isCompleted && Boolean(execution.queued);
  const isActionBlocked = isExecuting || isCompleted || isQueued;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 800, margin: "0 auto" }}>
      {/* Back link */}
      <button
        type="button"
        onClick={() => void navigate("/app")}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          color: "var(--s-color-text-secondary, #616161)",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          marginBottom: 24,
        }}
      >
        ← Back to tasks
      </button>

      {/* Main card */}
      <div
        style={{
          border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
          borderRadius: 16,
          background: "var(--s-color-bg-surface, #fff)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
          overflow: "hidden",
        }}
      >
        {/* Color bar */}
        <div style={{ height: 4, background: categoryMeta.color }} />

        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Badges row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                background: categoryMeta.color + "15",
                color: categoryMeta.color,
              }}
            >
              <s-icon type={categoryMeta.icon as "apps"} />
              {categoryMeta.label}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                background: priorityMeta.bg,
                color: priorityMeta.color,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: priorityMeta.color, display: "inline-block" }} />
              {priorityMeta.label}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                background: statusConfig.bg,
                color: statusConfig.color,
              }}
            >
              {isExecuting && <s-spinner size="base" accessibilityLabel="Running" />}
              {statusConfig.label}
            </span>
            {hasImpact && (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: getImpactScoreColor(execution.impactScore!),
                  lineHeight: 1,
                  marginLeft: "auto",
                }}
              >
                {execution.impactScore}
              </span>
            )}
          </div>

          {/* Impact metrics */}
          {hasImpact && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {confidenceMeta && (
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 600,
                    background: confidenceMeta.bg,
                    color: confidenceMeta.color,
                  }}
                >
                  {confidenceMeta.label}
                </span>
              )}
              {execution.estimatedRevenue && (
                <span style={{ fontSize: 14, fontWeight: 600, color: "#16A34A" }}>
                  {formatCurrency(execution.estimatedRevenue.min, execution.estimatedRevenue.currency)}
                  {" – "}
                  {formatCurrency(execution.estimatedRevenue.max, execution.estimatedRevenue.currency)}
                </span>
              )}
              {execution.estimatedConversionLift?.percentage != null && (
                <span style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)" }}>
                  +{execution.estimatedConversionLift.percentage}% conversion
                </span>
              )}
              {execution.estimatedAovImpact?.percentage != null && (
                <span style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)" }}>
                  +{execution.estimatedAovImpact.percentage}% AOV
                </span>
              )}
            </div>
          )}

          {/* Title + description */}
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              color: "var(--s-color-text, #1a1a1a)",
              lineHeight: 1.4,
            }}
          >
            {execution.title}
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--s-color-text-secondary, #616161)",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {execution.description}
          </p>

          {/* Impact reasoning */}
          {execution.impactReasoning && (
            <div>
              <button
                type="button"
                onClick={() => setReasoningExpanded(!reasoningExpanded)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--s-color-text-secondary, #616161)",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
              >
                <span style={{ fontSize: 10, color: "#999" }}>
                  {reasoningExpanded ? "▼" : "▶"}
                </span>
                Why this impact
              </button>
              {reasoningExpanded && (
                <p
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "var(--s-color-text-secondary, #616161)",
                    lineHeight: 1.6,
                    padding: "10px 14px",
                    background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
                    borderRadius: 10,
                    margin: "8px 0 0",
                  }}
                >
                  {execution.impactReasoning}
                </p>
              )}
            </div>
          )}

          {/* Action steps */}
          {execution.actionSteps && execution.actionSteps.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--s-color-text, #1a1a1a)",
                  marginBottom: 10,
                }}
              >
                Action steps
              </div>
              <ol
                style={{
                  margin: 0,
                  padding: "0 0 0 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {execution.actionSteps.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 14,
                      color: "var(--s-color-text-secondary, #616161)",
                      lineHeight: 1.5,
                      paddingLeft: 4,
                    }}
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Action preview */}
          {execution.status === "pending" && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 16,
              }}
            >
              <ActionPreview
                executionId={execution.id}
                cachedPreview={execution.dryRunResult}
              />
            </div>
          )}

          {/* Linked goals */}
          {execution.linkedGoals && execution.linkedGoals.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--s-color-text-secondary, #616161)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Linked Goals
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {execution.linkedGoals.map((goal) => {
                  const goalCatMeta = CATEGORY_META[goal.category as GoalExecution["category"]] ?? CATEGORY_META.general;
                  return (
                    <span
                      key={goal.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 12px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        background: goalCatMeta.color + "12",
                        color: goalCatMeta.color,
                        border: `1px solid ${goalCatMeta.color}25`,
                      }}
                    >
                      {goal.title}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data sources */}
          {execution.mcpServersUsed.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--s-color-text-secondary, #616161)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Data Sources
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {execution.mcpServersUsed.map((server) => (
                  <div
                    key={server}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
                      fontSize: 12,
                      color: "var(--s-color-text-secondary, #616161)",
                    }}
                  >
                    <s-icon type={getServerIcon(server) as "apps"} />
                    {formatServerName(server)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcome section */}
          {execution.outcomeStatus && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 16,
              }}
            >
              {execution.outcomeStatus === "pending_measurement" && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void handleMeasureOutcome()}
                    style={{
                      padding: "8px 16px",
                      background: "#EFF6FF",
                      color: "#2563EB",
                      border: "1px solid #BFDBFE",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    Measure Impact
                  </button>
                  <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #999)" }}>
                    Awaiting measurement
                  </span>
                </div>
              )}
              {execution.outcomeStatus === "measured" && execution.outcomeData && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)" }}>
                    Measured Outcome
                  </div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    {execution.outcomeData.revenueDelta != null && (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)" }}>Revenue</div>
                        <div style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: execution.outcomeData.revenueDelta >= 0 ? "#16A34A" : "#DC2626",
                        }}>
                          {execution.outcomeData.revenueDelta >= 0 ? "+" : ""}
                          {formatCurrency(execution.outcomeData.revenueDelta)}
                          {execution.outcomeData.revenueDeltaPercent != null && (
                            <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }}>
                              ({execution.outcomeData.revenueDeltaPercent >= 0 ? "+" : ""}
                              {execution.outcomeData.revenueDeltaPercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {execution.outcomeData.aovDelta != null && (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)" }}>AOV</div>
                        <div style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: execution.outcomeData.aovDelta >= 0 ? "#16A34A" : "#DC2626",
                        }}>
                          {execution.outcomeData.aovDelta >= 0 ? "+" : ""}
                          {formatCurrency(execution.outcomeData.aovDelta)}
                        </div>
                      </div>
                    )}
                    {execution.outcomeData.orderCountDelta != null && (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)" }}>Orders</div>
                        <div style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: execution.outcomeData.orderCountDelta >= 0 ? "#16A34A" : "#DC2626",
                        }}>
                          {execution.outcomeData.orderCountDelta >= 0 ? "+" : ""}
                          {execution.outcomeData.orderCountDelta}
                        </div>
                      </div>
                    )}
                  </div>
                  {execution.outcomeData.summary && (
                    <p style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", margin: 0, lineHeight: 1.5 }}>
                      {execution.outcomeData.summary}
                    </p>
                  )}
                </div>
              )}
              {execution.outcomeStatus === "inconclusive" && (
                <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #999)" }}>
                  Outcome measurement was inconclusive.
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {isCompleted && !feedbackGiven && (
            <div
              style={{
                borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14, color: "var(--s-color-text-secondary, #616161)" }}>
                Was this helpful?
              </span>
              <button
                type="button"
                onClick={() => void handleFeedback("helpful")}
                style={{
                  padding: "6px 16px",
                  background: "#F0FDF4",
                  color: "#16A34A",
                  border: "1px solid #BBF7D0",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => void handleFeedback("not_helpful")}
                style={{
                  padding: "6px 16px",
                  background: "#FEF2F2",
                  color: "#DC2626",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
              >
                No
              </button>
            </div>
          )}
          {feedbackGiven && (
            <div
              style={{
                borderTop: isCompleted ? undefined : "1px solid var(--s-color-border-secondary, #e3e3e3)",
                paddingTop: isCompleted ? 0 : 14,
                fontSize: 13,
                color: feedbackGiven === "helpful" ? "#16A34A" : "#DC2626",
                fontWeight: 500,
              }}
            >
              {feedbackGiven === "helpful" ? "Thanks for the feedback!" : "We'll improve future recommendations."}
            </div>
          )}

          {/* Action buttons */}
          <div
            style={{
              borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              paddingTop: 16,
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => void handleExecute()}
              disabled={isActionBlocked}
              style={{
                flex: 1,
                padding: "14px 24px",
                background:
                  isCompleted
                    ? "#F0FDF4"
                    : isExecuting || isQueued
                      ? "var(--s-color-bg-fill-disabled, #e3e3e3)"
                      : "var(--s-color-bg-fill-emphasis, #303030)",
                color:
                  isCompleted
                    ? "#16A34A"
                    : isExecuting || isQueued
                      ? "var(--s-color-text-disabled, #b5b5b5)"
                      : "#fff",
                border: isCompleted ? "1px solid #BBF7D0" : "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: isActionBlocked ? "default" : "pointer",
                transition: "background 0.15s",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (!isActionBlocked) {
                  e.currentTarget.style.background = "#1a1a1a";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActionBlocked) {
                  e.currentTarget.style.background =
                    "var(--s-color-bg-fill-emphasis, #303030)";
                }
              }}
            >
              {isExecuting ? (
                <>
                  <s-spinner size="base" accessibilityLabel="Running" />
                  Running...
                </>
              ) : isQueued ? (
                <>
                  <s-spinner size="base" accessibilityLabel="Queued" />
                  Queued...
                </>
              ) : isCompleted ? (
                <>
                  <s-icon type={"checkmark" as "apps"} />
                  Completed
                </>
              ) : isFailed ? (
                "Retry"
              ) : (
                "Execute"
              )}
            </button>

            {!isCompleted && (
              <button
                type="button"
                onClick={() => void handleDismiss()}
                disabled={isExecuting}
                style={{
                  padding: "14px 24px",
                  background: "transparent",
                  color: isExecuting
                    ? "var(--s-color-text-disabled, #b5b5b5)"
                    : "var(--s-color-text-secondary, #616161)",
                  border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: isExecuting ? "not-allowed" : "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
                onMouseEnter={(e) => {
                  if (!isExecuting) {
                    e.currentTarget.style.background = "var(--s-color-bg-surface-hover, #f6f6f7)";
                    e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isExecuting) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)";
                  }
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
