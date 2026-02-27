import prisma from "../db.server";
import { encrypt, decrypt } from "../utils/encryption.server";

export const SERVER_TYPES = [
  "postgres",
  "mysql",
  "google",
  "airtable",
  // "s3",
  // "dropbox",
  "email",
  "ftp",
  "custom-api",
] as const;

export type ServerType = (typeof SERVER_TYPES)[number];

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "textarea" | "number";
  required: boolean;
  sensitive: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export const SERVER_FIELD_DEFS: Record<
  ServerType,
  { label: string; description: string; fields: FieldDef[] }
> = {
  postgres: {
    label: "PostgreSQL",
    description: "PostgreSQL database access and querying",
    fields: [
      {
        key: "connectionString",
        label: "Connection String",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "postgresql://user:pass@host:5432/dbname",
      },
    ],
  },
  mysql: {
    label: "MySQL",
    description: "MySQL database access and querying",
    fields: [
      {
        key: "connectionString",
        label: "Connection String",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "mysql://user:pass@host:3306/dbname",
      },
    ],
  },
  google: {
    label: "Google Services",
    description: "Google Drive, Docs, and Sheets access",
    fields: [
      {
        key: "serviceAccountJson",
        label: "Service Account JSON",
        type: "textarea",
        required: true,
        sensitive: true,
        placeholder: '{"type": "service_account", ...}',
      },
    ],
  },
  airtable: {
    label: "Airtable",
    description: "Airtable CRUD operations and schema inspection",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "pat...",
      },
      {
        key: "baseId",
        label: "Base ID",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "app...",
      },
    ],
  },
  // s3: {
  //   label: "AWS S3",
  //   description: "AWS S3 bucket operations — list, read, write objects",
  //   fields: [
  //     { key: "accessKeyId", label: "Access Key ID", type: "password", required: true, sensitive: true, placeholder: "AKIA..." },
  //     { key: "secretAccessKey", label: "Secret Access Key", type: "password", required: true, sensitive: true },
  //     { key: "region", label: "Region", type: "text", required: true, sensitive: false, placeholder: "us-east-1", defaultValue: "us-east-1" },
  //     { key: "bucket", label: "Bucket Name", type: "text", required: true, sensitive: false, placeholder: "my-bucket" },
  //   ],
  // },
  // dropbox: {
  //   label: "Dropbox",
  //   description: "Dropbox file operations — list, read, write, search",
  //   fields: [
  //     { key: "accessToken", label: "Access Token", type: "password", required: true, sensitive: true },
  //   ],
  // },
  email: {
    label: "Email (IMAP/SMTP)",
    description: "Read, search, send, and manage email via IMAP and SMTP",
    fields: [
      {
        key: "emailAddress",
        label: "Email Address",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "you@gmail.com",
      },
      {
        key: "password",
        label: "Password / App Password",
        type: "password",
        required: true,
        sensitive: true,
        placeholder: "App-specific password",
      },
      {
        key: "imapHost",
        label: "IMAP Host",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "imap.gmail.com",
      },
      {
        key: "smtpHost",
        label: "SMTP Host",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "smtp.gmail.com",
      },
      {
        key: "imapPort",
        label: "IMAP Port",
        type: "number",
        required: false,
        sensitive: false,
        placeholder: "993",
        defaultValue: "993",
      },
      {
        key: "smtpPort",
        label: "SMTP Port",
        type: "number",
        required: false,
        sensitive: false,
        placeholder: "465",
        defaultValue: "465",
      },
    ],
  },
  ftp: {
    label: "FTP / SFTP",
    description: "FTP/SFTP file operations — list, upload, download",
    fields: [
      {
        key: "host",
        label: "Host",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "ftp.example.com",
      },
      {
        key: "port",
        label: "Port",
        type: "number",
        required: false,
        sensitive: false,
        placeholder: "22",
        defaultValue: "22",
      },
      {
        key: "username",
        label: "Username",
        type: "text",
        required: true,
        sensitive: false,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        required: true,
        sensitive: true,
      },
    ],
  },
  "custom-api": {
    label: "Custom API",
    description: "Custom REST API integration — GET, POST, PUT, DELETE",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "text",
        required: true,
        sensitive: false,
        placeholder: "https://api.example.com",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: false,
        sensitive: true,
        placeholder: "Optional",
      },
    ],
  },
};

export interface ShopConfig {
  fields: Record<string, string>;
  enabled: boolean;
}

export async function getConfigForShop(
  shop: string,
  serverType: string,
): Promise<ShopConfig | null> {
  const record = await prisma.mcpServerConfig.findUnique({
    where: { shop_serverType: { shop, serverType } },
  });

  if (!record) return null;

  try {
    return {
      fields: JSON.parse(decrypt(record.configJson)) as Record<string, string>,
      enabled: record.enabled,
    };
  } catch {
    return null;
  }
}

export async function saveConfigForShop(
  shop: string,
  serverType: string,
  fields: Record<string, string>,
  enabled: boolean,
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(fields));

  await prisma.mcpServerConfig.upsert({
    where: { shop_serverType: { shop, serverType } },
    update: { configJson: encrypted, enabled },
    create: { shop, serverType, configJson: encrypted, enabled },
  });
}

export async function deleteConfigForShop(
  shop: string,
  serverType: string,
): Promise<void> {
  await prisma.mcpServerConfig.deleteMany({
    where: { shop, serverType },
  });
}

export async function getAllConfigsForShop(
  shop: string,
): Promise<
  Array<{
    serverType: string;
    label: string;
    description: string;
    enabled: boolean;
    hasConfig: boolean;
    fields: Record<string, string>;
  }>
> {
  const records = await prisma.mcpServerConfig.findMany({
    where: { shop },
  });

  return SERVER_TYPES.map((serverType) => {
    const record = records.find((r) => r.serverType === serverType);
    const def = SERVER_FIELD_DEFS[serverType];
    let fields: Record<string, string> = {};

    if (record) {
      try {
        const config = JSON.parse(decrypt(record.configJson)) as Record<
          string,
          string
        >;
        for (const fieldDef of def.fields) {
          const value = config[fieldDef.key] ?? "";
          fields[fieldDef.key] =
            fieldDef.sensitive && value ? "••••••••" : value;
        }
      } catch {
        /* decrypt failure — treat as unconfigured */
      }
    }

    return {
      serverType,
      label: def.label,
      description: def.description,
      enabled: record?.enabled ?? false,
      hasConfig: !!record,
      fields,
    };
  });
}
