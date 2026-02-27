#!/usr/bin/env node
/**
 * Google Docs MCP Server
 *
 * Provides tools for Google Docs operations — list, get, create, append.
 * Reads GOOGLE_APPLICATION_CREDENTIALS from environment (service account key path).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "";

if (!KEY_PATH) {
  console.error("[google-docs] GOOGLE_APPLICATION_CREDENTIALS is required");
  process.exit(1);
}

function getAuth(readonly = true) {
  return new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: readonly
      ? ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/documents.readonly"]
      : ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"],
  });
}

const server = new McpServer({
  name: "google-docs",
  version: "1.0.0",
});

server.registerTool(
  "gdocs_list",
  {
    description: "List Google Docs documents visible to the service account",
    inputSchema: {
      page_size: z.number().optional().default(20).describe("Maximum number of documents to return"),
    },
  },
  async ({ page_size }) => {
    try {
      const drive = google.drive({ version: "v3", auth: getAuth() });
      const res = await drive.files.list({
        q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
        pageSize: page_size ?? 20,
        fields: "files(id, name, modifiedTime, createdTime)",
      });
      const files = res.data.files ?? [];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(files, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing docs: ${error}` }],
      };
    }
  },
);

server.registerTool(
  "gdocs_get",
  {
    description: "Read the content of a Google Doc, exported as plain text",
    inputSchema: {
      document_id: z.string().describe("The Google Doc ID (from its URL)"),
    },
  },
  async ({ document_id }) => {
    try {
      const drive = google.drive({ version: "v3", auth: getAuth() });
      const res = await drive.files.export(
        { fileId: document_id, mimeType: "text/plain" },
        { responseType: "text" },
      );
      return {
        content: [{ type: "text" as const, text: String(res.data) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error reading doc: ${error}` }],
      };
    }
  },
);

server.registerTool(
  "gdocs_create",
  {
    description: "Create a new blank Google Doc with a given title",
    inputSchema: {
      title: z.string().describe("Title of the new document"),
    },
  },
  async ({ title }) => {
    try {
      const docs = google.docs({ version: "v1", auth: getAuth(false) });
      const res = await docs.documents.create({
        requestBody: { title },
      });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ id: res.data.documentId, title: res.data.title }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error creating doc: ${error}` }],
      };
    }
  },
);

server.registerTool(
  "gdocs_append",
  {
    description: "Append text to the end of a Google Doc",
    inputSchema: {
      document_id: z.string().describe("The Google Doc ID"),
      text: z.string().describe("Text content to append"),
    },
  },
  async ({ document_id, text }) => {
    try {
      const docs = google.docs({ version: "v1", auth: getAuth(false) });

      const doc = await docs.documents.get({ documentId: document_id });
      const endIndex = doc.data.body?.content?.slice(-1)[0]?.endIndex ?? 1;
      const insertAt = Math.max(1, endIndex - 1);

      await docs.documents.batchUpdate({
        documentId: document_id,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: insertAt },
                text: `\n${text}`,
              },
            },
          ],
        },
      });

      return {
        content: [{ type: "text" as const, text: `Appended text to document ${document_id}` }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error appending to doc: ${error}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[google-docs] MCP server running");
}

main().catch((err) => {
  console.error("[google-docs] Fatal error:", err);
  process.exit(1);
});
