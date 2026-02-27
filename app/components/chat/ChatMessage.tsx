import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  readonly message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <s-stack
      direction="inline"
      gap="small"
      padding="none none base none"
      justifyContent={isUser ? "end" : "start"}
    >
      {!isUser && (
        <s-avatar initials="S" alt="Sidekick" size="small" />
      )}
      <div className="chat-message-bubble">
      <s-box
        padding="base"
        borderRadius="base"
        background={isUser ? "strong" : "subdued"}
        maxInlineSize="80%"
      >
        <s-stack gap="small-200">
          <s-text type="strong" color="subdued">
            {isUser ? "You" : "Sidekick"}
          </s-text>

          {message.parts.map((part: UIMessagePart<UIDataTypes, UITools>, index: number) => {
            if (part.type === "text") {
              return (
                <div key={index} className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
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
        </s-stack>
      </s-box>
      </div>
      {isUser && (
        <s-avatar initials="Y" alt="You" size="small" />
      )}
    </s-stack>
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

  const tone = isDone ? "success" : isRunning ? "info" : "neutral";
  const icon = isDone ? "check-circle" : isRunning ? "in-progress" : "wrench";

  return (
    <s-badge tone={tone} icon={icon}>
      {serverName}.{tool}
    </s-badge>
  );
}
