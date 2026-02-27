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
      <s-box padding="small-100 base" border="none none base none">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-spinner size="base" accessibilityLabel="Loading" />
          <s-text color="subdued">Connecting to data sources...</s-text>
        </s-stack>
      </s-box>
    );
  }

  if (servers.length === 0) {
    return (
      <s-box padding="small-100 base" border="none none base none">
        <s-text color="subdued">
          No MCP servers connected. Configure credentials in .env to enable data sources.
        </s-text>
      </s-box>
    );
  }

  return (
    <s-box padding="small-100 base" border="none none base none">
      <s-stack direction="inline" gap="small">
        {servers.map((server) => (
          <s-tooltip
            key={server.name}
            // content={`${server.toolCount} tools: ${server.tools.join(", ")}`}
          >
            <s-badge tone="success" icon="check-circle">
              {server.name} ({server.toolCount})
            </s-badge>
          </s-tooltip>
        ))}
      </s-stack>
    </s-box>
  );
}
