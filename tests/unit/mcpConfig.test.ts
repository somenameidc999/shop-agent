/**
 * MCP Server Configuration unit tests
 *
 * Verifies that getServerConfigs() produces the correct server entries
 * for each data source type, with proper enabled/disabled logic.
 *
 * The production code reads McpServerConfig rows from prisma, decrypts
 * configJson, and builds runtime configs via buildServerConfig(). We
 * mock prisma and decrypt to test the config-building logic in isolation.
 */

import { randomBytes } from "crypto";
import { vi } from "vitest";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

vi.mock("../../app/db.server", () => ({
  default: {
    mcpServerConfig: { findMany: vi.fn() },
    shop: { findUnique: vi.fn() },
  },
}));

vi.mock("../../app/utils/encryption.server", () => ({
  decrypt: vi.fn((val: string) => val),
  encrypt: vi.fn((val: string) => val),
}));

import prisma from "../../app/db.server";
import { getServerConfigs, type McpServerConfig } from "../../app/mcp/config.server";

const mockPrisma = prisma as unknown as {
  mcpServerConfig: { findMany: ReturnType<typeof vi.fn> };
  shop: { findUnique: ReturnType<typeof vi.fn> };
};

function dbRow(
  serverType: string,
  fields: Record<string, string>,
  enabled = true,
  instanceName = "default",
) {
  return {
    id: `cfg-${serverType}-${instanceName}`,
    shop: "test.myshopify.com",
    serverType,
    instanceName,
    configJson: JSON.stringify(fields),
    enabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function findByType(configs: readonly McpServerConfig[], serverType: string) {
  return configs.find((c) => c.serverType === serverType);
}

describe("getServerConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.shop.findUnique.mockResolvedValue({ accessToken: "shpat_test" });
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([]);
  });

  it("returns only shopify when no configs exist in the database", async () => {
    const configs = await getServerConfigs("test.myshopify.com");
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe("shopify");
  });

  it("disables shopify when no shop access token exists", async () => {
    mockPrisma.shop.findUnique.mockResolvedValue(null);
    const configs = await getServerConfigs("test.myshopify.com");
    const shopify = configs.find((c) => c.name === "shopify")!;
    expect(shopify.enabled).toBe(false);
  });

  it("enables postgres when connectionString is present and enabled", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("postgres", { connectionString: "postgresql://localhost/test" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const pg = findByType(configs, "postgres")!;
    expect(pg).toBeDefined();
    expect(pg.name).toBe("postgres__default");
    expect(pg.enabled).toBe(true);
    expect(pg.command).toBe("npx");
    expect(pg.args).toContain("@modelcontextprotocol/server-postgres");
    expect(pg.args).toContain("postgresql://localhost/test");
  });

  it("disables postgres when enabled=false in config", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("postgres", { connectionString: "postgresql://localhost/test" }, false),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const pg = findByType(configs, "postgres")!;
    expect(pg).toBeDefined();
    expect(pg.enabled).toBe(false);
  });

  it("enables mysql with parsed connection string env vars", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("mysql", { connectionString: "mysql://admin:pass@db.host:3306/mydb" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const mysql = findByType(configs, "mysql")!;
    expect(mysql).toBeDefined();
    expect(mysql.enabled).toBe(true);
    expect(mysql.env?.MYSQL_HOST).toBe("db.host");
    expect(mysql.env?.MYSQL_PORT).toBe("3306");
    expect(mysql.env?.MYSQL_USER).toBe("admin");
    expect(mysql.env?.MYSQL_PASS).toBe("pass");
    expect(mysql.env?.MYSQL_DB).toBe("mydb");
  });

  it("uses defaults for malformed mysql connection string", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("mysql", { connectionString: "not-a-url" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const mysql = findByType(configs, "mysql")!;
    expect(mysql).toBeDefined();
    expect(mysql.env?.MYSQL_HOST).toBe("localhost");
    expect(mysql.env?.MYSQL_PORT).toBe("3306");
  });

  it("enables airtable when apiKey is present", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("airtable", { apiKey: "patXXX", baseId: "appXXX" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const at = findByType(configs, "airtable")!;
    expect(at).toBeDefined();
    expect(at.enabled).toBe(true);
    expect(at.env?.AIRTABLE_API_KEY).toBe("patXXX");
    expect(at.env?.AIRTABLE_BASE_ID).toBe("appXXX");
  });

  it("disables airtable when apiKey is missing", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("airtable", { baseId: "appXXX" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const at = findByType(configs, "airtable")!;
    expect(at).toBeDefined();
    expect(at.enabled).toBe(false);
  });

  it("enables email when all required fields are present", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("email", {
        emailAddress: "test@gmail.com",
        password: "app-pass",
        imapHost: "imap.gmail.com",
        smtpHost: "smtp.gmail.com",
        imapPort: "993",
        smtpPort: "465",
      }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const email = findByType(configs, "email")!;
    expect(email).toBeDefined();
    expect(email.enabled).toBe(true);
    expect(email.env?.MCP_EMAIL_ADDRESS).toBe("test@gmail.com");
    expect(email.env?.MCP_EMAIL_IMAP_HOST).toBe("imap.gmail.com");
    expect(email.env?.MCP_EMAIL_SMTP_TLS).toBe("true");
    expect(email.env?.MCP_EMAIL_SMTP_STARTTLS).toBe("false");
  });

  it("uses STARTTLS mode when smtp port is 587", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("email", {
        emailAddress: "test@outlook.com",
        password: "pass",
        imapHost: "outlook.office365.com",
        smtpHost: "smtp.office365.com",
        smtpPort: "587",
      }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const email = findByType(configs, "email")!;
    expect(email).toBeDefined();
    expect(email.env?.MCP_EMAIL_SMTP_TLS).toBe("false");
    expect(email.env?.MCP_EMAIL_SMTP_STARTTLS).toBe("true");
  });

  it("enables ftp when host is present", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("ftp", { host: "ftp.example.com", port: "22", username: "user", password: "pass" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const ftp = findByType(configs, "ftp")!;
    expect(ftp).toBeDefined();
    expect(ftp.enabled).toBe(true);
    expect(ftp.env?.FTP_HOST).toBe("ftp.example.com");
    expect(ftp.env?.FTP_USER).toBe("user");
  });

  it("enables custom-api when baseUrl is present", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("custom-api", { baseUrl: "https://api.example.com", apiKey: "sk-123" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const api = findByType(configs, "custom-api")!;
    expect(api).toBeDefined();
    expect(api.enabled).toBe(true);
    expect(api.env?.CUSTOM_API_BASE_URL).toBe("https://api.example.com");
    expect(api.env?.CUSTOM_API_KEY).toBe("sk-123");
  });

  it("enables custom-api without an API key (optional field)", async () => {
    mockPrisma.mcpServerConfig.findMany.mockResolvedValue([
      dbRow("custom-api", { baseUrl: "https://api.example.com" }),
    ]);

    const configs = await getServerConfigs("test.myshopify.com");
    const api = findByType(configs, "custom-api")!;
    expect(api).toBeDefined();
    expect(api.enabled).toBe(true);
    expect(api.env?.CUSTOM_API_KEY).toBe("");
  });
});
