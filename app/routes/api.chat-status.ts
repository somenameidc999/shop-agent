/**
 * Chat Status API Route
 *
 * Returns the current status of MCP server connections.
 * Used by the chat UI to show which data sources are available.
 */

import type { LoaderFunctionArgs } from "react-router";
import { mcpManager } from "../mcp/mcpManager.server";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  await mcpManager.ensureInitialized();
  const status = mcpManager.getStatus();

  return Response.json(status);
}
