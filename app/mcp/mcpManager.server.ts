/**
 * MCP Client Manager
 *
 * Manages connections to multiple MCP servers, aggregates their tools,
 * and routes tool calls to the correct server. Singleton lifecycle —
 * initialized once per shop, reused across requests.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { tool as aiTool, type Tool } from "ai";

import {
  type McpServerConfig,
  getServerConfigs,
  cleanupGoogleCredsFile,
} from "./config.server";

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
  private currentShop: string | null = null;
  private lastConfigs: readonly McpServerConfig[] = [];

  async ensureInitialized(shop?: string): Promise<void> {
    if (shop && shop !== this.currentShop && this.initialized) {
      await this.shutdown();
    }

    if (shop) {
      this.currentShop = shop;
    }

    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    if (!this.currentShop) {
      console.info("[McpManager] No shop set — skipping initialization");
      return;
    }

    this.initializing = this.initialize().finally(() => {
      this.initializing = null;
    });
    await this.initializing;
  }

  private async initialize(): Promise<void> {
    if (!this.currentShop) return;

    const configs = await getServerConfigs(this.currentShop);
    this.lastConfigs = configs;
    const enabled = configs.filter((c) => c.enabled);

    console.info(
      `[McpManager] Initializing ${enabled.length} MCP server(s) for shop "${this.currentShop}": ${enabled.map((c) => c.name).join(", ") || "(none)"}`,
    );

    const results = await Promise.allSettled(
      enabled.map((config) => this.connectServer(config)),
    );

    for (const [i, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[McpManager] Failed to connect to "${enabled[i]!.name}":`,
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

    const allowSet = config.allowedTools
      ? new Set(config.allowedTools)
      : null;

    const tools = serverTools
      .filter((t) => !allowSet || allowSet.has(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
      }));

    this.servers.set(config.name, {
      name: config.name,
      client,
      transport,
      tools,
    });

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

  /** Returns every configured server with its enabled/connected state. */
  getFullStatus(): {
    servers: Array<{
      name: string;
      description: string;
      enabled: boolean;
      connected: boolean;
      toolCount: number;
      tools: string[];
    }>;
  } {
    const servers = this.lastConfigs.map((config) => {
      const connected = this.servers.get(config.name);
      return {
        name: config.name,
        description: config.description,
        enabled: config.enabled,
        connected: !!connected,
        toolCount: connected?.tools.length ?? 0,
        tools: connected?.tools.map((t) => t.name) ?? [],
      };
    });
    return { servers };
  }

  /** Tears down all connections and reinitializes with fresh DB config. */
  async reinitialize(shop: string): Promise<void> {
    if (this.currentShop) {
      cleanupGoogleCredsFile(this.currentShop);
    }
    await this.shutdown();
    this.currentShop = shop;
    await this.ensureInitialized(shop);
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
    this.lastConfigs = [];
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

  return z.any();
}

// Singleton instance
export const mcpManager = new McpManager();

// Graceful shutdown
process.on("SIGINT", () => void mcpManager.shutdown());
process.on("SIGTERM", () => void mcpManager.shutdown());
