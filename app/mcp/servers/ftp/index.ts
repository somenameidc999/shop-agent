#!/usr/bin/env node
/**
 * SFTP MCP Server
 *
 * Provides tools for SFTP file operations — list, read, write, delete, mkdir.
 * Reads FTP_HOST, FTP_PORT, FTP_USER, FTP_PASS from environment.
 *
 * Uses ssh2-sftp-client (supports SSH/SFTP servers on port 22).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import SftpClient, { type FileInfo } from "ssh2-sftp-client";
import { debugLog } from "app/utils/debugLog";
import { z } from "zod";

const FTP_HOST = process.env.FTP_HOST ?? "";
const FTP_PORT = parseInt(process.env.FTP_PORT ?? "22", 10);
const FTP_USER = process.env.FTP_USER ?? "";
const FTP_PASS = process.env.FTP_PASS ?? "";

if (!FTP_HOST) {
  console.error("FTP_HOST is required");
  process.exit(1);
}

async function getSftpClient() {
  const client = new SftpClient();
  debugLog(`[ftp] Connecting — host: ${FTP_HOST}:${FTP_PORT} user: ${FTP_USER}`);
  await client.connect({
    host: FTP_HOST,
    port: FTP_PORT,
    username: FTP_USER,
    password: FTP_PASS,
  });
  return client;
}

const server = new McpServer({
  name: "ftp",
  version: "1.0.0",
});

server.registerTool(
  "ftp_list",
  {
    description: "List files and directories at a remote SFTP path",
    inputSchema: {
      path: z.string().default("/").describe("Remote directory path"),
    },
  },
  async ({ path }) => {
    const client = await getSftpClient();
    try {
      const list = await client.list(path);
      debugLog(`[ftp] List ${path}: ${list.length} entries`);
      const formatted = list.map((item: FileInfo) => ({
        name: item.name,
        type: item.type === "d" ? "directory" : "file",
        size: item.size,
        modifiedAt: item.modifyTime ? new Date(item.modifyTime * 1000).toISOString() : null,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }],
      };
    } catch (error) {
      debugLog(`[ftp] Error listing: ${error}`);
      return {
        content: [{ type: "text" as const, text: `Error listing: ${error}` }],
      };
    } finally {
      await client.end();
    }
  },
);

server.registerTool(
  "ftp_read",
  {
    description: "Read a file from the SFTP server and return its contents. Only works on files — use ftp_list to browse directories.",
    inputSchema: {
      path: z.string().describe("Remote file path to read (must be a file, not a directory)"),
    },
  },
  async ({ path }) => {
    const client = await getSftpClient();
    try {
      const type = await client.exists(path);
      if (type === "d") {
        return {
          content: [{ type: "text" as const, text: `'${path}' is a directory — use ftp_list to browse its contents.` }],
        };
      }
      if (!type) {
        return {
          content: [{ type: "text" as const, text: `'${path}' does not exist on the server.` }],
        };
      }
      const result = await client.get(path);
      const content = result instanceof Buffer
        ? result.toString("utf-8")
        : String(result);
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (error) {
      debugLog(`[ftp] Error reading: ${error}`);
      return {
        content: [{ type: "text" as const, text: `Error reading: ${error}` }],
      };
    } finally {
      await client.end();
    }
  },
);

server.registerTool(
  "ftp_write",
  {
    description: "Upload/write content to a file on the SFTP server",
    inputSchema: {
      path: z.string().describe("Remote file path to write to"),
      content: z.string().describe("File content to upload"),
    },
  },
  async ({ path, content }) => {
    const client = await getSftpClient();
    try {
      const buf = Buffer.from(content, "utf-8");
      await client.put(buf, path);
      return {
        content: [{ type: "text" as const, text: `Successfully wrote ${buf.length} bytes to ${path}` }],
      };
    } catch (error) {
      debugLog(`[ftp] Error writing: ${error}`);
      return {
        content: [{ type: "text" as const, text: `Error writing: ${error}` }],
      };
    } finally {
      await client.end();
    }
  },
);

server.registerTool(
  "ftp_delete",
  {
    description: "Delete a file from the SFTP server",
    inputSchema: {
      path: z.string().describe("Remote file path to delete"),
    },
  },
  async ({ path }) => {
    const client = await getSftpClient();
    try {
      await client.delete(path);
      return {
        content: [{ type: "text" as const, text: `Successfully deleted ${path}` }],
      };
    } catch (error) {
      debugLog(`[ftp] Error deleting: ${error}`);
      return {
        content: [{ type: "text" as const, text: `Error deleting: ${error}` }],
      };
    } finally {
      await client.end();
    }
  },
);

server.registerTool(
  "ftp_mkdir",
  {
    description: "Create a directory on the SFTP server",
    inputSchema: {
      path: z.string().describe("Remote directory path to create"),
    },
  },
  async ({ path }) => {
    const client = await getSftpClient();
    try {
      await client.mkdir(path, true);
      return {
        content: [{ type: "text" as const, text: `Successfully created directory ${path}` }],
      };
    } catch (error) {
      debugLog(`[ftp] Error creating directory: ${error}`);
      return {
        content: [{ type: "text" as const, text: `Error creating directory: ${error}` }],
      };
    } finally {
      await client.end();
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[ftp] SFTP MCP server running — host: ${FTP_HOST}:${FTP_PORT}`);
}

main().catch((err) => {
  console.error("[ftp] Fatal error:", err);
  process.exit(1);
});
