import { useState, useCallback } from "react";

const INTERVAL_OPTIONS = [
  { label: "Every hour", value: 60 },
  { label: "Every 2 hours", value: 120 },
  { label: "Every 4 hours", value: 240 },
  { label: "Every 6 hours", value: 360 },
  { label: "Every 12 hours", value: 720 },
  { label: "Every 24 hours", value: 1440 },
  { label: "Every 7 days", value: 10080 },
  { label: "Every 30 days", value: 43200 },
];

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

interface InferredDetails {
  category: string;
  analysisPrompt: string;
  actionPrompt: string;
  requiredServers: string[];
}

interface CreateGoalFormProps {
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

export function CreateGoalForm({ onClose, onCreated }: CreateGoalFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [cronIntervalMins, setCronIntervalMins] = useState(240);
  const [isInferring, setIsInferring] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inferred, setInferred] = useState<InferredDetails | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editedAnalysisPrompt, setEditedAnalysisPrompt] = useState("");
  const [editedActionPrompt, setEditedActionPrompt] = useState("");
  const [editedCategory, setEditedCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleInfer = useCallback(async () => {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required");
      return;
    }
    setError(null);
    setIsInferring(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "infer", title, description }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to infer goal details");
      }
      const data = await response.json();
      const inference = data.inference as InferredDetails;
      setInferred(inference);
      setEditedAnalysisPrompt(inference.analysisPrompt);
      setEditedActionPrompt(inference.actionPrompt);
      setEditedCategory(inference.category);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to infer goal details");
    } finally {
      setIsInferring(false);
    }
  }, [title, description]);

  const handleSave = useCallback(async () => {
    if (!inferred) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title,
          description,
          priority,
          cronIntervalMins,
          category: editedCategory || inferred.category,
          analysisPrompt: editedAnalysisPrompt || inferred.analysisPrompt,
          actionPrompt: editedActionPrompt || inferred.actionPrompt,
          requiredServers: inferred.requiredServers,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create goal");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setIsSaving(false);
    }
  }, [
    title, description, priority, cronIntervalMins,
    editedCategory, editedAnalysisPrompt, editedActionPrompt,
    inferred, onCreated,
  ]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
    borderRadius: 10,
    fontSize: 14,
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    background: "var(--s-color-bg-surface, #fff)",
    color: "var(--s-color-text, #1a1a1a)",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--s-color-text, #1a1a1a)",
    marginBottom: 6,
    display: "block",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 36,
  };

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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--s-color-bg-surface, #fff)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 28px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              color: "var(--s-color-text, #1a1a1a)",
            }}
          >
            Create a New Goal
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 8,
              borderRadius: 8,
              color: "var(--s-color-text-secondary, #616161)",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Goal Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Keep sales sheet up to date"'
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--s-color-border, #303030)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)"; }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>What should this goal accomplish?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you want the agent to do. Be as specific as you can about the data sources, actions, and expected outcomes."
              rows={4}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--s-color-border, #303030)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--s-color-border-secondary, #e3e3e3)"; }}
            />
          </div>

          {/* Priority + Interval */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={selectStyle}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Run Frequency</label>
              <select
                value={cronIntervalMins}
                onChange={(e) => setCronIntervalMins(Number(e.target.value))}
                style={selectStyle}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Infer button */}
          {!inferred && (
            <button
              type="button"
              onClick={handleInfer}
              disabled={isInferring || !title.trim() || !description.trim()}
              style={{
                padding: "14px 24px",
                background: isInferring
                  ? "var(--s-color-bg-fill-disabled, #e3e3e3)"
                  : "var(--s-color-bg-fill-emphasis, #303030)",
                color: isInferring ? "var(--s-color-text-disabled, #b5b5b5)" : "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: isInferring ? "not-allowed" : "pointer",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isInferring ? (
                <>
                  <s-spinner size="base" accessibilityLabel="Analyzing" />
                  Analyzing your goal...
                </>
              ) : (
                "Configure with AI"
              )}
            </button>
          )}

          {/* Inferred results */}
          {inferred && (
            <div
              style={{
                border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
                  borderBottom: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <s-icon type={"checkmark" as "apps"} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--s-color-text, #1a1a1a)" }}>
                    AI Configuration
                  </span>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    background: "#EDE9FE",
                    color: "#7C3AED",
                  }}
                >
                  {editedCategory}
                </span>
              </div>

              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Tools used */}
                {inferred.requiredServers.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--s-color-text-secondary, #616161)", marginBottom: 8 }}>
                      Tools Used
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {inferred.requiredServers.map((server) => (
                        <span
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
                          <s-icon type="apps" />
                          {server.split("__")[0]?.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Advanced editing toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--s-color-text-secondary, #616161)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    padding: "4px 0",
                  }}
                >
                  <span style={{ fontSize: 10, color: "#999" }}>
                    {showAdvanced ? "▼" : "▶"}
                  </span>
                  Edit AI prompts (advanced)
                </button>

                {showAdvanced && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
                    <div>
                      <label style={labelStyle}>Category</label>
                      <select
                        value={editedCategory}
                        onChange={(e) => setEditedCategory(e.target.value)}
                        style={selectStyle}
                      >
                        {["inventory", "customer", "reporting", "sync", "marketing", "general"].map((cat) => (
                          <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Analysis Prompt</label>
                      <textarea
                        value={editedAnalysisPrompt}
                        onChange={(e) => setEditedAnalysisPrompt(e.target.value)}
                        rows={6}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: 13, fontFamily: "monospace" }}
                      />
                      <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)", marginTop: 4 }}>
                        Instructions the AI uses to check if this goal action is applicable right now.
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Action Prompt</label>
                      <textarea
                        value={editedActionPrompt}
                        onChange={(e) => setEditedActionPrompt(e.target.value)}
                        rows={6}
                        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: 13, fontFamily: "monospace" }}
                      />
                      <div style={{ fontSize: 11, color: "var(--s-color-text-secondary, #999)", marginTop: 4 }}>
                        Instructions the AI uses to execute the goal action.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "#FEF2F2",
                color: "#DC2626",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "12px 24px",
                background: "transparent",
                color: "var(--s-color-text-secondary, #616161)",
                border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              Cancel
            </button>
            {inferred && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: "12px 24px",
                  background: isSaving
                    ? "var(--s-color-bg-fill-disabled, #e3e3e3)"
                    : "var(--s-color-bg-fill-emphasis, #303030)",
                  color: isSaving ? "var(--s-color-text-disabled, #b5b5b5)" : "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {isSaving ? (
                  <>
                    <s-spinner size="base" accessibilityLabel="Saving" />
                    Saving...
                  </>
                ) : (
                  "Create Goal"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
