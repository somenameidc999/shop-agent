import type { UIMessage, UIMessagePart, UIDataTypes, UITools } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AGENT_NAME, AGENT_INITIAL } from "../../config/agent";

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
        <s-avatar initials={AGENT_INITIAL} alt={AGENT_NAME} size="small" />
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
            {isUser ? "You" : AGENT_NAME}
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

  const isRunning = state === "input-streaming" || state === "input-available";
  const isDone = state === "output-available";
  const isError = state === "output-error";

  const tone = isError ? "critical" : isDone ? "success" : isRunning ? "info" : "neutral";
  const icon = isError ? "x-circle" : isDone ? "check-circle" : isRunning ? "in-progress" : "wrench";

  return (
    <s-badge tone={tone} icon={icon}>
      {serverName}.{tool}
    </s-badge>
  );
}
