/**
 * Recommendations Page (Landing Page)
 *
 * The default page when the app opens. Shows AI-generated recommendations
 * (goal executions) as actionable cards with next-steps and execute buttons.
 * Includes a summary dashboard row with revenue opportunity and outcome data.
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

interface DashboardStats {
  totalRevenueOpportunity: number;
  highConfidenceCount: number;
  measuredOutcomeRevenue: number;
  executedCount: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function DashboardSummary() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch("/api/goals?limit=100");
        if (!response.ok) return;
        const data = await response.json();
        const executions = data.executions || [];

        const totalRevenueOpportunity = executions
          .filter((e: Record<string, unknown>) =>
            e.status === "pending" && e.estimatedRevenue
          )
          .reduce((sum: number, e: Record<string, unknown>) => {
            const rev = e.estimatedRevenue as { min: number; max: number };
            return sum + (rev.min + rev.max) / 2;
          }, 0);

        const highConfidenceCount = executions.filter(
          (e: Record<string, unknown>) =>
            e.status === "pending" && e.confidenceLevel === "high"
        ).length;

        const measuredOutcomeRevenue = executions
          .filter(
            (e: Record<string, unknown>) =>
              e.outcomeStatus === "measured" && e.outcomeData
          )
          .reduce((sum: number, e: Record<string, unknown>) => {
            const outcome = e.outcomeData as { revenueDelta?: number };
            return sum + (outcome.revenueDelta ?? 0);
          }, 0);

        const executedCount = executions.filter(
          (e: Record<string, unknown>) => e.status === "completed"
        ).length;

        setStats({
          totalRevenueOpportunity,
          highConfidenceCount,
          measuredOutcomeRevenue,
          executedCount,
        });
      } catch {
        // Silently fail — dashboard is supplementary
      }
    }
    void fetchStats();
  }, []);

  if (!stats) return null;

  const hasOpportunity = stats.totalRevenueOpportunity > 0;
  const hasOutcomes = stats.measuredOutcomeRevenue !== 0;
  const hasHighConf = stats.highConfidenceCount > 0;

  if (!hasOpportunity && !hasOutcomes && !hasHighConf) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        marginBottom: 28,
        flexWrap: "wrap",
      }}
    >
      {hasOpportunity && (
        <div
          style={{
            flex: 1,
            minWidth: 200,
            padding: "20px 24px",
            background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
            borderRadius: 14,
            border: "1px solid #BBF7D0",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#15803D", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Revenue Opportunity
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#15803D", lineHeight: 1 }}>
            {formatCurrency(stats.totalRevenueOpportunity)}
          </div>
          <div style={{ fontSize: 12, color: "#16A34A", marginTop: 4 }}>
            From {stats.highConfidenceCount > 0 ? `${stats.highConfidenceCount} high-confidence` : "pending"} recommendations
          </div>
        </div>
      )}

      {hasOutcomes && (
        <div
          style={{
            flex: 1,
            minWidth: 200,
            padding: "20px 24px",
            background: stats.measuredOutcomeRevenue >= 0
              ? "linear-gradient(135deg, #EFF6FF, #DBEAFE)"
              : "linear-gradient(135deg, #FEF2F2, #FECACA)",
            borderRadius: 14,
            border: `1px solid ${stats.measuredOutcomeRevenue >= 0 ? "#BFDBFE" : "#FCA5A5"}`,
          }}
        >
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: stats.measuredOutcomeRevenue >= 0 ? "#1D4ED8" : "#DC2626",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            Measured Impact
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: stats.measuredOutcomeRevenue >= 0 ? "#1D4ED8" : "#DC2626",
            lineHeight: 1,
          }}>
            {stats.measuredOutcomeRevenue >= 0 ? "+" : ""}
            {formatCurrency(stats.measuredOutcomeRevenue)}
          </div>
          <div style={{
            fontSize: 12,
            color: stats.measuredOutcomeRevenue >= 0 ? "#2563EB" : "#EF4444",
            marginTop: 4,
          }}>
            From {stats.executedCount} executed recommendation{stats.executedCount !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {hasHighConf && !hasOpportunity && (
        <div
          style={{
            flex: 1,
            minWidth: 200,
            padding: "20px 24px",
            background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
            borderRadius: 14,
            border: "1px solid #BBF7D0",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#15803D", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            High Confidence
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#15803D", lineHeight: 1 }}>
            {stats.highConfidenceCount}
          </div>
          <div style={{ fontSize: 12, color: "#16A34A", marginTop: 4 }}>
            recommendation{stats.highConfidenceCount !== 1 ? "s" : ""} ready to execute
          </div>
        </div>
      )}
    </div>
  );
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

      {/* Dashboard summary */}
      <DashboardSummary />

      <GoalsPanel />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
