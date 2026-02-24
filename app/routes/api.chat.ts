/**
 * Chat API Route
 *
 * Server-side action that handles chat messages from the UI.
 * Streams responses from Claude via Vercel AI SDK with MCP tools.
 */

import type { ActionFunctionArgs } from "react-router";
import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { mcpManager } from "../mcp/mcpManager.server";

const SYSTEM_PROMPT = `You are Sidekick, an AI assistant for Shopify merchants.

You have access to tools from multiple connected data sources including databases,
spreadsheets, file storage, APIs, and more. Each tool is prefixed with its source
name (e.g., "postgres__query", "filesystem__read_file").

When helping merchants:
- Be concise and actionable
- When using tools, briefly explain what you're doing and why
- Format data results in a readable way (tables, lists)
- If a tool call fails, explain the error and suggest alternatives
- Ask clarifying questions when the request is ambiguous

You can help with tasks like:
- Querying databases for order, product, or customer data
- Reading and writing spreadsheets and documents
- Managing files across storage services (S3, Dropbox, FTP)
- Making API calls to external services
- Cross-referencing data from multiple sources`;

export async function action({ request }: ActionFunctionArgs) {
  const { messages } = await request.json();

  const tools = await mcpManager.getToolsForAI();

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(10),
  });

  return result.toTextStreamResponse();
}
