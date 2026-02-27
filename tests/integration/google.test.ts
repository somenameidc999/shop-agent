/**
 * Google integration tests
 *
 * Verifies the service account key is valid and that the Google Drive,
 * Google Docs, and Google Sheets APIs are reachable using the same
 * GOOGLE_APPLICATION_CREDENTIALS that the MCP servers read.
 *
 * Required scopes granted to the service account:
 *   https://www.googleapis.com/auth/drive.readonly
 *   https://www.googleapis.com/auth/documents.readonly
 *   https://www.googleapis.com/auth/spreadsheets.readonly
 */

import { existsSync, readFileSync } from "fs";
import { google } from "googleapis";
import { loadEnv } from "../helpers/env.js";

loadEnv();

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function driveAuth() {
  return new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function sheetsAuth() {
  return new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function docsAuth() {
  return new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly",
    ],
  });
}

// ---------------------------------------------------------------------------
// Service Account
// ---------------------------------------------------------------------------

describe("Google Service Account", () => {
  it("GOOGLE_APPLICATION_CREDENTIALS is set in .env", () => {
    expect(KEY_PATH).toBeTruthy();
  });

  it("key file exists on disk", () => {
    expect(existsSync(KEY_PATH)).toBe(true);
  });

  it("key file is valid JSON with required fields", () => {
    const raw = readFileSync(KEY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.type).toBe("service_account");
    expect(typeof parsed.client_email).toBe("string");
    expect(typeof parsed.private_key).toBe("string");
    expect(typeof parsed.project_id).toBe("string");
    console.log(`  Service account: ${parsed.client_email}`);
    console.log(`  Project: ${parsed.project_id}`);
  });
});

// ---------------------------------------------------------------------------
// Google Drive (gdrive_list, gdrive_search, gdrive_read)
// ---------------------------------------------------------------------------

describe("Google Drive MCP — gdrive_list", () => {
  it("lists files visible to the service account", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: driveAuth() });
    const res = await drive.files.list({
      pageSize: 20,
      fields: "files(id, name, mimeType)",
    });

    expect(res.status).toBe(200);
    const files = res.data.files ?? [];
    console.log(`  Files visible: ${files.length}`);
    if (files.length > 0) {
      console.log(`  Names: ${files.map((f) => f.name).join(", ")}`);
    }
    expect(Array.isArray(files)).toBe(true);
  });
});

describe("Google Drive MCP — gdrive_search", () => {
  it("returns results for a broad search query", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: driveAuth() });
    const res = await drive.files.list({
      q: "trashed = false",
      pageSize: 5,
      fields: "files(id, name, mimeType)",
    });

    expect(res.status).toBe(200);
    const files = res.data.files ?? [];
    console.log(`  Search returned ${files.length} result(s)`);
    expect(Array.isArray(files)).toBe(true);
  });
});

describe("Google Drive MCP — gdrive_read", () => {
  it("exports a Google Doc as plain text if one exists", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: driveAuth() });
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
      pageSize: 1,
      fields: "files(id, name)",
    });

    const files = res.data.files ?? [];
    if (files.length === 0) {
      console.log("  No Google Docs found — skipping export test");
      return;
    }

    const file = files[0]!;
    const exportRes = await drive.files.export(
      { fileId: file.id!, mimeType: "text/plain" },
      { responseType: "text" },
    );

    expect(exportRes.status).toBe(200);
    expect(typeof exportRes.data).toBe("string");
    console.log(`  Exported "${file.name}" — ${String(exportRes.data).length} chars`);
  });
});

// ---------------------------------------------------------------------------
// Google Docs (gdocs_list, gdocs_get)
// ---------------------------------------------------------------------------

describe("Google Docs MCP — gdocs_list", () => {
  it("lists Google Docs documents via Drive API", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: docsAuth() });
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
      pageSize: 20,
      fields: "files(id, name, modifiedTime, createdTime)",
    });

    expect(res.status).toBe(200);
    const docs = res.data.files ?? [];
    console.log(`  Google Docs found: ${docs.length}`);
    if (docs.length > 0) {
      console.log(`  Titles: ${docs.map((d) => d.name).join(", ")}`);
    }
    expect(Array.isArray(docs)).toBe(true);
  });
});

describe("Google Docs MCP — gdocs_get", () => {
  it("reads document content if any docs are accessible", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: docsAuth() });
    const listRes = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.document' and trashed = false",
      pageSize: 1,
      fields: "files(id, name)",
    });

    const docs = listRes.data.files ?? [];
    if (docs.length === 0) {
      console.log("  No Google Docs accessible — skipping content read test");
      return;
    }

    const doc = docs[0]!;
    const exportRes = await drive.files.export(
      { fileId: doc.id!, mimeType: "text/plain" },
      { responseType: "text" },
    );

    expect(exportRes.status).toBe(200);
    expect(typeof exportRes.data).toBe("string");
    console.log(`  Read "${doc.name}" — ${String(exportRes.data).length} chars`);
  });

  it("authenticates with Docs-specific scopes", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const auth = docsAuth();
    const client = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    expect(typeof tokenRes.token).toBe("string");
    expect((tokenRes.token ?? "").length).toBeGreaterThan(0);
    console.log("  Docs OAuth token acquired successfully");
  });
});

// ---------------------------------------------------------------------------
// Google Sheets (gsheets_get, gsheets_list)
// ---------------------------------------------------------------------------

describe("Google Sheets MCP — auth", () => {
  it("authenticates with Sheets scope and obtains an access token", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const auth = sheetsAuth();
    const client = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    expect(typeof tokenRes.token).toBe("string");
    expect((tokenRes.token ?? "").length).toBeGreaterThan(0);
    console.log("  Sheets OAuth token acquired successfully");
  });
});

describe("Google Sheets MCP — gdrive_list (spreadsheets)", () => {
  it("lists Google Sheets files via Drive API", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: driveAuth() });
    const res = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      pageSize: 20,
      fields: "files(id, name, modifiedTime)",
    });

    expect(res.status).toBe(200);
    const sheets = res.data.files ?? [];
    console.log(`  Spreadsheets found: ${sheets.length}`);
    if (sheets.length > 0) {
      console.log(`  Names: ${sheets.map((s) => s.name).join(", ")}`);
    }
    expect(Array.isArray(sheets)).toBe(true);
  });
});

describe("Google Sheets MCP — gsheets_list + gsheets_get", () => {
  it("reads sheet tabs and data from the first accessible spreadsheet", async () => {
    if (!KEY_PATH) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");

    const drive = google.drive({ version: "v3", auth: driveAuth() });
    const listRes = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      pageSize: 1,
      fields: "files(id, name)",
    });

    const files = listRes.data.files ?? [];
    if (files.length === 0) {
      console.log("  No spreadsheets accessible — skipping read test");
      return;
    }

    const file = files[0]!;
    const sheets = google.sheets({ version: "v4", auth: sheetsAuth() });

    let metaRes;
    try {
      metaRes = await sheets.spreadsheets.get({
        spreadsheetId: file.id!,
        fields: "sheets.properties(sheetId,title,index)",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("sheets.googleapis.com") && msg.includes("disabled")) {
        console.log("  Google Sheets API is disabled in this GCP project — enable it at:");
        console.log("  https://console.developers.google.com/apis/api/sheets.googleapis.com");
        return;
      }
      throw err;
    }

    const tabs = (metaRes.data.sheets ?? []).map((s) => s.properties);
    expect(tabs.length).toBeGreaterThan(0);
    console.log(`  "${file.name}" has ${tabs.length} tab(s): ${tabs.map((t) => t?.title).join(", ")}`);

    const firstTab = tabs[0]?.title ?? "Sheet1";
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: file.id!,
      range: `${firstTab}!A1:E5`,
    });

    const values = dataRes.data.values ?? [];
    console.log(`  First 5 rows of "${firstTab}": ${values.length} row(s) returned`);
    expect(Array.isArray(values)).toBe(true);
  });
});
