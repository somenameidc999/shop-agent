/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers, aggregates their tools,
 * and routes tool calls to the correct server. Singleton lifecycle —
 * initialized once, reused across requests.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { tool as aiTool, type Tool } from "ai";

import { type McpServerConfig, getServerConfigs } from "./config.server";

interface ConnectedServer {
  readonly name: string;
  readonly client: Client;
  readonly transport: StdioClientTransport;
  readonly tools: ReadonlyArray<{
    readonly name: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
  }>;
}

class McpManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private initialized = false;
  private initializing: Promise<void> | null = null;

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.initialize();
    await this.initializing;
    this.initializing = null;
  }

  private async initialize(): Promise<void> {
    const configs = getServerConfigs().filter((c) => c.enabled);

    console.info(
      `[McpManager] Initializing ${configs.length} MCP server(s): ${configs.map((c) => c.name).join(", ")}`,
    );

    const results = await Promise.allSettled(
      configs.map((config) => this.connectServer(config)),
    );

    for (const [i, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[McpManager] Failed to connect to "${configs[i]!.name}":`,
          result.reason,
        );
      }
    }

    this.initialized = true;
    console.info(
      `[McpManager] Ready — ${this.servers.size} server(s) connected`,
    );
  }

  private async connectServer(config: McpServerConfig): Promise<void> {
    const client = new Client({
      name: `sidekick-${config.name}`,
      version: "1.0.0",
    });

    const transport = new StdioClientTransport({
      command: config.command,
      args: [...config.args],
      env: {
        ...process.env,
        ...(config.env ?? {}),
      } as Record<string, string>,
    });

    await client.connect(transport);

    const { tools: serverTools } = await client.listTools();

    const tools = serverTools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));

    this.servers.set(config.name, { name: config.name, client, transport, tools });

    console.info(
      `[McpManager] Connected to "${config.name}" — ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`,
    );
  }

  /**
   * Returns all tools from all connected servers, formatted for the Vercel AI SDK.
   * Tools are namespaced as `serverName__toolName` to prevent collisions.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getToolsForAI(): Promise<Record<string, Tool<any, any>>> {
    await this.ensureInitialized();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, Tool<any, any>> = {};

    for (const [serverName, server] of this.servers) {
      for (const mcpTool of server.tools) {
        const namespacedName = `${serverName}__${mcpTool.name}`;

        result[namespacedName] = aiTool({
          description: `[${serverName}] ${mcpTool.description}`,
          inputSchema: jsonSchemaToZod(mcpTool.inputSchema),
          execute: async (args: Record<string, unknown>) => {
            const response = await server.client.callTool({
              name: mcpTool.name,
              arguments: args,
            });
            return response.content;
          },
        });
      }
    }

    return result;
  }

  /** Returns a summary of connected servers and their tools. */
  getStatus(): {
    servers: Array<{ name: string; toolCount: number; tools: string[] }>;
  } {
    const servers = [...this.servers.values()].map((s) => ({
      name: s.name,
      toolCount: s.tools.length,
      tools: s.tools.map((t) => t.name),
    }));
    return { servers };
  }

  async shutdown(): Promise<void> {
    for (const [name, server] of this.servers) {
      try {
        await server.transport.close();
        console.info(`[McpManager] Disconnected from "${name}"`);
      } catch (err) {
        console.error(`[McpManager] Error disconnecting "${name}":`, err);
      }
    }
    this.servers.clear();
    this.initialized = false;
  }
}

/**
 * Converts a JSON Schema object to a Zod schema.
 * Handles the common types used by MCP tool input schemas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType<any, any> {
  if (!schema || typeof schema !== "object") {
    return z.object({});
  }

  const type = schema.type as string | undefined;

  if (type === "object") {
    const properties = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const required = (schema.required ?? []) as string[];

    const shape: Record<string, z.ZodType> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp = jsonSchemaToZod(propSchema);
      if (!required.includes(key)) {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }
    return z.object(shape);
  }

  if (type === "array") {
    const items = (schema.items ?? {}) as Record<string, unknown>;
    return z.array(jsonSchemaToZod(items));
  }

  if (type === "string") {
    let base = z.string();
    if (schema.enum) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    if (schema.description) {
      base = base.describe(schema.description as string);
    }
    return base;
  }

  if (type === "number" || type === "integer") {
    return z.number();
  }

  if (type === "boolean") {
    return z.boolean();
  }

  // Fallback: accept anything
  return z.any();
}

// Singleton instance
export const mcpManager = new McpManager();

// Graceful shutdown
process.on("SIGINT", () => void mcpManager.shutdown());
process.on("SIGTERM", () => void mcpManager.shutdown());
