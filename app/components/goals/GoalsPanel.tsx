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

export function GoalsPanel() {
  const [executions, setExecutions] = useState<GoalExecution[]>([]);
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("impactScore");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
