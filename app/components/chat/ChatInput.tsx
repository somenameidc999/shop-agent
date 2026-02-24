/**
 * ChatInput — message input bar with send button.
 * Supports Enter to send, Shift+Enter for newline.
 */

import { useRef, useCallback, type KeyboardEvent, type ChangeEvent } from "react";

interface ChatInputProps {
  readonly value: string;
  readonly onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onSubmit: () => void;
  readonly isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isLoading) {
          onSubmit();
        }
      }
    },
    [value, isLoading, onSubmit],
  );

  // Auto-resize textarea
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e);
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    },
    [onChange],
  );

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "flex-end",
        padding: "12px 16px",
        borderTop: "1px solid var(--p-color-border)",
        backgroundColor: "var(--p-color-bg-surface)",
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask Sidekick anything..."
        disabled={isLoading}
        rows={1}
        style={{
          flex: 1,
          resize: "none",
          border: "1px solid var(--p-color-border)",
          borderRadius: "8px",
          padding: "10px 12px",
          fontSize: "14px",
          lineHeight: "1.5",
          fontFamily: "inherit",
          backgroundColor: "var(--p-color-bg-surface)",
          color: "var(--p-color-text)",
          outline: "none",
          minHeight: "42px",
          maxHeight: "160px",
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim() || isLoading}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: value.trim() && !isLoading
            ? "var(--p-color-bg-fill-brand)"
            : "var(--p-color-bg-fill-disabled)",
          color: value.trim() && !isLoading
            ? "var(--p-color-text-on-fill)"
            : "var(--p-color-text-disabled)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: value.trim() && !isLoading ? "pointer" : "not-allowed",
          whiteSpace: "nowrap",
        }}
      >
        {isLoading ? "Thinking..." : "Send"}
      </button>
    </div>
  );
}
