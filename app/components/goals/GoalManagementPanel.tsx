import { useState, useEffect, useCallback } from "react";
import { CreateGoalForm } from "./CreateGoalForm";
import { AGENT_NAME } from "../../config/agent";

interface Goal {
  id: string;
  ruleKey: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  requiredServers: string[];
  analysisPrompt: string;
  actionPrompt: string;
  enabled: boolean;
  cronIntervalMins: number;
  createdAt: string;
}

const INTERVAL_LABELS: Record<number, string> = {
  60: "Every hour",
  120: "Every 2 hours",
  240: "Every 4 hours",
  360: "Every 6 hours",
  720: "Every 12 hours",
  1440: "Every 24 hours",
  10080: "Every 7 days",
  43200: "Every 30 days",
  86400: "Every 60 days",
};

function formatInterval(mins: number): string {
  return INTERVAL_LABELS[mins] ?? `Every ${mins} minutes`;
}

const CATEGORY_META: Record<string, { color: string; label: string }> = {
  inventory: { color: "#8B5CF6", label: "Inventory" },
  customer: { color: "#3B82F6", label: "Customer" },
  reporting: { color: "#10B981", label: "Reporting" },
  sync: { color: "#F59E0B", label: "Sync" },
  marketing: { color: "#EC4899", label: "Marketing" },
  general: { color: "#6B7280", label: "General" },
};

const PRIORITY_META: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: "#64748B", bg: "#F1F5F9", label: "Low" },
  medium: { color: "#D97706", bg: "#FFFBEB", label: "Medium" },
  high: { color: "#DC2626", bg: "#FEF2F2", label: "High" },
  critical: { color: "#9333EA", bg: "#FAF5FF", label: "Critical" },
};

const SERVER_DISPLAY: Record<string, string> = {
  shopify: "Shopify",
  "google-sheets": "Google Sheets",
  "google-drive": "Google Drive",
  "google-docs": "Google Docs",
  airtable: "Airtable",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  s3: "Amazon S3",
  email: "Email",
  ftp: "FTP",
  "custom-api": "Custom API",
};

function formatServerName(name: string): string {
  const base = name.split("__")[0] ?? name;
  return SERVER_DISPLAY[base] ?? base.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface GoalDetailModalProps {
  goal: Goal;
  onClose: () => void;
  onUpdate: (goal: Goal) => void;
  onDelete: (id: string) => void;
}

function GoalDetailModal({ goal, onClose, onUpdate, onDelete }: GoalDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedAnalysis, setEditedAnalysis] = useState(goal.analysisPrompt);
  const [editedAction, setEditedAction] = useState(goal.actionPrompt);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: goal.id,
          analysisPrompt: editedAnalysis,
          actionPrompt: editedAction,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        onUpdate(data.goal);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to update goal:", error);
    } finally {
      setIsSaving(false);
    }
  }, [goal.id, editedAnalysis, editedAction, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Delete "${goal.title}"? This will also remove all its recommendations.`)) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/goals?goalId=${goal.id}`, { method: "DELETE" });
      if (response.ok) {
        onDelete(goal.id);
        onClose();
      }
    } catch (error) {
      console.error("Failed to delete goal:", error);
    } finally {
      setIsDeleting(false);
    }
  }, [goal.id, goal.title, onDelete, onClose]);

  const handleToggleEnabled = useCallback(async () => {
    try {
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: goal.id, enabled: !goal.enabled }),
      });
      if (response.ok) {
        const data = await response.json();
        onUpdate(data.goal);
      }
    } catch (error) {
      console.error("Failed to toggle goal:", error);
    }
  }, [goal.id, goal.enabled, onUpdate]);

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
    borderRadius: 10,
    fontSize: 13,
    fontFamily: "monospace",
    background: "var(--s-color-bg-surface, #fff)",
    color: "var(--s-color-text, #1a1a1a)",
    outline: "none",
    boxSizing: "border-box",
    resize: "vertical" as const,
    lineHeight: 1.5,
  };

  const catMeta = CATEGORY_META[goal.category] ?? CATEGORY_META.general;
  const priMeta = PRIORITY_META[goal.priority] ?? PRIORITY_META.medium;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--s-color-bg-surface, #fff)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 700,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div style={{ height: 4, background: catMeta.color }} />
        <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    background: catMeta.color + "15",
                    color: catMeta.color,
                  }}
                >
                  {catMeta.label}
                </span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    background: priMeta.bg,
                    color: priMeta.color,
                  }}
                >
                  {priMeta.label}
                </span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    background: goal.enabled ? "#F0FDF4" : "#F1F5F9",
                    color: goal.enabled ? "#16A34A" : "#64748B",
                    cursor: "pointer",
                  }}
                  onClick={handleToggleEnabled}
                >
                  {goal.enabled ? "Active" : "Paused"}
                </span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--s-color-text, #1a1a1a)" }}>
                {goal.title}
              </h2>
              <p style={{ fontSize: 14, color: "var(--s-color-text-secondary, #616161)", margin: "8px 0 0", lineHeight: 1.6 }}>
                {goal.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ all: "unset", cursor: "pointer", padding: 8, borderRadius: 8, color: "var(--s-color-text-secondary, #616161)", fontSize: 18 }}
            >
              ✕
            </button>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--s-color-text-secondary, #616161)", marginBottom: 4 }}>Frequency</div>
              <div style={{ fontSize: 14, color: "var(--s-color-text, #1a1a1a)" }}>{formatInterval(goal.cronIntervalMins)}</div>
            </div>
            {goal.requiredServers.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--s-color-text-secondary, #616161)", marginBottom: 4 }}>Tools</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {goal.requiredServers.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
                        fontSize: 12,
                        color: "var(--s-color-text-secondary, #616161)",
                      }}
                    >
                      {formatServerName(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prompts */}
          <div style={{ borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)" }}>AI Prompts</div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--s-color-text-secondary, #616161)",
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--s-color-text-secondary, #616161)", marginBottom: 6 }}>Analysis Prompt</div>
              {isEditing ? (
                <textarea value={editedAnalysis} onChange={(e) => setEditedAnalysis(e.target.value)} rows={6} style={textareaStyle} />
              ) : (
                <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--s-color-bg-surface-secondary, #f6f6f7)", padding: "10px 14px", borderRadius: 10, maxHeight: 200, overflow: "auto" }}>
                  {goal.analysisPrompt}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--s-color-text-secondary, #616161)", marginBottom: 6 }}>Action Prompt</div>
              {isEditing ? (
                <textarea value={editedAction} onChange={(e) => setEditedAction(e.target.value)} rows={6} style={textareaStyle} />
              ) : (
                <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--s-color-bg-surface-secondary, #f6f6f7)", padding: "10px 14px", borderRadius: 10, maxHeight: 200, overflow: "auto" }}>
                  {goal.actionPrompt}
                </div>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)", paddingTop: 20 }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                padding: "10px 20px",
                background: "transparent",
                color: "#DC2626",
                border: "1px solid #FCA5A5",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {isDeleting ? "Deleting..." : "Delete Goal"}
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              {isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setEditedAnalysis(goal.analysisPrompt); setEditedAction(goal.actionPrompt); }}
                    style={{
                      padding: "10px 20px",
                      background: "transparent",
                      color: "var(--s-color-text-secondary, #616161)",
                      border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      padding: "10px 20px",
                      background: isSaving ? "var(--s-color-bg-fill-disabled, #e3e3e3)" : "var(--s-color-bg-fill-emphasis, #303030)",
                      color: isSaving ? "var(--s-color-text-disabled, #b5b5b5)" : "#fff",
                      border: "none",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isSaving ? "not-allowed" : "pointer",
                      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoalManagementPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const response = await fetch("/api/goals?type=goals");
      if (response.ok) {
        const data = await response.json();
        setGoals(data.goals || []);
      }
    } catch (error) {
      console.error("Failed to fetch goals:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  const handleGoalCreated = useCallback(() => {
    setShowCreateForm(false);
    void fetchGoals();
  }, [fetchGoals]);

  const handleGoalUpdated = useCallback((updated: Goal) => {
    setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGoal(updated);
  }, []);

  const handleGoalDeleted = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const handleToggleGoal = useCallback(async (goalId: string, currentEnabled: boolean) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, enabled: !currentEnabled } : g)),
    );
    try {
      const response = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId, enabled: !currentEnabled }),
      });
      if (!response.ok) {
        setGoals((prev) =>
          prev.map((g) => (g.id === goalId ? { ...g, enabled: currentEnabled } : g)),
        );
      }
    } catch {
      setGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, enabled: currentEnabled } : g)),
      );
    }
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <s-spinner size="large" accessibilityLabel="Loading goals" />
      </div>
    );
  }

  const activeCount = goals.filter((g) => g.enabled).length;
  const pausedCount = goals.filter((g) => !g.enabled).length;

  return (
    <div>
      {/* Stats + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--s-color-text, #1a1a1a)", lineHeight: 1 }}>{goals.length}</div>
            <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", marginTop: 4 }}>Total Goals</div>
          </div>
          <div style={{ width: 1, background: "var(--s-color-border-secondary, #e3e3e3)" }} />
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#16A34A", lineHeight: 1 }}>{activeCount}</div>
            <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", marginTop: 4 }}>Active</div>
          </div>
          {pausedCount > 0 && (
            <>
              <div style={{ width: 1, background: "var(--s-color-border-secondary, #e3e3e3)" }} />
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#64748B", lineHeight: 1 }}>{pausedCount}</div>
                <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", marginTop: 4 }}>Paused</div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          style={{
            padding: "10px 20px",
            background: "var(--s-color-bg-fill-emphasis, #303030)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--s-color-bg-fill-emphasis, #303030)"; }}
        >
          <s-icon type="plus" />
          New Goal
        </button>
      </div>

      {/* Goals list */}
      {goals.length === 0 ? (
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
            <s-icon type="target" />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)", marginBottom: 8 }}>
              No goals yet
            </div>
            <div style={{ fontSize: 14, color: "var(--s-color-text-secondary, #616161)", maxWidth: 400, lineHeight: 1.5 }}>
              Goals tell {AGENT_NAME} what to watch for and act on. Create your first goal
              and the AI will configure the analysis and action prompts for you.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
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
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1a1a1a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--s-color-bg-fill-emphasis, #303030)"; }}
          >
            <s-icon type="plus" />
            Create a Goal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map((goal) => {
            const catMeta = CATEGORY_META[goal.category] ?? CATEGORY_META.general;
            const priMeta = PRIORITY_META[goal.priority] ?? PRIORITY_META.medium;

            return (
              <div
                key={goal.id}
                onClick={() => setSelectedGoal(goal)}
                style={{
                  border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                  borderRadius: 14,
                  padding: "18px 24px",
                  background: "var(--s-color-bg-surface, #fff)",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s, border-color 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  opacity: goal.enabled ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                  e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: catMeta.color, flexShrink: 0 }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {goal.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--s-color-text-secondary, #616161)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {goal.description}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: priMeta.bg, color: priMeta.color }}>
                    {priMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #999)", whiteSpace: "nowrap" }}>
                    {formatInterval(goal.cronIntervalMins)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleToggleGoal(goal.id, goal.enabled); }}
                    title={goal.enabled ? "Pause this goal" : "Enable this goal"}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 600,
                      background: goal.enabled ? "#F0FDF4" : "#F1F5F9",
                      color: goal.enabled ? "#16A34A" : "#64748B",
                      border: `1px solid ${goal.enabled ? "#BBF7D0" : "#E2E8F0"}`,
                      transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 16,
                        borderRadius: 8,
                        background: goal.enabled ? "#16A34A" : "#CBD5E1",
                        position: "relative",
                        transition: "background 0.2s",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: goal.enabled ? 14 : 2,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left 0.2s",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                        }}
                      />
                    </span>
                    {goal.enabled ? "Active" : "Paused"}
                  </button>
                  <span style={{ color: "var(--s-color-text-secondary, #ccc)", fontSize: 14 }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateForm && (
        <CreateGoalForm
          onClose={() => setShowCreateForm(false)}
          onCreated={handleGoalCreated}
        />
      )}

      {selectedGoal && (
        <GoalDetailModal
          goal={selectedGoal}
          onClose={() => setSelectedGoal(null)}
          onUpdate={handleGoalUpdated}
          onDelete={handleGoalDeleted}
        />
      )}
    </div>
  );
}
