import { useState, useEffect, useRef, useCallback } from "react";

export interface McpServerInfo {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly toolCount: number;
  readonly tools: readonly string[];
}

interface McpSidebarProps {
  readonly servers: readonly McpServerInfo[];
  readonly isLoading: boolean;
}

const ICON_MAP: Record<string, string> = {
  filesystem: "folder",
  postgres: "database",
  mysql: "database",
  "google-sheets": "page",
  "google-drive": "folder",
  "google-docs": "page",
  airtable: "table",
  s3: "upload",
  dropbox: "folder",
  ftp: "download",
  "custom-api": "code",
};

function formatName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function McpSidebar({ servers, isLoading }: McpSidebarProps) {
  const connectedCount = servers.filter((s) => s.connected).length;
  const totalTools = servers
    .filter((s) => s.connected)
    .reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <div style={{ width: 260, minWidth: 260, borderRight: "1px solid var(--s-color-border-secondary, #e3e3e3)", display: "flex", flexDirection: "column", height: "100%" }}>
      <s-box padding="base" border="base">
        <s-stack gap="small-200">
          <s-text type="strong">Data Sources</s-text>
          {!isLoading && (
            <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #616161)" }}>
              {connectedCount} active · {totalTools} tools
            </span>
          )}
        </s-stack>
      </s-box>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          <s-box padding="base">
            <s-stack gap="base" alignItems="center">
              <s-spinner size="base" accessibilityLabel="Loading servers" />
              <s-text color="subdued">Connecting...</s-text>
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="small-200">
            <s-stack gap="small-100">
              {servers.map((server) => (
                <ServerRow key={server.name} server={server} />
              ))}
            </s-stack>
          </s-box>
        )}
      </div>
    </div>
  );
}

function ServerRow({ server }: { readonly server: McpServerInfo }) {
  const icon = ICON_MAP[server.name] ?? "apps";
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, close]);

  return (
    <s-box
      padding="small-200 base"
      borderRadius="base"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <StatusDot connected={server.connected} enabled={server.enabled} />
        <s-icon type={icon as "apps"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <s-text type="strong" color={server.enabled ? undefined : "subdued"}>
            {formatName(server.name)}
          </s-text>
          {server.connected ? (
            <div ref={containerRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  textUnderlineOffset: 2,
                  fontSize: 12,
                  color: "var(--s-color-text-secondary, #616161)",
                }}
              >
                {server.toolCount} tool{server.toolCount !== 1 ? "s" : ""}
              </button>
              {open && <ToolsList server={server} />}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--s-color-text-secondary, #616161)" }}>
              {server.enabled ? "" : ""}
            </span>
          )}
        </div>
      </div>
    </s-box>
  );
}

function ToolsList({ server }: { readonly server: McpServerInfo }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        zIndex: 100,
        minWidth: 180,
        background: "var(--s-color-bg-surface, #fff)",
        border: "1px solid var(--s-color-border-secondary, #e3e3e3)",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        padding: 8,
      }}
    >
      <s-stack gap="small-100">
        <s-text type="strong" color="subdued">
          {formatName(server.name)} Tools
        </s-text>
        {server.tools.map((tool) => (
          <div key={tool} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#22c55e", flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 12 }}>{tool}</span>
          </div>
        ))}
      </s-stack>
    </div>
  );
}

function StatusDot({ connected, enabled }: { readonly connected: boolean; readonly enabled: boolean }) {
  let color: string;
  let title: string;

  if (connected) {
    color = "#22c55e";
    title = "Connected";
  } else if (enabled) {
    color = "#f59e0b";
    title = "Enabled but not connected";
  } else {
    color = "#94a3b8";
    title = "Not configured";
  }

  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}
