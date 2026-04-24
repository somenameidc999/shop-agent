/**
 * Action Preview — expandable panel within a card that shows a dry-run
 * preview of what executing a recommendation would do.
 */

import { useState, useCallback } from "react";

interface ActionPreviewProps {
  readonly executionId: string;
  readonly cachedPreview?: string | null;
}

export function ActionPreview({ executionId, cachedPreview }: ActionPreviewProps) {
  const [preview, setPreview] = useState<string | null>(cachedPreview ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = useCallback(async () => {
    if (preview) {
      // Toggle visibility
      setPreview(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dry_run", executionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError((data as { error?: string }).error ?? "Failed to generate preview");
        return;
      }

      const data = await response.json();
      setPreview((data as { preview: string }).preview);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [executionId, preview]);

  return (
    <div>
      <button
        type="button"
        onClick={() => void handlePreview()}
        disabled={isLoading}
        style={{
          all: "unset",
          cursor: isLoading ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "#2563EB",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          padding: "4px 0",
        }}
      >
        {isLoading ? (
          <>
            <s-spinner size="base" accessibilityLabel="Loading preview" />
            Generating preview...
          </>
        ) : preview ? (
          "Hide Preview"
        ) : (
          <>
            <s-icon type="view" />
            Preview Action
          </>
        )}
      </button>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            background: "#FEF2F2",
            color: "#DC2626",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {preview && !isLoading && (
        <div
          style={{
            marginTop: 10,
            padding: "14px 16px",
            borderRadius: 10,
            background: "var(--s-color-bg-surface-secondary, #f6f6f7)",
            border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
            fontSize: 13,
            color: "var(--s-color-text-secondary, #616161)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#2563EB",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 8,
            }}
          >
            Preview (Read-Only)
          </div>
          {preview}
        </div>
      )}
    </div>
  );
}
