import { useState, useEffect, useCallback, useRef } from "react";
import { GoalExecutionCard, type GoalExecution } from "./GoalExecutionCard";
import { AGENT_NAME } from "../../config/agent";

type CategoryFilter = "all" | GoalExecution["category"];

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

export function GoalsPanel() {
  const [executions, setExecutions] = useState<GoalExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const response = await fetch("/api/goals");
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch (error) {
      console.error("Failed to fetch goal executions:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchExecutions();
    } catch (error) {
      console.error("Failed to generate goal executions:", error);
      setIsLoading(false);
    }
  }, [fetchExecutions]);

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

  useEffect(() => {
    void fetchExecutions();
  }, [fetchExecutions]);

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
            and generates actionable recommendations. Click refresh to generate your first batch.
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
              {executions.length}
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
          disabled={isLoading}
          style={{
            padding: "10px 20px",
            background: "transparent",
            color: "var(--s-color-text-secondary, #616161)",
            border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            transition: "background 0.15s, border-color 0.15s",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.currentTarget.style.background = "var(--s-color-bg-surface-hover, #f6f6f7)";
              e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)";
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
            />
          ))}
        </div>
      )}

    </div>
  );
}
