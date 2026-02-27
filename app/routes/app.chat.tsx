/**
 * Chat Page Route
 *
 * Full-page chat interface for interacting with the Sidekick agent.
 * Uses Vercel AI SDK's useChat hook for streaming and Shopify Polaris
 * web components for the UI.
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
import { McpSidebar, type McpServerInfo } from "../components/chat/McpSidebar";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function ChatPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <s-page heading="Sidekick Chat">
        <s-box padding="large-300">
          <s-stack gap="base" alignItems="center" justifyContent="center">
            <s-spinner size="large" accessibilityLabel="Loading chat" />
            <s-text color="subdued">Loading chat...</s-text>
          </s-stack>
        </s-box>
      </s-page>
    );
  }

  return <ChatBody />;
}

function ChatBody() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({ transport });
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    fetch("/api/chat-status")
      .then((r) => r.json())
      .then((data: { servers: McpServerInfo[] }) => {
        setServers(data.servers);
        setStatusLoading(false);
      })
      .catch(() => setStatusLoading(false));
  }, []);

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

  const connectedServers = servers.filter((s) => s.connected);

  return (
    <s-page heading="Sidekick Chat">
      <div style={{ display: "flex", border: "1px solid var(--s-color-border-secondary, #e3e3e3)", borderRadius: 8, background: "var(--s-color-bg-surface, #fff)", overflow: "hidden", height: "calc(100vh - 140px)", minHeight: 400 }}>
        <McpSidebar servers={servers} isLoading={statusLoading} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {messages.length === 0 && (
              <s-box padding="large-300">
                <s-stack gap="base" alignItems="center" justifyContent="center">
                  <s-icon type="chat" />
                  <s-heading>Hi! I'm Sidekick</s-heading>
                  <s-paragraph>
                    I can help you query databases, read spreadsheets, manage files,
                    and call APIs. Ask me anything about your connected data sources.
                  </s-paragraph>
                  {connectedServers.length > 0 && (
                    <s-text color="subdued">
                      Connected to {connectedServers.length} data source{connectedServers.length !== 1 ? "s" : ""} with{" "}
                      {connectedServers.reduce((sum, s) => sum + s.toolCount, 0)} tools available
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            )}

            <s-box padding="base">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {isLoading && messages.at(-1)?.role !== "assistant" && (
                <s-stack direction="inline" gap="small" padding="none none base none" alignItems="center">
                  <s-avatar initials="S" alt="Sidekick" size="small" />
                  <s-box padding="base" borderRadius="base" background="subdued">
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-spinner size="base" accessibilityLabel="Thinking" />
                      <s-text color="subdued">Thinking...</s-text>
                    </s-stack>
                  </s-box>
                </s-stack>
              )}

              <div ref={messagesEndRef} />
            </s-box>
          </div>

          <ChatInput
            value={input}
            onValueChange={handleValueChange}
            onSubmit={handleSend}
            isLoading={isLoading}
          />
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
