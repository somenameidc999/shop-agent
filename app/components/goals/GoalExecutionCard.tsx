import { useState, useCallback } from "react";
import { AGENT_NAME } from "../../config/agent";
import { ActionPreview } from "../recommendations/ActionPreview";
import {
  CATEGORY_META,
  PRIORITY_META,
  STATUS_CONFIG,
  CONFIDENCE_META,
  formatServerName,
  getServerIcon,
  formatCurrency,
  getImpactScoreColor,
} from "./constants";

interface LinkedGoal {
  readonly id: string;
  readonly title: string;
  readonly ruleKey: string;
  readonly category: string;
}

interface RevenueEstimate {
  readonly min: number;
  readonly max: number;
  readonly currency: string;
}

interface PercentageField {
  readonly percentage: number;
}

interface OutcomeData {
  readonly revenueDelta?: number;
  readonly revenueDeltaPercent?: number;
  readonly aovDelta?: number;
  readonly aovDeltaPercent?: number;
  readonly orderCountDelta?: number;
  readonly summary?: string;
}

export interface GoalExecution {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: "catalog" | "reporting" | "customer" | "marketing" | "operations" | "inventory" | "sync" | "general";
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly status: "pending" | "in_progress" | "completed" | "failed";
  readonly mcpServersUsed: readonly string[];
  readonly actionPrompt?: string;
  readonly createdAt: string;
  readonly impactScore?: number | null;
  readonly confidenceLevel?: string | null;
  readonly estimatedRevenue?: RevenueEstimate | null;
  readonly estimatedConversionLift?: PercentageField | null;
  readonly estimatedAovImpact?: PercentageField | null;
  readonly impactReasoning?: string | null;
  readonly actionSteps?: readonly string[] | null;
  readonly outcomeStatus?: string | null;
  readonly outcomeData?: OutcomeData | null;
  readonly linkedGoals?: readonly LinkedGoal[];
  readonly dryRunResult?: string | null;
  readonly feedbackRating?: number | null;
  readonly compositeScore?: number | null;
  readonly queued?: boolean;
}

interface GoalExecutionCardProps {
  readonly execution: GoalExecution;
  readonly onExecute: (execution: GoalExecution) => void;
  readonly onDismiss: (id: string) => void;
  readonly onMeasureOutcome?: (id: string) => void;
  readonly selected?: boolean;
  readonly onToggleSelect?: (id: string) => void;
  readonly onFeedback?: (id: string, type: "helpful" | "not_helpful") => void;
}

const DEFAULT_NEXT_STEPS: Record<GoalExecution["category"], string[]> = {
  catalog: [
    "Review flagged catalog items",
    `${AGENT_NAME} updates product data or listings`,
    "Verify changes in your Shopify admin",
  ],
  inventory: [
    "Review flagged products and stock levels",
    `${AGENT_NAME} adjusts inventory or creates purchase orders`,
    "Verify changes in your Shopify admin",
  ],
  customer: [
    "Review the customer segment identified",
    `${AGENT_NAME} prepares a targeted action plan`,
    "Approve and execute outreach or tagging",
  ],
  reporting: [
    `${AGENT_NAME} compiles data from connected sources`,
    "Review the generated report or dashboard",
    "Export or share with your team",
  ],
  operations: [
    "Review the operational issue identified",
    `${AGENT_NAME} proposes process improvements`,
    "Approve and apply changes",
  ],
  sync: [
    "Review which records are out of sync",
    `${AGENT_NAME} reconciles data across platforms`,
    "Confirm sync status in both systems",
  ],
  marketing: [
    "Review the marketing opportunity identified",
    `${AGENT_NAME} drafts campaigns or promotions`,
    "Approve and launch the campaign",
  ],
  general: [
    `${AGENT_NAME} analyzes the situation`,
    "Review the proposed action",
    "Confirm and apply changes",
  ],
};

export function GoalExecutionCard({
  execution,
  onExecute,
  onDismiss,
  onMeasureOutcome,
  selected,
  onToggleSelect,
  onFeedback,
}: GoalExecutionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"helpful" | "not_helpful" | null>(
    execution.feedbackRating != null
      ? (execution.feedbackRating >= 4 ? "helpful" : "not_helpful")
      : null,
  );

  const handleExecute = useCallback(() => {
    onExecute(execution);
  }, [execution, onExecute]);

  const handleDismiss = useCallback(() => {
    onDismiss(execution.id);
  }, [execution.id, onDismiss]);

  const handleMeasureOutcome = useCallback(() => {
    onMeasureOutcome?.(execution.id);
  }, [execution.id, onMeasureOutcome]);

  const isExecuting = execution.status === "in_progress";
  const isCompleted = execution.status === "completed";
  const isFailed = execution.status === "failed";
  const isQueued = !isExecuting && !isCompleted && Boolean(execution.queued);
  const isActionBlocked = isExecuting || isCompleted || isQueued;
  const categoryMeta = CATEGORY_META[execution.category] ?? CATEGORY_META.general;
  const priorityMeta = PRIORITY_META[execution.priority] ?? PRIORITY_META.medium;
  const statusConfig = STATUS_CONFIG[execution.status];
  const actionSteps = execution.actionSteps ?? DEFAULT_NEXT_STEPS[execution.category] ?? DEFAULT_NEXT_STEPS.general;
  const hasImpact = execution.impactScore != null && execution.impactScore > 0;
  const confidenceMeta = execution.confidenceLevel
    ? CONFIDENCE_META[execution.confidenceLevel] ?? CONFIDENCE_META.low
    : null;

  return (
    <div
      style={{
        border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
        borderRadius: 16,
        background: "var(--s-color-bg-surface, #fff)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
        overflow: "hidden",
        transition: "box-shadow 0.2s, border-color 0.2s",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)";
        e.currentTarget.style.borderColor =
          "var(--s-color-border-secondary, #e3e3e3)";
      }}
    >
      <div style={{ height: 4, background: categoryMeta.color }} />

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onToggleSelect && execution.status === "pending" && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginRight: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected ?? false}
                  onChange={() => onToggleSelect(execution.id)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: "#4F46E5",
                    cursor: "pointer",
                  }}
                />
              </label>
            )}
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
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: priorityMeta.color,
                  display: "inline-block",
                }}
              />
              {priorityMeta.label}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasImpact && (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: getImpactScoreColor(execution.impactScore!),
                  lineHeight: 1,
                }}
              >
                {execution.impactScore}
              </span>
            )}
            {execution.status !== "pending" && (
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
                {isExecuting && (
                  <s-spinner size="base" accessibilityLabel="Running" />
                )}
                {statusConfig.label}
              </span>
            )}
          </div>
        </div>

        {/* Impact section */}
        {hasImpact && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
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
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#16A34A",
                }}
              >
                {formatCurrency(execution.estimatedRevenue.min, execution.estimatedRevenue.currency)}
                {" – "}
                {formatCurrency(execution.estimatedRevenue.max, execution.estimatedRevenue.currency)}
              </span>
            )}
            {execution.estimatedConversionLift?.percentage != null && (
              <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #616161)" }}>
                +{execution.estimatedConversionLift.percentage}% conv.
              </span>
            )}
            {execution.estimatedAovImpact?.percentage != null && (
              <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #616161)" }}>
                +{execution.estimatedAovImpact.percentage}% AOV
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h3
          style={{
            fontSize: 17,
            fontWeight: 600,
            margin: 0,
            color: "var(--s-color-text, #1a1a1a)",
            lineHeight: 1.4,
          }}
        >
          {execution.title}
        </h3>

        {/* Description */}
        <p
          style={{
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {execution.description}
        </p>

        {/* Linked goals chips */}
        {execution.linkedGoals && execution.linkedGoals.length > 0 && (
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
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: 11,
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
        )}

        {/* Data sources */}
        {execution.mcpServersUsed.length > 0 && (
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
        )}

        {/* Impact reasoning (expandable) */}
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
              <span style={{ fontSize: 10, color: "#999", transition: "transform 0.2s" }}>
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

        {/* Action Steps */}
        <div
          style={{
            borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
            paddingTop: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--s-color-text, #1a1a1a)",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            <span style={{ fontSize: 10, color: "#999", transition: "transform 0.2s" }}>
              {expanded ? "▼" : "▶"}
            </span>
            {execution.actionSteps ? "Action steps" : "What happens when you execute"}
          </button>

          {expanded && (
            <div style={{ marginTop: 12 }}>
              <ol
                style={{
                  margin: 0,
                  padding: "0 0 0 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {actionSteps.map((step, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "var(--s-color-text-secondary, #616161)",
                      lineHeight: 1.5,
                      paddingLeft: 4,
                    }}
                  >
                    <span
                      style={{
                        color: isCompleted ? "#16A34A" : "inherit",
                      }}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

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
                  onClick={handleMeasureOutcome}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)" }}>
                  Measured Outcome
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {execution.outcomeData.revenueDelta != null && (
                    <div>
                      <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)" }}>Revenue</div>
                      <div style={{
                        fontSize: 15,
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
                        fontSize: 15,
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
                        fontSize: 15,
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
                  <p style={{ fontSize: 12, color: "var(--s-color-text-secondary, #616161)", margin: 0, lineHeight: 1.5 }}>
                    {execution.outcomeData.summary}
                  </p>
                )}
              </div>
            )}
            {execution.outcomeStatus === "inconclusive" && (
              <div style={{ fontSize: 12, color: "var(--s-color-text-secondary, #999)" }}>
                Outcome measurement was inconclusive.
              </div>
            )}
          </div>
        )}

        {/* Action Preview (dry run) */}
        {execution.status === "pending" && (
          <ActionPreview
            executionId={execution.id}
            cachedPreview={execution.dryRunResult}
          />
        )}

        {/* Feedback UI */}
        {isCompleted && !feedbackGiven && onFeedback && (
          <div
            style={{
              borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              paddingTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)" }}>
              Was this helpful?
            </span>
            <button
              type="button"
              onClick={() => {
                setFeedbackGiven("helpful");
                onFeedback(execution.id, "helpful");
              }}
              style={{
                padding: "4px 12px",
                background: "#F0FDF4",
                color: "#16A34A",
                border: "1px solid #BBF7D0",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => {
                setFeedbackGiven("not_helpful");
                onFeedback(execution.id, "not_helpful");
              }}
              style={{
                padding: "4px 12px",
                background: "#FEF2F2",
                color: "#DC2626",
                border: "1px solid #FECACA",
                borderRadius: 6,
                fontSize: 12,
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
              fontSize: 12,
              color: feedbackGiven === "helpful" ? "#16A34A" : "#DC2626",
              fontWeight: 500,
            }}
          >
            {feedbackGiven === "helpful" ? "Thanks for the feedback!" : "We'll improve future recommendations."}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isActionBlocked}
            style={{
              flex: 1,
              padding: "12px 20px",
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
              fontSize: 14,
              fontWeight: 600,
              cursor: isActionBlocked ? "default" : "pointer",
              transition: "background 0.15s, transform 0.1s",
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
              onClick={handleDismiss}
              disabled={isExecuting}
              style={{
                padding: "12px 20px",
                background: "transparent",
                color: isExecuting
                  ? "var(--s-color-text-disabled, #b5b5b5)"
                  : "var(--s-color-text-secondary, #616161)",
                border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: isExecuting ? "not-allowed" : "pointer",
                transition: "background 0.15s, border-color 0.15s",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
              onMouseEnter={(e) => {
                if (!isExecuting) {
                  e.currentTarget.style.background =
                    "var(--s-color-bg-surface-hover, #f6f6f7)";
                  e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isExecuting) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor =
                    "var(--s-color-border-secondary, #e3e3e3)";
                }
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
