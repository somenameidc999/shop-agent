# Sidekick Agent

An agentic AI assistant for Shopify merchants. Merchants define business goals, and the AI agent autonomously analyzes their store data across multiple connected services via [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers, then delivers actionable recommendations that can be executed with a single click.

## How It Works

```
Merchant sets goals  →  AI agent analyzes store via MCP servers  →  Actionable recommendations  →  One-click execution
```

1. **Goal creation** — Merchant describes a business objective in plain language (e.g., "Find products with low inventory that are selling fast")
2. **AI inference** — The system uses LLM inference to generate analysis prompts, action prompts, and determine which MCP servers are needed
3. **Autonomous analysis** — A background job runs the AI agent against connected data sources, using tool calls to gather evidence
4. **Verdict & recommendations** — The agent determines if the goal is actionable and generates a specific recommendation with context
5. **One-click execution** — Merchant reviews the recommendation and clicks to execute — the agent carries out the action via the same MCP tools

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Shopify Embedded App (React Router + Polaris)          │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐            │
│  │  Chat UI │  │  Goals   │  │  Settings  │            │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘            │
│       │              │              │                    │
│  ─────┴──────────────┴──────────────┴────────────────   │
│                    API Layer                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │              MCP Client Manager                   │   │
│  │  Aggregates tools from all servers, namespaces    │   │
│  │  them, and routes tool calls to the right server  │   │
│  └──────┬───────┬───────┬───────┬───────┬───────┬───┘   │
│         │       │       │       │       │       │        │
│     Shopify  Postgres  MySQL  Google  Airtable  ...     │
│      MCP      MCP      MCP   Sheets    MCP              │
│     Server   Server   Server  MCP     Server            │
└─────────────────────────────────────────────────────────┘
```

### MCP Server Integration

The **MCP Client Manager** (`app/mcp/mcpManager.server.ts`) is the core orchestration layer:

- Connects to multiple MCP servers as child processes via stdio transport
- Aggregates tools from all servers into a single tool registry
- Namespaces tools (`serverName__toolName`) to prevent collisions
- Converts MCP tool schemas to Zod schemas for the Vercel AI SDK
- Routes tool calls to the correct server at runtime
- Supports dynamic reconfiguration — merchants can add/remove data sources from the settings UI

**Built-in MCP servers:**
- **Shopify** — Full Admin GraphQL API access with schema introspection, query builder, and sandboxed JS execution
- **Google Sheets / Drive / Docs** — Read/write spreadsheets, search files, create documents
- **FTP** — File operations on remote servers
- **Custom API** — Connect any REST API as an MCP tool source

**Third-party MCP servers (via npm):**
- PostgreSQL, MySQL, Airtable, Email

### Goal Engine

The goal engine (`app/services/goals.server.ts`) implements a full agentic loop:

1. **Inference** — LLM generates analysis/action prompts from plain-language goals
2. **Scheduling** — Background worker runs goal analysis on configurable intervals
3. **Analysis** — AI agent uses MCP tools to gather data, then returns a structured verdict (applicable/not applicable)
4. **Execution** — On merchant approval, the agent executes the action via the same tool set
5. **Lifecycle** — Executions have TTLs, can be dismissed, and won't re-trigger for completed actions

Key design decisions:
- Batch processing with configurable concurrency to avoid rate limits
- Retry with exponential backoff for transient failures
- Tool call step limits to prevent runaway agent loops
- Encrypted credential storage for all MCP server configurations

### Shopify MCP Server

The custom Shopify MCP server (`app/mcp/servers/shopify/`) provides six tools:

| Tool | Purpose |
|------|---------|
| `shopify_find` | Search the Admin API schema for queries, mutations, and types |
| `shopify_get_type` | Get the full definition of a named type |
| `shopify_get_operation` | Get the full signature of a query or mutation |
| `shopify_query` | Build and execute queries from resource/fields/filter (recommended) |
| `shopify_graphql` | Execute raw GraphQL with schema validation |
| `shopify_execute` | Run multi-step JS in a sandboxed environment against the API |

The query builder handles Relay pagination patterns automatically, validates field names against the introspected schema, and suggests corrections for invalid fields.

## Tech Stack

- **TypeScript** — End-to-end type safety
- **React Router** — Full-stack framework (server + client)
- **Vercel AI SDK** — LLM streaming, tool calling, and multi-step agent execution
- **Model Context Protocol** — Standardized tool interface for AI agents
- **Prisma** — Database ORM with encrypted credential storage
- **Zod** — Runtime schema validation for MCP tool inputs
- **Shopify App Bridge** — Embedded app authentication and session management

## Project Structure

```
app/
├── mcp/
│   ├── mcpManager.server.ts    # MCP client manager (tool aggregation & routing)
│   ├── config.server.ts        # Server config builder from encrypted DB records
│   └── servers/
│       ├── shopify/            # Custom Shopify Admin API MCP server
│       ├── google-sheets/      # Google Sheets MCP server
│       ├── google-drive/       # Google Drive MCP server
│       ├── google-docs/        # Google Docs MCP server
│       ├── ftp/                # FTP MCP server
│       └── custom-api/         # Generic REST API MCP server
├── services/
│   ├── goals.server.ts         # Goal engine (inference, analysis, execution)
│   └── mcpConfig.server.ts     # MCP config CRUD + encryption
├── jobs/
│   ├── scheduler.server.ts     # Cron-based goal analysis scheduler
│   ├── worker.server.ts        # Background job processor
│   └── handlers.server.ts      # Job type handlers
├── routes/
│   ├── app.chat.tsx            # Chat interface
│   ├── app.goals.tsx           # Goal management UI
│   ├── app.settings.tsx        # MCP server configuration
│   └── api.chat.ts             # Streaming chat API endpoint
└── components/
    ├── chat/                   # Chat UI components
    ├── goals/                  # Goal management components
    ├── recommendations/        # Recommendation cards
    └── settings/               # MCP server settings forms
```

## Local Development

```shell
npm install
shopify app dev
```

## License

MIT
