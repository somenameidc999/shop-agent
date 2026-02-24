#!/usr/bin/env node
/**
 * FTP MCP Server
 *
 * Provides tools for FTP file operations — list, read, write, delete.
 * Reads FTP_HOST, FTP_PORT, FTP_USER, FTP_PASS from environment.
 *
 * Uses the built-in Node.js FTP approach with basic-ftp package.
 * Install: npm install basic-ftp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const FTP_HOST = process.env.FTP_HOST ?? "";
const FTP_PORT = parseInt(process.env.FTP_PORT ?? "21", 10);
const FTP_USER = process.env.FTP_USER ?? "";
const FTP_PASS = process.env.FTP_PASS ?? "";

if (!FTP_HOST) {
  console.error("FTP_HOST is required");
  process.exit(1);
}

// Lazy import basic-ftp to handle cases where it's not installed
async function getFtpClient() {
  const { Client } = await import("basic-ftp");
  const client = new Client();
  await client.access({
    host: FTP_HOST,
    port: FTP_PORT,
    user: FTP_USER,
    password: FTP_PASS,
    secure: false,
  });
  return client;
}

const server = new McpServer({
  name: "ftp",
  version: "1.0.0",
});

server.tool(
  "ftp_list",
  "List files and directories at an FTP path",
  {
    path: z.string().default("/").describe("Remote directory path"),
  },
  async ({ path }) => {
    const client = await getFtpClient();
    try {
      const list = await client.list(path);
      const formatted = list.map((item) => ({
        name: item.name,
        type: item.type === 2 ? "directory" : "file",
        size: item.size,
        modifiedAt: item.modifiedAt?.toISOString() ?? null,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }],
      };
    } finally {
      client.close();
    }
  },
);

server.tool(
  "ftp_read",
  "Read a file from the FTP server and return its contents",
  {
    path: z.string().describe("Remote file path to read"),
  },
  async ({ path }) => {
    const client = await getFtpClient();
    try {
      const { Writable } = await import("stream");
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });
      await client.downloadTo(writable, path);
      const content = Buffer.concat(chunks).toString("utf-8");
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } finally {
      client.close();
    }
  },
);

server.tool(
  "ftp_write",
  "Upload/write content to a file on the FTP server",
  {
    path: z.string().describe("Remote file path to write to"),
    content: z.string().describe("File content to upload"),
  },
  async ({ path, content }) => {
    const client = await getFtpClient();
    try {
      const { Readable } = await import("stream");
      const readable = Readable.from(Buffer.from(content, "utf-8"));
      await client.uploadFrom(readable, path);
      return {
        content: [{ type: "text" as const, text: `Successfully wrote ${content.length} bytes to ${path}` }],
      };
    } finally {
      client.close();
    }
  },
);

server.tool(
  "ftp_delete",
  "Delete a file from the FTP server",
  {
    path: z.string().describe("Remote file path to delete"),
  },
  async ({ path }) => {
    const client = await getFtpClient();
    try {
      await client.remove(path);
      return {
        content: [{ type: "text" as const, text: `Successfully deleted ${path}` }],
      };
    } finally {
      client.close();
    }
  },
);

server.tool(
  "ftp_mkdir",
  "Create a directory on the FTP server",
  {
    path: z.string().describe("Remote directory path to create"),
  },
  async ({ path }) => {
    const client = await getFtpClient();
    try {
      await client.ensureDir(path);
      return {
        content: [{ type: "text" as const, text: `Successfully created directory ${path}` }],
      };
    } finally {
      client.close();
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[ftp] MCP server running — host: ${FTP_HOST}:${FTP_PORT}`);
}

main().catch((err) => {
  console.error("[ftp] Fatal error:", err);
  process.exit(1);
});
