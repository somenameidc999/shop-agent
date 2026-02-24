/**
 * ChatMessage — renders a single chat message bubble.
 * Handles user messages, assistant messages, and tool call indicators.
 */

import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";

interface ChatMessageProps {
  readonly message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          backgroundColor: isUser ? "var(--p-color-bg-fill-brand)" : "var(--p-color-bg-surface-secondary)",
          color: isUser ? "var(--p-color-text-on-fill)" : "var(--p-color-text)",
          fontSize: "14px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px", opacity: 0.7 }}>
          {isUser ? "You" : "Sidekick"}
        </div>

        {message.parts.map((part: UIMessagePart<UIDataTypes, UITools>, index: number) => {
          if (part.type === "text") {
            return <span key={index}>{part.text}</span>;
          }
          if (part.type === "dynamic-tool") {
            return (
              <ToolCallIndicator
                key={index}
                toolName={part.toolName}
                state={part.state}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

interface ToolCallIndicatorProps {
  readonly toolName: string;
  readonly state: string;
}

function ToolCallIndicator({ toolName, state }: ToolCallIndicatorProps) {
  const [serverName, tool] = toolName.includes("__")
    ? toolName.split("__", 2)
    : ["agent", toolName];

  const isRunning = state === "call" || state === "partial-call";
  const isDone = state === "result";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 10px",
        margin: "4px 0",
        borderRadius: "8px",
        backgroundColor: "var(--p-color-bg-surface-tertiary)",
        color: "var(--p-color-text-secondary)",
        fontSize: "12px",
        fontFamily: "monospace",
      }}
    >
      <span style={{ fontSize: "14px" }}>
        {isRunning ? "⏳" : isDone ? "✅" : "🔧"}
      </span>
      <span>
        <strong>{serverName}</strong>.{tool}
      </span>
    </div>
  );
}
