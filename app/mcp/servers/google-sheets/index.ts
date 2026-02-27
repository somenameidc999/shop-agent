#!/usr/bin/env node
/**
 * Google Sheets MCP Server
 *
 * Provides tools for Google Sheets operations — get, update, append.
 * Reads GOOGLE_APPLICATION_CREDENTIALS from environment (service account key path).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "";

if (!KEY_PATH) {
  console.error("[google-sheets] GOOGLE_APPLICATION_CREDENTIALS is required");
  process.exit(1);
}

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  return google.sheets({ version: "v4", auth });
}

function formatSheetsError(error: unknown): string {
  const msg = String(error);
  if (msg.includes("accessNotConfigured") || msg.includes("Google Sheets API has not been used")) {
    return (
      "Google Sheets API is not enabled for this service account's project. " +
      "To fix: go to https://console.cloud.google.com/apis/library/sheets.googleapis.com, " +
      "select the correct project, and click Enable. " +
      `Original error: ${msg}`
    );
  }
  if (msg.includes("The caller does not have permission") || msg.includes("PERMISSION_DENIED")) {
    return (
      "Permission denied. Make sure the service account has been shared on this spreadsheet " +
      "(open the sheet → Share → paste the service account email → Viewer or Editor). " +
      `Original error: ${msg}`
    );
  }
  return msg;
}

const server = new McpServer({
  name: "google-sheets",
  version: "1.0.0",
});

server.registerTool(
  "gsheets_get",
  {
    description: "Read values from a Google Sheets spreadsheet",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID (from its URL)"),
      range: z.string().describe("A1 notation range, e.g. 'Sheet1!A1:D10' or just 'Sheet1'"),
    },
  },
  async ({ spreadsheet_id, range }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheet_id,
        range,
      });
      const values = res.data.values ?? [];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(values, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error reading sheet: ${formatSheetsError(error)}` }],
      };
    }
  },
);

server.registerTool(
  "gsheets_update",
  {
    description: "Write values to a range in a Google Sheets spreadsheet",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID"),
      range: z.string().describe("A1 notation range to write to, e.g. 'Sheet1!A1'"),
      values: z.array(z.array(z.string())).describe("2D array of values to write (rows × columns)"),
    },
  },
  async ({ spreadsheet_id, range, values }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheet_id,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Updated ${res.data.updatedCells ?? 0} cell(s) in ${range}`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error updating sheet: ${formatSheetsError(error)}` }],
      };
    }
  },
);

server.registerTool(
  "gsheets_append",
  {
    description: "Append rows to a Google Sheets spreadsheet",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID"),
      range: z.string().describe("A1 notation range indicating the sheet (e.g. 'Sheet1!A1')"),
      values: z.array(z.array(z.string())).describe("2D array of rows to append"),
    },
  },
  async ({ spreadsheet_id, range, values }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheet_id,
        range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Appended ${res.data.updates?.updatedCells ?? 0} cell(s) to ${range}`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error appending to sheet: ${formatSheetsError(error)}` }],
      };
    }
  },
);

server.registerTool(
  "gsheets_list",
  {
    description: "List all sheets (tabs) in a Google Sheets spreadsheet",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID"),
    },
  },
  async ({ spreadsheet_id }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheet_id,
        fields: "sheets.properties(sheetId,title,index,gridProperties)",
      });
      const sheetList = (res.data.sheets ?? []).map((s) => s.properties);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(sheetList, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error listing sheets: ${formatSheetsError(error)}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[google-sheets] MCP server running");
}

main().catch((err) => {
  console.error("[google-sheets] Fatal error:", err);
  process.exit(1);
});
