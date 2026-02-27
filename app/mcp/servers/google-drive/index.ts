#!/usr/bin/env node
/**
 * Google Drive MCP Server
 *
 * Provides tools for Google Drive file operations — list, search, read.
 * Reads GOOGLE_APPLICATION_CREDENTIALS from environment (service account key path).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "";

if (!KEY_PATH) {
  console.error("[google-drive] GOOGLE_APPLICATION_CREDENTIALS is required");
  process.exit(1);
}

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

const server = new McpServer({
  name: "google-drive",
  version: "1.0.0",
});

server.registerTool(
  "gdrive_list",
  {
    description: "List files in Google Drive. Optionally filter by folder ID.",
    inputSchema: {
      folder_id: z.string().optional().describe("Google Drive folder ID to list (omit for root/shared files)"),
      page_size: z.number().optional().default(20).describe("Maximum number of files to return"),
    },
  },
  async ({ folder_id, page_size }) => {
    try {
      const drive = getDriveClient();
      const q = folder_id
        ? `'${folder_id}' in parents and trashed = false`
        : "trashed = false";
      const res = await drive.files.list({
        q,
        pageSize: page_size ?? 20,
        fields: "files(id, name, mimeType, modifiedTime, size)",
      });
      const files = res.data.files ?? [];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(files, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing files: ${error}` }],
      };
    }
  },
);

server.registerTool(
  "gdrive_search",
  {
    description:
      "Search for files in Google Drive by name (primary) and full-text content. " +
      "Always searches by filename first — use this to find a spreadsheet or doc by its title.",
    inputSchema: {
      query: z.string().describe("Search term — matched against file names and content"),
      page_size: z.number().optional().default(10).describe("Maximum number of results"),
    },
  },
  async ({ query, page_size }) => {
    try {
      const drive = getDriveClient();
      const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

      // Search by name first (most reliable for finding a specific sheet/doc by title)
      const nameRes = await drive.files.list({
        q: `name contains '${escaped}' and trashed = false`,
        pageSize: page_size ?? 10,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
      });
      const byName = nameRes.data.files ?? [];

      // Also search full-text so content matches aren't missed
      const ftRes = await drive.files.list({
        q: `fullText contains '${escaped}' and trashed = false`,
        pageSize: page_size ?? 10,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
      });
      const byContent = ftRes.data.files ?? [];

      // Merge, deduplicate, name-matches first
      const seen = new Set<string>();
      const merged = [...byName, ...byContent].filter((f) => {
        if (!f.id || seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(merged, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error searching files: ${error}` }],
      };
    }
  },
);

server.registerTool(
  "gdrive_read",
  {
    description: "Read the contents of a Google Drive file. Google Docs/Sheets are exported as plain text/CSV.",
    inputSchema: {
      file_id: z.string().describe("Google Drive file ID"),
    },
  },
  async ({ file_id }) => {
    try {
      const drive = getDriveClient();

      const meta = await drive.files.get({
        fileId: file_id,
        fields: "id, name, mimeType",
      });

      const mimeType = meta.data.mimeType ?? "";

      const exportMap: Record<string, string> = {
        "application/vnd.google-apps.document": "text/plain",
        "application/vnd.google-apps.spreadsheet": "text/csv",
        "application/vnd.google-apps.presentation": "text/plain",
      };

      if (exportMap[mimeType]) {
        const res = await drive.files.export(
          { fileId: file_id, mimeType: exportMap[mimeType]! },
          { responseType: "text" },
        );
        return {
          content: [{ type: "text" as const, text: String(res.data) }],
        };
      }

      const res = await drive.files.get(
        { fileId: file_id, alt: "media" },
        { responseType: "text" },
      );
      return {
        content: [{ type: "text" as const, text: String(res.data) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error reading file: ${error}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[google-drive] MCP server running");
}

main().catch((err) => {
  console.error("[google-drive] Fatal error:", err);
  process.exit(1);
});
