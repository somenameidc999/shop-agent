/**
 * Floating bulk action bar — appears when 1+ recommendations are selected.
 * Provides batch execute, batch dismiss, select-all-high-confidence, and clear.
 */

interface BulkActionBarProps {
  readonly selectedCount: number;
  readonly onBatchExecute: () => void;
  readonly onBatchDismiss: () => void;
  readonly onSelectHighConfidence: () => void;
  readonly onClearSelection: () => void;
  readonly isExecuting: boolean;
}

export function BulkActionBar({
  selectedCount,
  onBatchExecute,
  onBatchDismiss,
  onSelectHighConfidence,
  onClearSelection,
  isExecuting,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 24px",
        background: "var(--s-color-bg-fill-emphasis, #303030)",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)",
        zIndex: 1000,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        animation: "slideUp 0.2s ease-out",
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#fff",
          whiteSpace: "nowrap",
        }}
      >
        {selectedCount} selected
      </span>

      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />

      <button
        type="button"
        onClick={onBatchExecute}
        disabled={isExecuting}
        style={{
          padding: "8px 16px",
          background: "#16A34A",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: isExecuting ? "not-allowed" : "pointer",
          opacity: isExecuting ? 0.6 : 1,
          whiteSpace: "nowrap",
          fontFamily: "inherit",
        }}
      >
        Execute All
      </button>

      <button
        type="button"
        onClick={onBatchDismiss}
        disabled={isExecuting}
        style={{
          padding: "8px 16px",
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: isExecuting ? "not-allowed" : "pointer",
          opacity: isExecuting ? 0.6 : 1,
          whiteSpace: "nowrap",
          fontFamily: "inherit",
        }}
      >
        Dismiss All
      </button>

      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />

      <button
        type="button"
        onClick={onSelectHighConfidence}
        style={{
          padding: "8px 16px",
          background: "transparent",
          color: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
          fontFamily: "inherit",
        }}
      >
        Select High Confidence
      </button>

      <button
        type="button"
        onClick={onClearSelection}
        style={{
          padding: "6px 12px",
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
          fontFamily: "inherit",
        }}
      >
        Clear
      </button>

      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
