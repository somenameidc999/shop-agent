/**
 * MCP Server Configuration unit tests
 *
 * Verifies that getServerConfigs() produces the correct server entries
 * for each data source type, with proper enabled/disabled logic.
 */

import { randomBytes } from "crypto";
import { vi, type Mock } from "vitest";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");

vi.mock("../../app/services/mcpConfig.server", () => ({
  getConfigForShop: vi.fn(),
}));

import { getConfigForShop } from "../../app/services/mcpConfig.server";
import { getServerConfigs, type McpServerConfig } from "../../app/mcp/config.server";

const mockGetConfig = getConfigForShop as Mock;

function mockConfig(fields: Record<string, string>, enabled = true) {
  return { fields, enabled };
}

function findServer(configs: readonly McpServerConfig[], name: string) {
  return configs.find((c) => c.name === name);
}

describe("getServerConfigs", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
  });

  it("returns all server entries even when no configs exist", async () => {
    mockGetConfig.mockResolvedValue(null);
    const configs = await getServerConfigs("test.myshopify.com");

    const names = configs.map((c) => c.name);
    expect(names).toContain("postgres");
    expect(names).toContain("mysql");
    expect(names).toContain("google-sheets");
    expect(names).toContain("google-drive");
    expect(names).toContain("google-docs");
    expect(names).toContain("airtable");
    expect(names).toContain("email");
    expect(names).toContain("ftp");
    expect(names).toContain("custom-api");
  });

  it("disables all servers when no shop config exists", async () => {
    mockGetConfig.mockResolvedValue(null);
    const configs = await getServerConfigs("test.myshopify.com");
    expect(configs.every((c) => !c.enabled)).toBe(true);
  });

  it("enables postgres when connectionString is present and enabled", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "postgres") {
        return mockConfig({ connectionString: "postgresql://localhost/test" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const pg = findServer(configs, "postgres")!;
    expect(pg.enabled).toBe(true);
    expect(pg.command).toBe("npx");
    expect(pg.args).toContain("@modelcontextprotocol/server-postgres");
    expect(pg.args).toContain("postgresql://localhost/test");
  });

  it("disables postgres when enabled=false in config", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "postgres") {
        return mockConfig({ connectionString: "postgresql://localhost/test" }, false);
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    expect(findServer(configs, "postgres")!.enabled).toBe(false);
  });

  it("enables mysql with parsed connection string env vars", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "mysql") {
        return mockConfig({ connectionString: "mysql://admin:pass@db.host:3306/mydb" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const mysql = findServer(configs, "mysql")!;
    expect(mysql.enabled).toBe(true);
    expect(mysql.env?.MYSQL_HOST).toBe("db.host");
    expect(mysql.env?.MYSQL_PORT).toBe("3306");
    expect(mysql.env?.MYSQL_USER).toBe("admin");
    expect(mysql.env?.MYSQL_PASS).toBe("pass");
    expect(mysql.env?.MYSQL_DB).toBe("mydb");
  });

  it("uses defaults for malformed mysql connection string", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "mysql") {
        return mockConfig({ connectionString: "not-a-url" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const mysql = findServer(configs, "mysql")!;
    expect(mysql.env?.MYSQL_HOST).toBe("localhost");
    expect(mysql.env?.MYSQL_PORT).toBe("3306");
  });

  it("enables airtable when apiKey is present", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "airtable") {
        return mockConfig({ apiKey: "patXXX", baseId: "appXXX" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const at = findServer(configs, "airtable")!;
    expect(at.enabled).toBe(true);
    expect(at.env?.AIRTABLE_API_KEY).toBe("patXXX");
    expect(at.env?.AIRTABLE_BASE_ID).toBe("appXXX");
  });

  it("disables airtable when apiKey is missing", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "airtable") {
        return mockConfig({ baseId: "appXXX" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    expect(findServer(configs, "airtable")!.enabled).toBe(false);
  });

  it("enables email when all required fields are present", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "email") {
        return mockConfig({
          emailAddress: "test@gmail.com",
          password: "app-pass",
          imapHost: "imap.gmail.com",
          smtpHost: "smtp.gmail.com",
          imapPort: "993",
          smtpPort: "465",
        });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const email = findServer(configs, "email")!;
    expect(email.enabled).toBe(true);
    expect(email.env?.MCP_EMAIL_ADDRESS).toBe("test@gmail.com");
    expect(email.env?.MCP_EMAIL_IMAP_HOST).toBe("imap.gmail.com");
    expect(email.env?.MCP_EMAIL_SMTP_TLS).toBe("true");
    expect(email.env?.MCP_EMAIL_SMTP_STARTTLS).toBe("false");
  });

  it("uses STARTTLS mode when smtp port is 587", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "email") {
        return mockConfig({
          emailAddress: "test@outlook.com",
          password: "pass",
          imapHost: "outlook.office365.com",
          smtpHost: "smtp.office365.com",
          smtpPort: "587",
        });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const email = findServer(configs, "email")!;
    expect(email.env?.MCP_EMAIL_SMTP_TLS).toBe("false");
    expect(email.env?.MCP_EMAIL_SMTP_STARTTLS).toBe("true");
  });

  it("enables ftp when host is present", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "ftp") {
        return mockConfig({ host: "ftp.example.com", port: "22", username: "user", password: "pass" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const ftp = findServer(configs, "ftp")!;
    expect(ftp.enabled).toBe(true);
    expect(ftp.env?.FTP_HOST).toBe("ftp.example.com");
    expect(ftp.env?.FTP_USER).toBe("user");
  });

  it("enables custom-api when baseUrl is present", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "custom-api") {
        return mockConfig({ baseUrl: "https://api.example.com", apiKey: "sk-123" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const api = findServer(configs, "custom-api")!;
    expect(api.enabled).toBe(true);
    expect(api.env?.CUSTOM_API_BASE_URL).toBe("https://api.example.com");
    expect(api.env?.CUSTOM_API_KEY).toBe("sk-123");
  });

  it("enables custom-api without an API key (optional field)", async () => {
    mockGetConfig.mockImplementation((_shop: string, type: string) => {
      if (type === "custom-api") {
        return mockConfig({ baseUrl: "https://api.example.com" });
      }
      return null;
    });

    const configs = await getServerConfigs("test.myshopify.com");
    const api = findServer(configs, "custom-api")!;
    expect(api.enabled).toBe(true);
    expect(api.env?.CUSTOM_API_KEY).toBe("");
  });
});
