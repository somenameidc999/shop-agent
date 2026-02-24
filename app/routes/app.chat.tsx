/**
 * Chat Page Route
 *
 * Full-page chat interface for interacting with the Sidekick agent.
 * Uses Vercel AI SDK's useChat hook for streaming and Shopify web components
 * for the page shell.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

import { ChatMessage } from "../components/chat/ChatMessage";
import { ChatInput } from "../components/chat/ChatInput";
import { ServerStatus } from "../components/chat/ServerStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface ServerInfo {
  readonly name: string;
  readonly toolCount: number;
  readonly tools: string[];
}

export default function ChatPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);

  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const isLoading = status === "submitted" || status === "streaming";

  // Fetch MCP server status on mount
  useEffect(() => {
    fetch("/api/chat-status")
      .then((r) => r.json())
      .then((data: { servers: ServerInfo[] }) => {
        setServers(data.servers);
        setStatusLoading(false);
      })
      .catch(() => setStatusLoading(false));
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleSend = useCallback(() => {
    if (input.trim()) {
      void sendMessage({ text: input });
      setInput("");
    }
  }, [input, sendMessage]);

  return (
    <s-page heading="Sidekick Chat">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 140px)",
          minHeight: "500px",
          borderRadius: "12px",
          border: "1px solid var(--p-color-border)",
          backgroundColor: "var(--p-color-bg-surface)",
          overflow: "hidden",
        }}
      >
        {/* Server status bar */}
        <ServerStatus servers={servers} isLoading={statusLoading} />

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: "12px",
                color: "var(--p-color-text-secondary)",
                textAlign: "center",
                padding: "40px",
              }}
            >
              <div style={{ fontSize: "48px" }}>🤖</div>
              <div style={{ fontSize: "18px", fontWeight: 600 }}>
                Hi! I'm Sidekick
              </div>
              <div style={{ fontSize: "14px", maxWidth: "400px", lineHeight: "1.6" }}>
                I can help you query databases, read spreadsheets, manage files,
                and call APIs. Ask me anything about your connected data sources.
              </div>
              {servers.length > 0 && (
                <div style={{ fontSize: "12px", marginTop: "8px" }}>
                  Connected to {servers.length} data source{servers.length !== 1 ? "s" : ""} with{" "}
                  {servers.reduce((sum, s) => sum + s.toolCount, 0)} tools available
                </div>
              )}
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isLoading && messages.at(-1)?.role !== "assistant" && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "16px 16px 16px 4px",
                  backgroundColor: "var(--p-color-bg-surface-secondary)",
                  color: "var(--p-color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <ChatInput
          value={input}
          onChange={handleInputChange}
          onSubmit={handleSend}
          isLoading={isLoading}
        />
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
