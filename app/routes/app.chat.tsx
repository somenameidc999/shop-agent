/**
 * Chat Page Route
 *
 * Dedicated chat interface for interacting with the agent.
 * Uses Vercel AI SDK's useChat hook for streaming.
 *
 * Two layouts:
 *  - Empty state: centered greeting, input card, and quick-action pills.
 *  - Active chat: message list + bottom input bar.
 *
 * The chat body is rendered only on the client to avoid SSR issues with
 * useChat / DefaultChatTransport (they depend on browser-only APIs).
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

import { ChatMessage } from "../components/chat/ChatMessage";
import { ChatInput } from "../components/chat/ChatInput";
import { AGENT_NAME, AGENT_INITIAL } from "../config/agent";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const QUICK_ACTIONS = [
  { label: "Recent orders", prompt: "Show me my most recent orders and their status" },
  { label: "Sales overview", prompt: "Give me an overview of my recent sales performance" },
  { label: "Low inventory", prompt: "Which products are running low on inventory?" },
  { label: "Top products", prompt: "Which products are performing best right now?" },
  { label: "Customer insights", prompt: "Show me insights about my customers" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function ChatPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 120px)",
        }}
      >
        <s-spinner size="large" accessibilityLabel="Loading chat" />
      </div>
    );
  }

  return <ChatBody />;
}

function ChatBody() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [greeting] = useState(getGreeting);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleValueChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleSend = useCallback(() => {
    if (input.trim()) {
      void sendMessage({ text: input });
      setInput("");
    }
  }, [input, sendMessage]);

  const handleQuickAction = useCallback(
    (prompt: string) => {
      void sendMessage({ text: prompt });
    },
    [sendMessage],
  );

  if (!hasMessages) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "calc(100vh - 120px)",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: "var(--s-color-text, #1a1a1a)",
              margin: 0,
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            {greeting}
          </h1>

          <div
            style={{
              width: "100%",
              border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
              borderRadius: 16,
              padding: "12px 16px",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
              background: "var(--s-color-bg-surface, #fff)",
            }}
          >
            <ChatInput
              value={input}
              onValueChange={handleValueChange}
              onSubmit={handleSend}
              isLoading={isLoading}
              placeholder="How can I help you today?"
              variant="landing"
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              justifyContent: "center",
            }}
          >
            {QUICK_ACTIONS.map((action) => (
              <QuickActionButton
                key={action.label}
                label={action.label}
                onClick={() => handleQuickAction(action.prompt)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        minHeight: 400,
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {isLoading && messages.at(-1)?.role !== "assistant" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 0",
            }}
          >
            <s-avatar initials={AGENT_INITIAL} alt={AGENT_NAME} size="small" />
            <s-box padding="base" borderRadius="base" background="subdued">
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-spinner size="base" accessibilityLabel="Thinking" />
                <s-text color="subdued">Thinking...</s-text>
              </s-stack>
            </s-box>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div
        style={{
          borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
          padding: "12px 24px",
        }}
      >
        <ChatInput
          value={input}
          onValueChange={handleValueChange}
          onSubmit={handleSend}
          isLoading={isLoading}
          placeholder="Reply..."
          variant="inline"
        />
      </div>
    </div>
  );
}

function QuickActionButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 16px",
        borderRadius: 20,
        border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
        fontSize: 14,
        color: "var(--s-color-text, #1a1a1a)",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        transition: "background 0.15s, border-color 0.15s",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "var(--s-color-bg-surface-hover, #f6f6f7)";
        e.currentTarget.style.borderColor = "var(--s-color-border, #c9cccf)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor =
          "var(--s-color-border-secondary, #e3e3e3)";
      }}
    >
      {label}
    </button>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
