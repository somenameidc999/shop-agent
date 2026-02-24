/**
 * MCP Server Configuration
 *
 * Each entry defines an MCP server that the agent can connect to.
 * Servers are spawned as child processes via stdio transport.
 * Set `enabled: true` and provide valid credentials in .env to activate.
 */

export interface McpServerConfig {
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

function envOrEmpty(key: string): string {
  return process.env[key] ?? "";
}

function isPresent(key: string): boolean {
  const val = process.env[key];
  return val !== undefined && val !== "" && !val.startsWith("REPLACE");
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

export function getServerConfigs(): readonly McpServerConfig[] {
  return [
    {
      name: "filesystem",
      description: "Secure file operations with configurable access controls",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        ...(envOrEmpty("FILESYSTEM_ALLOWED_DIRS").split(",").filter(Boolean)),
      ],
      enabled: isPresent("FILESYSTEM_ALLOWED_DIRS"),
    },
    {
      name: "postgres",
      description: "PostgreSQL database access and querying",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-postgres",
        envOrEmpty("POSTGRES_CONNECTION_STRING"),
      ],
      enabled: isPresent("POSTGRES_CONNECTION_STRING"),
    },
    {
      name: "mysql",
      description: "MySQL database access and querying",
      command: "npx",
      args: [
        "-y",
        "@benborla29/mcp-server-mysql",
      ],
      env: parseMySqlUrl(envOrEmpty("MYSQL_CONNECTION_STRING")),
      enabled: isPresent("MYSQL_CONNECTION_STRING"),
    },
    {
      name: "google-sheets",
      description: "Google Sheets read/write/formatting via Google API",
      command: "npx",
      args: [
        "-y",
        "@anthropic/mcp-server-google-sheets",
      ],
      env: {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: envOrEmpty("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
      },
      enabled: isPresent("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
    },
    {
      name: "google-drive",
      description: "Google Drive file listing, search, and content access",
      command: "npx",
      args: [
        "-y",
        "@anthropic/mcp-server-google-drive",
      ],
      env: {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: envOrEmpty("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
      },
      enabled: isPresent("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
    },
    {
      name: "airtable",
      description: "Airtable CRUD operations and schema inspection",
      command: "npx",
      args: [
        "-y",
        "@domdomegg/airtable-mcp-server",
      ],
      env: {
        AIRTABLE_API_KEY: envOrEmpty("AIRTABLE_API_KEY"),
        AIRTABLE_BASE_ID: envOrEmpty("AIRTABLE_BASE_ID"),
      },
      enabled: isPresent("AIRTABLE_API_KEY"),
    },
    {
      name: "s3",
      description: "AWS S3 bucket operations — list, read, write objects",
      command: "npx",
      args: [
        "-y",
        "@anthropic/mcp-server-s3",
      ],
      env: {
        AWS_ACCESS_KEY_ID: envOrEmpty("AWS_ACCESS_KEY_ID"),
        AWS_SECRET_ACCESS_KEY: envOrEmpty("AWS_SECRET_ACCESS_KEY"),
        AWS_REGION: envOrEmpty("AWS_REGION"),
        AWS_S3_BUCKET: envOrEmpty("AWS_S3_BUCKET"),
      },
      enabled: isPresent("AWS_ACCESS_KEY_ID") && isPresent("AWS_S3_BUCKET"),
    },
    {
      name: "dropbox",
      description: "Dropbox file operations — list, read, write, search",
      command: "npx",
      args: [
        "-y",
        "@anthropic/mcp-server-dropbox",
      ],
      env: {
        DROPBOX_ACCESS_TOKEN: envOrEmpty("DROPBOX_ACCESS_TOKEN"),
      },
      enabled: isPresent("DROPBOX_ACCESS_TOKEN"),
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
        FTP_HOST: envOrEmpty("FTP_HOST"),
        FTP_PORT: envOrEmpty("FTP_PORT"),
        FTP_USER: envOrEmpty("FTP_USER"),
        FTP_PASS: envOrEmpty("FTP_PASS"),
      },
      enabled: isPresent("FTP_HOST"),
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
        CUSTOM_API_BASE_URL: envOrEmpty("CUSTOM_API_BASE_URL"),
        CUSTOM_API_KEY: envOrEmpty("CUSTOM_API_KEY"),
      },
      enabled: isPresent("CUSTOM_API_BASE_URL"),
    },
  ];
}
