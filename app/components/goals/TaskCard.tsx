/**
 * TaskCard — minimal row-style card for the task list.
 * Shows category color border, icon, title, and an execute button.
 * Row click navigates to the detail page.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router";
import type { GoalExecution } from "./GoalExecutionCard";
import { CATEGORY_META, STATUS_CONFIG } from "./constants";

interface TaskCardProps {
  readonly execution: GoalExecution;
  readonly onExecute: (execution: GoalExecution) => void;
}

export function TaskCard({ execution, onExecute }: TaskCardProps) {
  const navigate = useNavigate();
  const categoryMeta = CATEGORY_META[execution.category] ?? CATEGORY_META.general;
  const statusConfig = STATUS_CONFIG[execution.status];
  const isExecuting = execution.status === "in_progress";
  const isCompleted = execution.status === "completed";
  const isFailed = execution.status === "failed";
  const isQueued = !isExecuting && !isCompleted && Boolean(execution.queued);

  const handleRowClick = useCallback(() => {
    void navigate(`/app/recommendations/${execution.id}`);
  }, [navigate, execution.id]);

  const handleExecuteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onExecute(execution);
    },
    [execution, onExecute],
  );

  return (
    <div
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleRowClick();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 20px",
        background: "var(--s-color-bg-surface, #fff)",
        border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
        borderLeft: `4px solid ${categoryMeta.color}`,
        borderRadius: 12,
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
        e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
        e.currentTarget.style.borderLeftColor = categoryMeta.color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)";
        e.currentTarget.style.borderLeftColor = categoryMeta.color;
      }}
    >
      {/* Category icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: categoryMeta.color + "15",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: categoryMeta.color,
        }}
      >
        <s-icon type={categoryMeta.icon as "apps"} />
      </div>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--s-color-text, #1a1a1a)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {execution.title}
        </div>
        {execution.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--s-color-text-secondary, #616161)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {execution.description}
          </div>
        )}
      </div>

      {/* Status / Action */}
      {isCompleted ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: statusConfig.bg,
            color: statusConfig.color,
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <s-icon type={"checkmark" as "apps"} />
          Done
        </div>
      ) : isExecuting ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: statusConfig.bg,
            color: statusConfig.color,
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <s-spinner size="base" accessibilityLabel="Running" />
          Running
        </div>
      ) : isQueued ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: "#F1F5F9",
            color: "#64748B",
            fontSize: 13,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <s-spinner size="base" accessibilityLabel="Queued" />
          Queued
        </div>
      ) : (
        <button
          type="button"
          onClick={handleExecuteClick}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 18px",
            background: isFailed
              ? "#FEF2F2"
              : "var(--s-color-bg-fill-emphasis, #303030)",
            color: isFailed ? "#DC2626" : "#fff",
            border: isFailed ? "1px solid #FECACA" : "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!isFailed) e.currentTarget.style.background = "#1a1a1a";
          }}
          onMouseLeave={(e) => {
            if (!isFailed)
              e.currentTarget.style.background =
                "var(--s-color-bg-fill-emphasis, #303030)";
          }}
        >
          {isFailed ? "Retry" : "Execute"}
        </button>
      )}
    </div>
  );
}
