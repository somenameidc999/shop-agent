/**
 * MCP Server Configuration
 *
 * Builds runtime MCP server definitions from encrypted DB records.
 * Servers are spawned as child processes via stdio transport.
 *
 * Supports multiple instances of each connector type (e.g. two Postgres DBs).
 * Each instance gets a unique name: `{serverType}__{instanceName}`.
 */

import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import prisma from "../db.server";
import { decrypt } from "../utils/encryption.server";
import { SERVER_FIELD_DEFS, type ServerType } from "../services/mcpConfig.server";

export interface McpServerConfig {
  readonly name: string;
  readonly serverType: string;
  readonly instanceName: string;
  readonly description: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  readonly allowedTools?: readonly string[];
}

interface InstanceRecord {
  serverType: string;
  instanceName: string;
  fields: Record<string, string>;
  enabled: boolean;
}

function parseMySqlUrl(connString: string): Record<string, string> {
  try {
    const url = new URL(connString);
    return {
      MYSQL_HOST: url.hostname || "localhost",
      MYSQL_PORT: url.port || "3306",
      MYSQL_USER: url.username || "root",
      MYSQL_PASS: url.password || "",
      MYSQL_DB: url.pathname.slice(1) || "mydb",
    };
  } catch {
    return {
      MYSQL_HOST: "localhost",
      MYSQL_PORT: "3306",
      MYSQL_USER: "root",
      MYSQL_PASS: "",
      MYSQL_DB: "mydb",
    };
  }
}

function safeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

function writeGoogleCredsFile(
  shop: string,
  instanceName: string,
  jsonContent: string,
): string {
  const tmpDir = join(tmpdir(), "agent-creds");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  }
  const safeShop = shop.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = join(
    tmpDir,
    `${safeShop}-google-${safeName(instanceName)}-creds.json`,
  );
  writeFileSync(filePath, jsonContent, { mode: 0o600 });
  return filePath;
}

export function cleanupGoogleCredsFiles(shop: string): void {
  const tmpDir = join(tmpdir(), "agent-creds");
  const safeShop = shop.replace(/[^a-zA-Z0-9.-]/g, "_");
  try {
    const { readdirSync } = require("fs") as typeof import("fs");
    for (const file of readdirSync(tmpDir)) {
      if (file.startsWith(`${safeShop}-google-`) && file.endsWith("-creds.json")) {
        try { unlinkSync(join(tmpDir, file)); } catch { /* noop */ }
      }
    }
  } catch {
    /* directory may not exist */
  }
}

/** Keep backward compat — old code may call this */
export function cleanupGoogleCredsFile(shop: string): void {
  cleanupGoogleCredsFiles(shop);
}

function hasFields(
  fields: Record<string, string>,
  ...requiredKeys: string[]
): boolean {
  return requiredKeys.every((k) => !!fields[k]);
}

function buildServerConfig(
  inst: InstanceRecord,
  extra: { googleCredsPath?: string } = {},
): McpServerConfig[] {
  const { serverType, instanceName, fields, enabled } = inst;
  const name = `${serverType}__${safeName(instanceName)}`;
  const def = SERVER_FIELD_DEFS[serverType as ServerType];
  if (!def) return [];

  switch (serverType) {
    case "postgres":
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-postgres", fields.connectionString ?? ""],
        enabled: enabled && hasFields(fields, "connectionString"),
      }];

    case "mysql":
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["-y", "@benborla29/mcp-server-mysql"],
        env: parseMySqlUrl(fields.connectionString ?? ""),
        enabled: enabled && hasFields(fields, "connectionString"),
      }];

    case "google": {
      const credsPath = extra.googleCredsPath ?? "";
      const isOn = enabled && !!credsPath;
      const suffix = ` (${instanceName})`;
      return [
        {
          name: `google-sheets__${safeName(instanceName)}`,
          serverType: "google-sheets",
          instanceName,
          description: `Google Sheets read/write/formatting via Google API${suffix}`,
          command: "npx",
          args: ["tsx", new URL("./servers/google-sheets/index.ts", import.meta.url).pathname],
          env: { GOOGLE_APPLICATION_CREDENTIALS: credsPath },
          enabled: isOn,
        },
        {
          name: `google-drive__${safeName(instanceName)}`,
          serverType: "google-drive",
          instanceName,
          description: `Google Drive file listing, search, and content access${suffix}`,
          command: "npx",
          args: ["tsx", new URL("./servers/google-drive/index.ts", import.meta.url).pathname],
          env: { GOOGLE_APPLICATION_CREDENTIALS: credsPath },
          enabled: isOn,
        },
        {
          name: `google-docs__${safeName(instanceName)}`,
          serverType: "google-docs",
          instanceName,
          description: `Google Docs read, create, and append operations${suffix}`,
          command: "npx",
          args: ["tsx", new URL("./servers/google-docs/index.ts", import.meta.url).pathname],
          env: { GOOGLE_APPLICATION_CREDENTIALS: credsPath },
          enabled: isOn,
        },
      ];
    }

    case "airtable":
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["-y", "airtable-mcp-server"],
        env: {
          AIRTABLE_API_KEY: fields.apiKey ?? "",
          AIRTABLE_BASE_ID: fields.baseId ?? "",
        },
        enabled: enabled && hasFields(fields, "apiKey"),
      }];

    case "email": {
      const smtpPort = fields.smtpPort ?? "465";
      const useStarttls = smtpPort === "587";
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["-y", "@codefuturist/email-mcp", "stdio"],
        env: {
          MCP_EMAIL_ADDRESS: fields.emailAddress ?? "",
          MCP_EMAIL_PASSWORD: fields.password ?? "",
          MCP_EMAIL_IMAP_HOST: fields.imapHost ?? "",
          MCP_EMAIL_SMTP_HOST: fields.smtpHost ?? "",
          MCP_EMAIL_IMAP_PORT: fields.imapPort ?? "993",
          MCP_EMAIL_SMTP_PORT: smtpPort,
          MCP_EMAIL_SMTP_TLS: useStarttls ? "false" : "true",
          MCP_EMAIL_SMTP_STARTTLS: useStarttls ? "true" : "false",
        },
        enabled: enabled && hasFields(fields, "emailAddress", "password", "imapHost"),
        allowedTools: [
          "search_emails", "get_email", "get_thread", "download_attachment",
          "list_emails", "extract_contacts", "reply_email", "forward_email", "mark_email",
        ],
      }];
    }

    case "ftp":
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["tsx", new URL("./servers/ftp/index.ts", import.meta.url).pathname],
        env: {
          FTP_HOST: fields.host ?? "",
          FTP_PORT: fields.port ?? "22",
          FTP_USER: fields.username ?? "",
          FTP_PASS: fields.password ?? "",
        },
        enabled: enabled && hasFields(fields, "host"),
      }];

    case "custom-api":
      return [{
        name,
        serverType,
        instanceName,
        description: `${def.description} (${instanceName})`,
        command: "npx",
        args: ["tsx", new URL("./servers/custom-api/index.ts", import.meta.url).pathname],
        env: {
          CUSTOM_API_BASE_URL: fields.baseUrl ?? "",
          CUSTOM_API_KEY: fields.apiKey ?? "",
        },
        enabled: enabled && hasFields(fields, "baseUrl"),
      }];

    default:
      return [];
  }
}

export async function getServerConfigs(
  shop: string,
): Promise<readonly McpServerConfig[]> {
  const [dbRecords, shopRecord] = await Promise.all([
    prisma.mcpServerConfig.findMany({
      where: { shop },
      orderBy: [{ serverType: "asc" }, { instanceName: "asc" }],
    }),
    prisma.shop.findUnique({
      where: { shop },
      select: { accessToken: true },
    }),
  ]);

  const instances: InstanceRecord[] = dbRecords
    .map((r) => {
      try {
        return {
          serverType: r.serverType,
          instanceName: r.instanceName,
          fields: JSON.parse(decrypt(r.configJson)) as Record<string, string>,
          enabled: r.enabled,
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is InstanceRecord => r !== null);

  const configs: McpServerConfig[] = [];

  for (const inst of instances) {
    let extra: { googleCredsPath?: string } = {};

    if (inst.serverType === "google" && inst.enabled && hasFields(inst.fields, "serviceAccountJson")) {
      extra.googleCredsPath = writeGoogleCredsFile(
        shop,
        inst.instanceName,
        inst.fields.serviceAccountJson!,
      );
    }

    configs.push(...buildServerConfig(inst, extra));
  }

  // Shopify is always a single auto-configured instance tied to the shop's OAuth token
  configs.push({
    name: "shopify",
    serverType: "shopify",
    instanceName: "default",
    description: "Shopify Admin API — products, orders, customers, inventory, and more",
    command: "npx",
    args: [
      "tsx",
      new URL("./servers/shopify/index.ts", import.meta.url).pathname,
      "--shop",
      shop,
    ],
    env: { SHOPIFY_API_VERSION: "2025-10" },
    enabled: !!shopRecord?.accessToken,
  });

  return configs;
}
