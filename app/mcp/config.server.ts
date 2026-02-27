/**
 * MCP Server Configuration
 *
 * Each entry defines an MCP server that the agent can connect to.
 * Servers are spawned as child processes via stdio transport.
 *
 * Credentials are loaded from the encrypted database store,
 * keyed by the Shopify shop domain.
 */

import { writeFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { getConfigForShop } from "../services/mcpConfig.server";
import prisma from "../db.server";

export interface McpServerConfig {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
  /** When set, only these tool names are exposed to the agent. */
  readonly allowedTools?: readonly string[];
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

function writeGoogleCredsFile(shop: string, jsonContent: string): string {
  const tmpDir = join(tmpdir(), "sidekick-creds");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  }
  const safeName = shop.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = join(tmpDir, `${safeName}-google-creds.json`);
  writeFileSync(filePath, jsonContent, { mode: 0o600 });
  return filePath;
}

export function cleanupGoogleCredsFile(shop: string): void {
  const safeName = shop.replace(/[^a-zA-Z0-9.-]/g, "_");
  const filePath = join(
    tmpdir(),
    "sidekick-creds",
    `${safeName}-google-creds.json`,
  );
  try {
    unlinkSync(filePath);
  } catch {
    /* file may not exist */
  }
}

export async function getServerConfigs(
  shop: string,
): Promise<readonly McpServerConfig[]> {
  const [postgres, mysql, google, airtable, /* s3, dropbox, */ email, ftp, customApi, shopRecord] =
    await Promise.all([
      getConfigForShop(shop, "postgres"),
      getConfigForShop(shop, "mysql"),
      getConfigForShop(shop, "google"),
      getConfigForShop(shop, "airtable"),
      // getConfigForShop(shop, "s3"),
      // getConfigForShop(shop, "dropbox"),
      getConfigForShop(shop, "email"),
      getConfigForShop(shop, "ftp"),
      getConfigForShop(shop, "custom-api"),
      prisma.shop.findUnique({
        where: { shop },
        select: { accessToken: true },
      }),
    ]);

  // Helper: a server is enabled only when the user toggled it on AND required fields exist
  const on = (
    cfg: typeof postgres,
    ...requiredKeys: string[]
  ): boolean =>
    !!cfg?.enabled &&
    requiredKeys.every((k) => !!(cfg.fields as Record<string, string>)[k]);

  let googleCredsPath = "";
  if (on(google, "serviceAccountJson")) {
    googleCredsPath = writeGoogleCredsFile(
      shop,
      google!.fields.serviceAccountJson!,
    );
  }

  return [
    {
      name: "postgres",
      description: "PostgreSQL database access and querying",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-postgres",
        postgres?.fields.connectionString ?? "",
      ],
      enabled: on(postgres, "connectionString"),
    },
    {
      name: "mysql",
      description: "MySQL database access and querying",
      command: "npx",
      args: ["-y", "@benborla29/mcp-server-mysql"],
      env: parseMySqlUrl(mysql?.fields.connectionString ?? ""),
      enabled: on(mysql, "connectionString"),
    },
    {
      name: "google-sheets",
      description: "Google Sheets read/write/formatting via Google API",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/google-sheets/index.ts", import.meta.url).pathname,
      ],
      env: { GOOGLE_APPLICATION_CREDENTIALS: googleCredsPath },
      enabled: !!googleCredsPath,
    },
    {
      name: "google-drive",
      description: "Google Drive file listing, search, and content access",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/google-drive/index.ts", import.meta.url).pathname,
      ],
      env: { GOOGLE_APPLICATION_CREDENTIALS: googleCredsPath },
      enabled: !!googleCredsPath,
    },
    {
      name: "google-docs",
      description: "Google Docs read, create, and append operations",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/google-docs/index.ts", import.meta.url).pathname,
      ],
      env: { GOOGLE_APPLICATION_CREDENTIALS: googleCredsPath },
      enabled: !!googleCredsPath,
    },
    {
      name: "airtable",
      description: "Airtable CRUD operations and schema inspection",
      command: "npx",
      args: ["-y", "airtable-mcp-server"],
      env: {
        AIRTABLE_API_KEY: airtable?.fields.apiKey ?? "",
        AIRTABLE_BASE_ID: airtable?.fields.baseId ?? "",
      },
      enabled: on(airtable, "apiKey"),
    },
    // {
    //   name: "s3",
    //   description: "AWS S3 bucket operations — list, read, write objects",
    //   command: "npx",
    //   args: ["-y", "@anthropic/mcp-server-s3"],
    //   env: { AWS_ACCESS_KEY_ID: s3?.fields.accessKeyId ?? "", ... },
    //   enabled: on(s3, "accessKeyId", "bucket"),
    // },
    // {
    //   name: "dropbox",
    //   description: "Dropbox file operations — list, read, write, search",
    //   command: "npx",
    //   args: ["-y", "@anthropic/mcp-server-dropbox"],
    //   env: { DROPBOX_ACCESS_TOKEN: dropbox?.fields.accessToken ?? "" },
    //   enabled: on(dropbox, "accessToken"),
    // },
    {
      name: "email",
      description: "Read, search, send, and manage email via IMAP and SMTP",
      command: "npx",
      args: ["-y", "@codefuturist/email-mcp", "stdio"],
      env: (() => {
        const smtpPort = email?.fields.smtpPort ?? "465";
        const useStarttls = smtpPort === "587";
        return {
          MCP_EMAIL_ADDRESS: email?.fields.emailAddress ?? "",
          MCP_EMAIL_PASSWORD: email?.fields.password ?? "",
          MCP_EMAIL_IMAP_HOST: email?.fields.imapHost ?? "",
          MCP_EMAIL_SMTP_HOST: email?.fields.smtpHost ?? "",
          MCP_EMAIL_IMAP_PORT: email?.fields.imapPort ?? "993",
          MCP_EMAIL_SMTP_PORT: smtpPort,
          MCP_EMAIL_SMTP_TLS: useStarttls ? "false" : "true",
          MCP_EMAIL_SMTP_STARTTLS: useStarttls ? "true" : "false",
        };
      })(),
      enabled: on(email, "emailAddress", "password", "imapHost"),
      allowedTools: [
        "search_emails",
        "get_email",
        "get_thread",
        "download_attachment",
        "list_emails",
        "extract_contacts",
        "reply_email",
        "forward_email",
        "mark_email",
      ],
    },
    {
      name: "ftp",
      description: "FTP/SFTP file operations — list, upload, download",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/ftp/index.ts", import.meta.url).pathname,
      ],
      env: {
        FTP_HOST: ftp?.fields.host ?? "",
        FTP_PORT: ftp?.fields.port ?? "22",
        FTP_USER: ftp?.fields.username ?? "",
        FTP_PASS: ftp?.fields.password ?? "",
      },
      enabled: on(ftp, "host"),
    },
    {
      name: "custom-api",
      description: "Custom REST API integration — GET, POST, PUT, DELETE",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/custom-api/index.ts", import.meta.url).pathname,
      ],
      env: {
        CUSTOM_API_BASE_URL: customApi?.fields.baseUrl ?? "",
        CUSTOM_API_KEY: customApi?.fields.apiKey ?? "",
      },
      enabled: on(customApi, "baseUrl"),
    },
    {
      name: "shopify",
      description:
        "Shopify Admin API — products, orders, customers, inventory, and more",
      command: "npx",
      args: [
        "tsx",
        new URL("./servers/shopify/index.ts", import.meta.url).pathname,
        "--shop",
        shop,
      ],
      env: {
        SHOPIFY_API_VERSION: "2025-10",
      },
      enabled: !!shopRecord?.accessToken,
    },
  ];
}
