/**
 * MCP Config API Route
 *
 * CRUD operations for MCP server credentials.
 * All credentials are encrypted at rest in the database.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getAllConfigsForShop,
  getConfigForShop,
  saveConfigForShop,
  deleteConfigForShop,
  SERVER_FIELD_DEFS,
  type ServerType,
} from "../services/mcpConfig.server";
import { mcpManager } from "../mcp/mcpManager.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const serverType = url.searchParams.get("serverType");

  if (serverType) {
    const config = await getConfigForShop(session.shop, serverType);
    const def = SERVER_FIELD_DEFS[serverType as ServerType];
    if (!def) {
      return Response.json({ error: "Unknown server type" }, { status: 400 });
    }

    const redacted: Record<string, string> = {};
    if (config) {
      for (const field of def.fields) {
        const value = config.fields[field.key] ?? "";
        redacted[field.key] = field.sensitive && value ? "••••••••" : value;
      }
    }

    return Response.json({ serverType, fields: redacted, hasConfig: !!config });
  }

  const configs = await getAllConfigsForShop(session.shop);
  return Response.json({ configs });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const serverType = url.searchParams.get("serverType");
    if (!serverType) {
      return Response.json(
        { error: "serverType is required" },
        { status: 400 },
      );
    }

    await deleteConfigForShop(session.shop, serverType);
    await mcpManager.reinitialize(session.shop);

    return Response.json({ success: true });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as {
      serverType?: string;
      fields?: Record<string, string>;
      enabled?: boolean;
    };

    const { serverType, fields, enabled } = body;

    if (!serverType || !fields) {
      return Response.json(
        { error: "serverType and fields are required" },
        { status: 400 },
      );
    }

    const def = SERVER_FIELD_DEFS[serverType as ServerType];
    if (!def) {
      return Response.json({ error: "Unknown server type" }, { status: 400 });
    }

    const missingRequired = def.fields
      .filter((f) => f.required && !fields[f.key])
      .map((f) => f.label);

    if (missingRequired.length > 0) {
      return Response.json(
        { error: `Missing required fields: ${missingRequired.join(", ")}` },
        { status: 400 },
      );
    }

    const existing = await getConfigForShop(session.shop, serverType);
    const mergedFields: Record<string, string> = {};
    for (const field of def.fields) {
      const incoming = fields[field.key];
      if (incoming && incoming !== "••••••••") {
        mergedFields[field.key] = incoming;
      } else if (existing?.fields[field.key]) {
        mergedFields[field.key] = existing.fields[field.key]!;
      } else {
        mergedFields[field.key] = incoming ?? "";
      }
    }

    await saveConfigForShop(
      session.shop,
      serverType,
      mergedFields,
      enabled ?? true,
    );
    await mcpManager.reinitialize(session.shop);

    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
