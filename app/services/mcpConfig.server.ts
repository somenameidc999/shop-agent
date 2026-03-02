import prisma from "../db.server";
import { encrypt, decrypt } from "../utils/encryption.server";
import {
  SERVER_FIELD_DEFS,
  type ServerType,
  type InstanceConfigSummary,
} from "./mcpConfig.shared";

// Re-export shared constants/types so existing server-side imports keep working
export {
  SERVER_TYPES,
  SERVER_FIELD_DEFS,
  type ServerType,
  type FieldDef,
  type InstanceConfigSummary,
} from "./mcpConfig.shared";

export interface ShopConfig {
  fields: Record<string, string>;
  enabled: boolean;
}

export async function getConfigForShop(
  shop: string,
  serverType: string,
  instanceName: string = "default",
): Promise<ShopConfig | null> {
  const record = await prisma.mcpServerConfig.findUnique({
    where: {
      shop_serverType_instanceName: { shop, serverType, instanceName },
    },
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
  instanceName: string,
  fields: Record<string, string>,
  enabled: boolean,
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(fields));

  await prisma.mcpServerConfig.upsert({
    where: {
      shop_serverType_instanceName: { shop, serverType, instanceName },
    },
    update: { configJson: encrypted, enabled },
    create: {
      shop,
      serverType,
      instanceName,
      configJson: encrypted,
      enabled,
    },
  });
}

export async function deleteConfigForShop(
  shop: string,
  serverType: string,
  instanceName: string,
): Promise<void> {
  await prisma.mcpServerConfig.deleteMany({
    where: { shop, serverType, instanceName },
  });
}

export async function getAllConfigsForShop(
  shop: string,
): Promise<InstanceConfigSummary[]> {
  const records = await prisma.mcpServerConfig.findMany({
    where: { shop },
    orderBy: [{ serverType: "asc" }, { instanceName: "asc" }],
  });

  const results: InstanceConfigSummary[] = [];

  for (const record of records) {
    const def = SERVER_FIELD_DEFS[record.serverType as ServerType];
    if (!def) continue;

    let fields: Record<string, string> = {};
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

    results.push({
      serverType: record.serverType,
      instanceName: record.instanceName,
      label: def.label,
      description: def.description,
      enabled: record.enabled,
      hasConfig: true,
      fields,
    });
  }

  return results;
}
