/**
 * Recommendations Page (Landing Page)
 *
 * The default page when the app opens. Shows AI-generated recommendations
 * (goal executions) as actionable cards with next-steps and execute buttons.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { AGENT_NAME } from "../config/agent";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

import { GoalsPanel } from "../components/goals/GoalsPanel";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function RecommendationsPage() {
  const navigate = useNavigate();
  const [greeting] = useState(getGreeting);
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
        <s-spinner size="large" accessibilityLabel="Loading" />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "var(--s-color-text, #1a1a1a)",
              margin: "0 0 4px 0",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            {greeting}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--s-color-text-secondary, #616161)",
              margin: 0,
            }}
          >
            Here are {AGENT_NAME}'s recommendations based on your goals and store data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void navigate("/app/chat")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "var(--s-color-bg-fill-emphasis, #303030)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 0.15s",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#1a1a1a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              "var(--s-color-bg-fill-emphasis, #303030)";
          }}
        >
          <s-icon type="chat" />
          Chat with {AGENT_NAME}
        </button>
      </div>

      <GoalsPanel />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
