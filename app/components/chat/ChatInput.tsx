import { useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { AGENT_NAME } from "../../config/agent";

interface ChatInputProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly isLoading: boolean;
  readonly placeholder?: string;
  readonly variant?: "landing" | "inline";
}

export function ChatInput({
  value,
  onValueChange,
  onSubmit,
  isLoading,
  placeholder = `Ask ${AGENT_NAME} anything...`,
  variant = "inline",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onValueChange(e.target.value);
    },
    [onValueChange],
  );

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

  const canSend = Boolean(value.trim()) && !isLoading;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        rows={1}
        style={{
          flex: 1,
          resize: "none",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: variant === "landing" ? 16 : 14,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          lineHeight: 1.5,
          padding: variant === "landing" ? "4px 0" : "8px 0",
          color: "var(--s-color-text, #1a1a1a)",
          maxHeight: 200,
        }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSend}
        aria-label="Send message"
        style={{
          all: "unset",
          cursor: canSend ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: canSend
            ? "var(--s-color-bg-fill-emphasis, #303030)"
            : "var(--s-color-bg-fill-disabled, #e3e3e3)",
          color: canSend
            ? "#fff"
            : "var(--s-color-text-disabled, #b5b5b5)",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 13V3M8 3L4 7M8 3l4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
