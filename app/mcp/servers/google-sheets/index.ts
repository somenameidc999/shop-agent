#!/usr/bin/env node
/**
 * Google Sheets MCP Server
 *
 * Provides tools for Google Sheets operations — CRUD, search, metadata,
 * and Drive-level discovery across all accessible spreadsheets.
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

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
});

function getSheetsClient() {
  return google.sheets({ version: "v4", auth });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth });
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

// ---------------------------------------------------------------------------
// Discovery & search tools
// ---------------------------------------------------------------------------

server.registerTool(
  "gsheets_list_spreadsheets",
  {
    description:
      "List Google Sheets spreadsheets that are shared with the service account. " +
      "Returns spreadsheet ID, name, owner, last modified time, and web URL. " +
      "Use the optional name_query to filter by spreadsheet title (case-insensitive substring match).",
    inputSchema: {
      name_query: z
        .string()
        .optional()
        .describe("Optional filter — only return spreadsheets whose title contains this text"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return (default 50, max 100)"),
      page_token: z
        .string()
        .optional()
        .describe("Token for pagination — pass the nextPageToken from a previous response"),
    },
  },
  async ({ name_query, page_size, page_token }) => {
    try {
      const drive = getDriveClient();
      let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
      if (name_query) {
        const escaped = name_query.replace(/'/g, "\\'");
        q += ` and name contains '${escaped}'`;
      }

      const res = await drive.files.list({
        q,
        pageSize: page_size ?? 50,
        pageToken: page_token,
        fields:
          "nextPageToken, files(id, name, owners, modifiedTime, webViewLink, createdTime)",
        orderBy: "modifiedTime desc",
      });

      const files = (res.data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        owner: f.owners?.[0]?.displayName ?? f.owners?.[0]?.emailAddress ?? "unknown",
        modified: f.modifiedTime,
        created: f.createdTime,
        url: f.webViewLink,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { spreadsheets: files, nextPageToken: res.data.nextPageToken ?? null },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error listing spreadsheets: ${formatSheetsError(error)}` },
        ],
      };
    }
  },
);

server.registerTool(
  "gsheets_metadata",
  {
    description:
      "Get detailed metadata for a spreadsheet — title, locale, all sheet/tab names with " +
      "row and column counts, frozen rows/columns, named ranges, and developer metadata. " +
      "Use this to understand a spreadsheet's structure before reading data.",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID (from its URL)"),
    },
  },
  async ({ spreadsheet_id }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheet_id,
        fields: [
          "spreadsheetId",
          "properties(title,locale,timeZone,autoRecalc)",
          "sheets.properties(sheetId,title,index,sheetType,gridProperties,hidden)",
          "namedRanges",
        ].join(","),
      });

      const data = res.data;
      const meta = {
        spreadsheetId: data.spreadsheetId,
        title: data.properties?.title,
        locale: data.properties?.locale,
        timeZone: data.properties?.timeZone,
        sheets: (data.sheets ?? []).map((s) => ({
          sheetId: s.properties?.sheetId,
          title: s.properties?.title,
          index: s.properties?.index,
          type: s.properties?.sheetType,
          hidden: s.properties?.hidden ?? false,
          rowCount: s.properties?.gridProperties?.rowCount,
          columnCount: s.properties?.gridProperties?.columnCount,
          frozenRowCount: s.properties?.gridProperties?.frozenRowCount ?? 0,
          frozenColumnCount: s.properties?.gridProperties?.frozenColumnCount ?? 0,
        })),
        namedRanges: (data.namedRanges ?? []).map((nr) => ({
          name: nr.name,
          range: nr.range,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(meta, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error getting metadata: ${formatSheetsError(error)}` },
        ],
      };
    }
  },
);

server.registerTool(
  "gsheets_batch_get",
  {
    description:
      "Read multiple ranges from a spreadsheet in a single API call. " +
      "More efficient than multiple gsheets_get calls when you need data from several tabs or ranges.",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID"),
      ranges: z
        .array(z.string())
        .min(1)
        .describe("Array of A1-notation ranges, e.g. ['Sheet1!A1:D10', 'Sheet2!A:B']"),
    },
  },
  async ({ spreadsheet_id, ranges }) => {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: spreadsheet_id,
        ranges: [...ranges],
      });

      const result = (res.data.valueRanges ?? []).map((vr) => ({
        range: vr.range,
        values: vr.values ?? [],
      }));

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error batch reading: ${formatSheetsError(error)}` },
        ],
      };
    }
  },
);

server.registerTool(
  "gsheets_search",
  {
    description:
      "Search for text across all cells in a spreadsheet. Returns every cell whose value " +
      "contains the query string (case-insensitive). Results include sheet name, cell address, " +
      "and cell value. Use this to locate specific data (e.g. 'PO-12345', 'COGS', a SKU) " +
      "before reading a targeted range.",
    inputSchema: {
      spreadsheet_id: z.string().describe("The spreadsheet ID"),
      query: z.string().describe("Text to search for (case-insensitive substring match)"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Max matching cells to return (default 100)"),
    },
  },
  async ({ spreadsheet_id, query, max_results }) => {
    try {
      const sheets = getSheetsClient();
      const limit = max_results ?? 100;
      const needle = query.toLowerCase();

      const meta = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheet_id,
        fields: "sheets.properties(title,gridProperties)",
      });

      const sheetTabs = (meta.data.sheets ?? []).map((s) => s.properties!.title!);

      const allData = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: spreadsheet_id,
        ranges: sheetTabs.map((t) => `'${t}'`),
      });

      const matches: { sheet: string; cell: string; value: string }[] = [];

      for (const vr of allData.data.valueRanges ?? []) {
        const sheetName = vr.range?.split("!")[0]?.replace(/^'|'$/g, "") ?? "?";
        for (let r = 0; r < (vr.values?.length ?? 0); r++) {
          const row = vr.values![r];
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] ?? "");
            if (val.toLowerCase().includes(needle)) {
              const colLetter = columnToLetter(c);
              matches.push({ sheet: sheetName, cell: `${colLetter}${r + 1}`, value: val });
              if (matches.length >= limit) break;
            }
          }
          if (matches.length >= limit) break;
        }
        if (matches.length >= limit) break;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { query, totalMatches: matches.length, truncated: matches.length >= limit, matches },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: `Error searching sheet: ${formatSheetsError(error)}` },
        ],
      };
    }
  },
);

server.registerTool(
  "gsheets_search_drive",
  {
    description:
      "Search across ALL accessible Google Sheets by content or title using Google Drive " +
      "full-text search. Use this when you don't know which spreadsheet contains specific " +
      "data (e.g. 'which spreadsheet has PO data?', 'find the COGS spreadsheet'). " +
      "Returns spreadsheet IDs and names so you can then use gsheets_metadata or gsheets_search " +
      "to drill in.",
    inputSchema: {
      query: z.string().describe("Search query — matches against spreadsheet title AND cell contents"),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results (default 20)"),
    },
  },
  async ({ query, page_size }) => {
    try {
      const drive = getDriveClient();
      const escaped = query.replace(/'/g, "\\'");
      const q =
        `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false ` +
        `and fullText contains '${escaped}'`;

      const res = await drive.files.list({
        q,
        pageSize: page_size ?? 20,
        fields: "files(id, name, owners, modifiedTime, webViewLink)",
        orderBy: "modifiedTime desc",
      });

      const files = (res.data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        owner: f.owners?.[0]?.displayName ?? f.owners?.[0]?.emailAddress ?? "unknown",
        modified: f.modifiedTime,
        url: f.webViewLink,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ query, results: files, count: files.length }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching Drive: ${formatSheetsError(error)}`,
          },
        ],
      };
    }
  },
);

function columnToLetter(col: number): string {
  let letter = "";
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[google-sheets] MCP server running");
}

main().catch((err) => {
  console.error("[google-sheets] Fatal error:", err);
  process.exit(1);
});
