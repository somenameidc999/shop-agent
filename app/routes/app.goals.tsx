/**
 * Goals Management Page
 *
 * Allows users to create, view, edit, and delete goals.
 * Goals tell the AI agent what to watch for and act on.
 */

import { useState, useEffect } from "react";
import { AGENT_NAME } from "../config/agent";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

import { GoalManagementPanel } from "../components/goals/GoalManagementPanel";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function GoalsManagementPage() {
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
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--s-color-text, #1a1a1a)",
            margin: "0 0 4px 0",
            fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          Goals
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--s-color-text-secondary, #616161)",
            margin: 0,
          }}
        >
          Define what {AGENT_NAME} should monitor and act on. Each goal generates
          recommendations on your home page.
        </p>
      </div>

      <GoalManagementPanel />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
