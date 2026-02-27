/**
 * Chat API Route
 *
 * Server-side action that handles chat messages from the UI.
 * Streams responses from Claude via Vercel AI SDK with MCP tools.
 *
 * Shop context is set by the app.tsx layout loader (which authenticates);
 * this route relies on the stored shop in the MCP manager singleton.
 */

import type { ActionFunctionArgs } from "react-router";
import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
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

When using email tools:
- list_emails returns paginated results — always use a reasonable limit (e.g., 20–50) and use offset to paginate through results
- Don't assume a small result set is the entire inbox; tell the user how many you retrieved and offer to load more
- Use search_emails for targeted lookups instead of browsing the full inbox

You can help with tasks like:
- Querying databases for order, product, or customer data
- Reading and writing spreadsheets and documents
- Managing files across storage services (S3, Dropbox, FTP)
- Making API calls to external services
- Reading, searching, sending, and managing email
- Cross-referencing data from multiple sources`;

export async function action({ request }: ActionFunctionArgs) {
  const { messages } = await request.json();

  // DefaultChatTransport sends UI messages (with `parts` array).
  // streamText expects model messages (with `content` string/array).
  const modelMessages = await convertToModelMessages(messages);

  const tools = await mcpManager.getToolsForAI();
  const hasTools = Object.keys(tools).length > 0;

  const result = streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    // Only pass tools when there are actually tools available.
    // Passing an empty tools object causes some providers to error.
    ...(hasTools ? { tools, stopWhen: stepCountIs(10) } : {}),
  });

  // DefaultChatTransport (used by useChat) expects a UI message stream
  // (JSON-encoded SSE events), not a raw text stream.
  return result.toUIMessageStreamResponse();
}
