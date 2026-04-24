# CLAUDE.md — Shop Agent (sidekick-agent)

## What This Project Is

An agentic AI assistant for Shopify merchants. Merchants define business goals, the AI analyzes store data via MCP servers, generates actionable recommendations (called "goal executions"), and merchants execute them with one click.

## Tech Stack

- **React Router v7** (file-based routing in `app/routes/`)
- **Vercel AI SDK** (`ai` package) for streaming chat + tool calling
- **OpenAI gpt-4o-mini** as the LLM
- **MCP (Model Context Protocol)** for tool interface
- **Prisma ORM** with SQLite (dev) / PostgreSQL (prod)
- **Shopify App Bridge** for embedded app auth
- **Vitest** for testing
- **Zod** for validation
- **TypeScript** end-to-end

## Critical Naming Convention

> **"Recommendations" in the UI = "Goal Executions" in the code/database.**

- The database model is `GoalExecution` (in `prisma/schema.prisma`)
- The API endpoint is `/api/goals` (in `app/routes/api.goals.ts`)
- The UI component is `RecommendationsPanel.tsx` which calls `/api/goals`
- There is **NO** `/api/recommendations` endpoint. Never create one.
- There is **NO** `app/services/recommendations.server.ts`. The service is `app/services/goals.server.ts`.

## API Route Registry (Complete)

Every route lives in `app/routes/`. React Router v7 convention: `loader` = GET, `action` = POST/PUT/DELETE.

| Route File | URL Path | Methods | Purpose |
|---|---|---|---|
| `api.chat.ts` | `/api/chat` | POST | Stream chat with MCP tools |
| `api.goals.ts` | `/api/goals` | GET, POST, PUT, DELETE | Goals + executions CRUD, generate, execute, dismiss |
| `api.jobs.ts` | `/api/jobs` | GET | Background job status polling |
| `api.mcp-config.ts` | `/api/mcp-config` | GET, POST, DELETE | MCP server configuration CRUD |
| `api.chat-status.ts` | `/api/chat-status` | GET | MCP server connection status |
| `app.tsx` | `/app` | GET (loader) | Layout: auth, MCP init, worker init |
| `app._index.tsx` | `/app` | GET | Task list landing page |
| `app.recommendations.$id.tsx` | `/app/recommendations/:id` | GET | Recommendation detail page |
| `app.chat.tsx` | `/app/chat` | GET | Chat interface page |
| `app.goals.tsx` | `/app/goals` | GET | Goal management page |
| `app.settings.tsx` | `/app/settings` | GET | Settings layout |
| `app.settings._index.tsx` | `/app/settings` | GET | Data source overview |
| `app.settings.$serverType.tsx` | `/app/settings/:serverType` | GET, POST | Server config detail |
| `webhooks.app.uninstalled.tsx` | `/webhooks/app/uninstalled` | POST | App uninstall webhook |
| `webhooks.app.scopes_update.tsx` | `/webhooks/app/scopes-update` | POST | Scope update webhook |
| `auth.login/route.tsx` | `/auth/login` | GET, POST | Login |
| `auth.$/route.tsx` | `/auth/*` | GET | Auth boundary |

### `/api/goals` Detail (Most Complex Route)

**GET** query params:
- `type=executions` (default): List goal executions. Supports `status`, `category`, `limit` (1-100), `offset`
- `type=execution&id=<id>`: Get a single goal execution by ID
- `type=goals`: List goal definitions
- `type=job&jobId=xxx`: Get background job status

**POST** body `{ action: "..." }`:
- `create`: Create a new goal. Body: `{ title, description, category?, priority?, analysisPrompt?, actionPrompt?, requiredServers? }`
- `infer`: AI inference from title+description. Body: `{ title, description }`
- `generate`: Enqueue goal analysis background job
- `execute`: Execute a goal execution. Body: `{ executionId }`
- `dismiss`: Dismiss a goal execution. Body: `{ executionId }`

**PUT**: Update goal. Body: `{ goalId, ...fields }`
**DELETE**: Delete goal. Query param: `goalId`

## Component → API Wiring

| Component | API Endpoint | Actions |
|---|---|---|
| `RecommendationsPanel.tsx` | `GET /api/goals` | Fetch executions list |
| `RecommendationsPanel.tsx` | `POST /api/goals` | `{ action: "generate" }`, `{ action: "execute" }`, `{ action: "dismiss" }` |
| `RecommendationsPanel.tsx` | `GET /api/goals?type=job&jobId=xxx` | Poll job status |
| `TaskList.tsx` | `GET /api/goals` | Fetch executions for landing page |
| `TaskList.tsx` | `POST /api/goals` | `{ action: "generate" }`, `{ action: "execute" }` |
| `TaskList.tsx` | `GET /api/goals?type=job&jobId=xxx` | Poll job status |
| `app.recommendations.$id.tsx` | `GET /api/goals?type=execution&id=xxx` | Fetch single execution |
| `app.recommendations.$id.tsx` | `POST /api/goals` | Execute, dismiss, measure_outcome, feedback |
| `GoalsPanel.tsx` | `GET /api/goals?type=executions` | Fetch executions (full view) |
| `GoalsPanel.tsx` | `POST /api/goals` | Execute/dismiss executions |
| `GoalManagementPanel.tsx` | `GET /api/goals?type=goals` | List goals |
| `GoalManagementPanel.tsx` | `POST /api/goals` | Create goal |
| `GoalManagementPanel.tsx` | `PUT /api/goals` | Update goal |
| `GoalManagementPanel.tsx` | `DELETE /api/goals` | Delete goal |
| `CreateGoalForm.tsx` | `POST /api/goals` | `{ action: "infer" }` |
| `ChatMessage.tsx` / `app.chat.tsx` | `POST /api/chat` | Send chat messages |
| `McpSidebar.tsx` | `GET /api/chat-status` | Server connection status |
| `ServerConfigForm.tsx` | `POST /api/mcp-config` | Save server config |
| `app.settings.$serverType.tsx` | `GET /api/mcp-config` | Load configs |
| `app.settings.$serverType.tsx` | `DELETE /api/mcp-config` | Delete config |

## Database Models (Prisma)

| Model | Key Fields | Notes |
|---|---|---|
| `Session` | id, shop, accessToken | Shopify OAuth |
| `Shop` | shop (unique), name, accessToken | Shop info |
| `McpServerConfig` | shop, serverType, instanceName, configJson (encrypted) | `@@unique([shop, serverType, instanceName])` |
| `Goal` | shop, ruleKey, title, category, analysisPrompt, actionPrompt, requiredServers (JSON string) | `@@unique([shop, ruleKey])` |
| `GoalExecution` | shop, goalId, title, status, actionPrompt, mcpServersUsed (comma-separated) | Status: new/executing/executed/dismissed/error |
| `BackgroundJob` | shop, jobType, status, payload (JSON), result, error | Status: pending/running/completed/failed |

## Key Service Files

| Service | File | Purpose |
|---|---|---|
| Goals | `app/services/goals.server.ts` | Goal CRUD, AI inference, analysis, execution |
| MCP Config | `app/services/mcpConfig.server.ts` | Encrypted config storage |
| MCP Manager | `app/mcp/mcpManager.server.ts` | Tool aggregation, server lifecycle |
| Background Jobs | `app/jobs/scheduler.server.ts`, `worker.server.ts`, `handlers.server.ts` | Job queue |
| Encryption | `app/utils/encryption.server.ts` | AES-256-GCM for credentials |
| Shop | `app/services/shop.server.ts` | Shop info persistence |

## MCP Servers

Built-in (in `app/mcp/servers/`): shopify, google-sheets, google-drive, google-docs, ftp, custom-api
Third-party (npm): postgres, mysql, airtable, email, s3, dropbox

Tools are namespaced as `serverName__toolName` (e.g., `shopify__query`).

## Route Patterns

All API routes follow this pattern:
```typescript
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// GET handler
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  // ...
  return Response.json({ ... });
}

// POST/PUT/DELETE handler
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  // ...
  return Response.json({ ... });
}
```

## Anti-Patterns (DO NOT DO)

1. **Never create `/api/recommendations`** — Use `/api/goals` with the appropriate action
2. **Never create stub/empty endpoints** — If a route doesn't exist, check this registry first. If it's not listed, ASK before creating
3. **Never reference `app/services/recommendations.server.ts`** — It doesn't exist. Use `app/services/goals.server.ts`
4. **Never leave UI actions unwired** — Every button click must call a real API endpoint
5. **Never hardcode Shopify API versions** — Use `SHOPIFY_API_VERSION` env var
6. **Never store credentials unencrypted** — Use encryption.server.ts

## Before Making Changes

1. **Read the files you're modifying** — Don't assume structure
2. **Check this route registry** — Verify the endpoint exists before wiring frontend to it
3. **Check the component wiring table** — See what's already connected
4. **Run tests**: `npm test` (Vitest)
5. **Typecheck**: `npm run typecheck`

## Testing

- Framework: Vitest (`vitest.config.ts`)
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Behavioral tests: `tests/behavioral/`
- Run: `npm test` or `npm run test:watch`
- Test fixtures: `tests/fixtures/`

## Claude Code Commands

| Command | Purpose |
|---|---|
| `/check-wiring` | Verify all UI actions are wired to real API endpoints |

## Claude Code Hooks

- **PreToolUse (Write/Edit)**: Blocks creation of forbidden files (`api.recommendations`, `recommendations.server.ts`)

## Environment Variables

- `ENCRYPTION_KEY` — AES-256 key for credential encryption
- `OPENAI_API_KEY` — OpenAI API key for chat/inference
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` — Shopify app credentials
- `SHOPIFY_API_VERSION` — Shopify API version (default: 2025-10)
- `AGENT_NAME` — Display name for the AI agent
