/**
 * ServerStatus — shows connected MCP servers as badges.
 */

interface ServerInfo {
  readonly name: string;
  readonly toolCount: number;
  readonly tools: readonly string[];
}

interface ServerStatusProps {
  readonly servers: readonly ServerInfo[];
  readonly isLoading: boolean;
}

export function ServerStatus({ servers, isLoading }: ServerStatusProps) {
  if (isLoading) {
    return (
      <div style={{ padding: "8px 16px", fontSize: "12px", color: "var(--p-color-text-secondary)" }}>
        Connecting to data sources...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div style={{ padding: "8px 16px", fontSize: "12px", color: "var(--p-color-text-secondary)" }}>
        No MCP servers connected. Configure credentials in .env to enable data sources.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        padding: "8px 16px",
        borderBottom: "1px solid var(--p-color-border)",
      }}
    >
      {servers.map((server) => (
        <span
          key={server.name}
          title={`${server.toolCount} tools: ${server.tools.join(", ")}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "10px",
            backgroundColor: "var(--p-color-bg-surface-success)",
            color: "var(--p-color-text-success)",
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          <span style={{ fontSize: "8px" }}>●</span>
          {server.name}
          <span style={{ opacity: 0.6 }}>({server.toolCount})</span>
        </span>
      ))}
    </div>
  );
}
