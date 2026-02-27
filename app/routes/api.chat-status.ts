/**
 * Chat Status API Route
 *
 * Returns the current status of MCP server connections.
 * Used by the chat UI to show which data sources are available.
 *
 * Shop context is set by the app.tsx layout loader (which authenticates);
 * this route relies on the stored shop in the MCP manager singleton.
 */

import type { LoaderFunctionArgs } from "react-router";
import { mcpManager } from "../mcp/mcpManager.server";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  await mcpManager.ensureInitialized();
  const status = mcpManager.getFullStatus();

  return Response.json(status);
}
