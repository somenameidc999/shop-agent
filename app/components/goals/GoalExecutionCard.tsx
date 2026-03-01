import { useState, useCallback } from "react";
import { AGENT_NAME } from "../../config/agent";

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
}

interface GoalExecutionCardProps {
  readonly execution: GoalExecution;
  readonly onExecute: (execution: GoalExecution) => void;
  readonly onDismiss: (id: string) => void;
}

const CATEGORY_META: Record<
  GoalExecution["category"],
  { color: string; icon: string; label: string }
> = {
  catalog: { color: "#8B5CF6", icon: "products", label: "Catalog" },
  reporting: { color: "#10B981", icon: "chart-vertical", label: "Reporting" },
  customer: { color: "#3B82F6", icon: "customers", label: "Customer" },
  marketing: { color: "#EC4899", icon: "megaphone", label: "Marketing" },
  operations: { color: "#F59E0B", icon: "settings", label: "Operations" },
  inventory: { color: "#7C3AED", icon: "inventory", label: "Inventory" },
  sync: { color: "#F97316", icon: "refresh", label: "Sync" },
  general: { color: "#6B7280", icon: "apps", label: "General" },
};

const PRIORITY_META: Record<
  GoalExecution["priority"],
  { color: string; bg: string; label: string }
> = {
  low: { color: "#64748B", bg: "#F1F5F9", label: "Low" },
  medium: { color: "#D97706", bg: "#FFFBEB", label: "Medium" },
  high: { color: "#DC2626", bg: "#FEF2F2", label: "High" },
  critical: { color: "#9333EA", bg: "#FAF5FF", label: "Critical" },
};

const STATUS_CONFIG: Record<
  GoalExecution["status"],
  { color: string; bg: string; label: string }
> = {
  pending: { color: "#64748B", bg: "#F1F5F9", label: "Ready" },
  in_progress: { color: "#2563EB", bg: "#EFF6FF", label: "Running..." },
  completed: { color: "#16A34A", bg: "#F0FDF4", label: "Completed" },
  failed: { color: "#DC2626", bg: "#FEF2F2", label: "Failed" },
};

const SERVER_DISPLAY: Record<string, { icon: string; label: string }> = {
  shopify: { icon: "cart", label: "Shopify" },
  "google-sheets": { icon: "file", label: "Google Sheets" },
  "google-drive": { icon: "folder", label: "Google Drive" },
  "google-docs": { icon: "page-reference", label: "Google Docs" },
  airtable: { icon: "table", label: "Airtable" },
  postgres: { icon: "database", label: "PostgreSQL" },
  mysql: { icon: "database", label: "MySQL" },
  s3: { icon: "upload", label: "Amazon S3" },
  email: { icon: "email", label: "Email" },
  ftp: { icon: "download", label: "FTP" },
};

function formatServerName(name: string): string {
  const base = name.split("__")[0] ?? name;
  return (
    SERVER_DISPLAY[base]?.label ??
    base
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function getServerIcon(name: string): string {
  const base = name.split("__")[0] ?? name;
  return SERVER_DISPLAY[base]?.icon ?? "apps";
}

const DEFAULT_NEXT_STEPS: Record<GoalExecution["category"], string[]> = {
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
}: GoalExecutionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleExecute = useCallback(() => {
    onExecute(execution);
  }, [execution, onExecute]);

  const handleDismiss = useCallback(() => {
    onDismiss(execution.id);
  }, [execution.id, onDismiss]);

  const isExecuting = execution.status === "in_progress";
  const isCompleted = execution.status === "completed";
  const isFailed = execution.status === "failed";
  const categoryMeta = CATEGORY_META[execution.category] ?? CATEGORY_META.general;
  const priorityMeta = PRIORITY_META[execution.priority] ?? PRIORITY_META.medium;
  const statusConfig = STATUS_CONFIG[execution.status];
  const nextSteps = DEFAULT_NEXT_STEPS[execution.category] ?? DEFAULT_NEXT_STEPS.general;

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
        {/* Header */}
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

        {/* Next Steps */}
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
            What happens when you execute
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
                {nextSteps.map((step, i) => (
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

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isExecuting || isCompleted}
            style={{
              flex: 1,
              padding: "12px 20px",
              background:
                isCompleted
                  ? "#F0FDF4"
                  : isExecuting
                    ? "var(--s-color-bg-fill-disabled, #e3e3e3)"
                    : "var(--s-color-bg-fill-emphasis, #303030)",
              color:
                isCompleted
                  ? "#16A34A"
                  : isExecuting
                    ? "var(--s-color-text-disabled, #b5b5b5)"
                    : "#fff",
              border: isCompleted ? "1px solid #BBF7D0" : "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: isExecuting || isCompleted ? "default" : "pointer",
              transition: "background 0.15s, transform 0.1s",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!isExecuting && !isCompleted) {
                e.currentTarget.style.background = "#1a1a1a";
              }
            }}
            onMouseLeave={(e) => {
              if (!isExecuting && !isCompleted) {
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
