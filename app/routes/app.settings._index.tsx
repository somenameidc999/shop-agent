/**
 * Data Source Settings Overview
 *
 * Card-based overview of all data source types with connection counts.
 * Each card links to the detail page for that source type.
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getAllConfigsForShop } from "../services/mcpConfig.server";
import {
  SERVER_FIELD_DEFS,
  SERVER_TYPES,
  type InstanceConfigSummary,
} from "../services/mcpConfig.shared";

const ICON_MAP: Record<string, string> = {
  postgres: "database",
  mysql: "database",
  google: "file",
  airtable: "table",
  email: "email",
  ftp: "download",
  "custom-api": "code",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const configs = await getAllConfigsForShop(session.shop);
  return { configs };
};

export default function SettingsOverview() {
  const { configs } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const typedConfigs = configs as InstanceConfigSummary[];
  const activeCount = typedConfigs.filter(
    (c) => c.enabled && c.hasConfig,
  ).length;

  const countByType = (serverType: string) =>
    typedConfigs.filter(
      (c) => c.serverType === serverType && c.enabled && c.hasConfig,
    ).length;

  return (
    <s-page heading="Data Source Settings">
      <s-section>
        <s-text>
          Configure credentials for each data source your agent can
          connect to. All credentials are encrypted at rest.
        </s-text>
      </s-section>

      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="inline" gap="base" alignItems="center">
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: activeCount > 0 ? "#22c55e" : "#94a3b8",
                flexShrink: 0,
              }}
            />
            <s-text>
              <strong>{activeCount}</strong> connection
              {activeCount !== 1 ? "s" : ""} active
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {SERVER_TYPES.map((serverType) => {
            const def = SERVER_FIELD_DEFS[serverType];
            const count = countByType(serverType);
            const icon = ICON_MAP[serverType] ?? "apps";

            return (
              <button
                key={serverType}
                type="button"
                onClick={() => navigate(`/app/settings/${serverType}`)}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 20,
                  border:
                    "1px solid var(--s-color-border-secondary, #e3e3e3)",
                  borderRadius: 12,
                  background: "var(--s-color-bg-surface, #fff)",
                  transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(0,0,0,0.08)";
                  e.currentTarget.style.borderColor =
                    "var(--s-color-border-interactive, #005bd3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor =
                    "var(--s-color-border-secondary, #e3e3e3)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background:
                          "var(--s-color-bg-surface-secondary, #f6f6f7)",
                      }}
                    >
                      <s-icon type={icon as "apps"} />
                    </span>
                    <s-text type="strong">{def.label}</s-text>
                  </div>

                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: count > 0 ? "#22c55e" : "#94a3b8",
                      flexShrink: 0,
                    }}
                    title={
                      count > 0
                        ? `${count} active connection${count !== 1 ? "s" : ""}`
                        : "No active connections"
                    }
                  />
                </div>

                <s-text color="subdued">{def.description}</s-text>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    marginTop: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color:
                        count > 0
                          ? "var(--s-color-text-success, #1a7346)"
                          : "var(--s-color-text-secondary, #616161)",
                    }}
                  >
                    {count > 0
                      ? `${count} connection${count !== 1 ? "s" : ""} active`
                      : "Not configured"}
                  </span>

                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        "var(--s-color-text-interactive, #005bd3)",
                    }}
                  >
                    Manage &rarr;
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </s-section>
    </s-page>
  );
}
