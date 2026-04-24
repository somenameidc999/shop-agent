/**
 * Recently Dismissed tray — collapsible section showing items dismissed
 * in the last 30 minutes with an "Undo" button for each.
 */

import { useState, useEffect, useCallback } from "react";

interface DismissedExecution {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly dismissedAt: string;
}

interface DismissedTrayProps {
  readonly refreshTrigger: number;
}

export function DismissedTray({ refreshTrigger }: DismissedTrayProps) {
  const [dismissed, setDismissed] = useState<DismissedExecution[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const fetchDismissed = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const response = await fetch(`/api/goals?type=dismissed&since=${since}`);
      if (response.ok) {
        const data = await response.json();
        setDismissed(data.executions || []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    void fetchDismissed();
  }, [fetchDismissed, refreshTrigger]);

  const handleUndo = useCallback(
    async (id: string) => {
      setUndoingId(id);
      try {
        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "undismiss", executionId: id }),
        });
        if (response.ok) {
          setDismissed((prev) => prev.filter((d) => d.id !== id));
        }
      } catch {
        // Silent fail
      } finally {
        setUndoingId(null);
      }
    },
    [],
  );

  if (dismissed.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 24,
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
          fontSize: 13,
          fontWeight: 600,
          color: "var(--s-color-text-secondary, #919191)",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <span style={{ fontSize: 10, transition: "transform 0.2s" }}>
          {expanded ? "▼" : "▶"}
        </span>
        Recently Dismissed ({dismissed.length})
      </button>

      {expanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 12,
          }}
        >
          {dismissed.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderRadius: 10,
                background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    color: "var(--s-color-text-secondary, #919191)",
                    fontSize: 12,
                    textDecoration: "line-through",
                  }}
                >
                  {item.title}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleUndo(item.id)}
                disabled={undoingId === item.id}
                style={{
                  padding: "4px 12px",
                  background: "transparent",
                  color: "#2563EB",
                  border: "1px solid #BFDBFE",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: undoingId === item.id ? "not-allowed" : "pointer",
                  opacity: undoingId === item.id ? 0.6 : 1,
                  whiteSpace: "nowrap",
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
              >
                {undoingId === item.id ? "Undoing..." : "Undo"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
