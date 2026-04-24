/**
 * Shared constants for goal execution UI components.
 */

import type { GoalExecution } from "./GoalExecutionCard";

export const CATEGORY_META: Record<
  GoalExecution["category"],
  { color: string; icon: string; label: string }
> = {
  catalog: { color: "#8B5CF6", icon: "product", label: "Catalog" },
  reporting: { color: "#10B981", icon: "chart-vertical", label: "Reporting" },
  customer: { color: "#3B82F6", icon: "person-segment", label: "Customer" },
  marketing: { color: "#EC4899", icon: "megaphone", label: "Marketing" },
  operations: { color: "#F59E0B", icon: "clipboard", label: "Operations" },
  inventory: { color: "#7C3AED", icon: "inventory", label: "Inventory" },
  sync: { color: "#F97316", icon: "refresh", label: "Sync" },
  general: { color: "#6B7280", icon: "apps", label: "General" },
};

export const PRIORITY_META: Record<
  GoalExecution["priority"],
  { color: string; bg: string; label: string }
> = {
  low: { color: "#64748B", bg: "#F1F5F9", label: "Low" },
  medium: { color: "#D97706", bg: "#FFFBEB", label: "Medium" },
  high: { color: "#DC2626", bg: "#FEF2F2", label: "High" },
  critical: { color: "#9333EA", bg: "#FAF5FF", label: "Critical" },
};

export const STATUS_CONFIG: Record<
  GoalExecution["status"],
  { color: string; bg: string; label: string }
> = {
  pending: { color: "#64748B", bg: "#F1F5F9", label: "Ready" },
  in_progress: { color: "#2563EB", bg: "#EFF6FF", label: "Running..." },
  completed: { color: "#16A34A", bg: "#F0FDF4", label: "Completed" },
  failed: { color: "#DC2626", bg: "#FEF2F2", label: "Failed" },
};

export const CONFIDENCE_META: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: "High Confidence", color: "#16A34A", bg: "#F0FDF4" },
  medium: { label: "Medium Confidence", color: "#D97706", bg: "#FFFBEB" },
  low: { label: "Low Confidence", color: "#64748B", bg: "#F1F5F9" },
};

export const SERVER_DISPLAY: Record<string, { icon: string; label: string }> = {
  shopify: { icon: "cart", label: "Shopify" },
  "google-sheets": { icon: "file", label: "Google Sheets" },
  "google-drive": { icon: "folder", label: "Google Drive" },
  "google-docs": { icon: "page-reference", label: "Google Docs" },
  airtable: { icon: "table", label: "Airtable" },
  postgres: { icon: "database", label: "PostgreSQL" },
  mysql: { icon: "database", label: "MySQL" },
  s3: { icon: "upload", label: "Amazon S3" },
  email: { icon: "email", label: "Email" },
  ftp: { icon: "download", label: "FTP" },
};

export function formatServerName(name: string): string {
  const base = name.split("__")[0] ?? name;
  return (
    SERVER_DISPLAY[base]?.label ??
    base
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function getServerIcon(name: string): string {
  const base = name.split("__")[0] ?? name;
  return SERVER_DISPLAY[base]?.icon ?? "apps";
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getImpactScoreColor(score: number): string {
  if (score >= 70) return "#16A34A";
  if (score >= 40) return "#D97706";
  return "#9CA3AF";
}
