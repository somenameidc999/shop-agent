# Recommendation Engine

## Overview

The recommendation engine is an AI-powered system that analyzes merchant data from connected MCP servers and generates actionable recommendations. It uses a rule-based approach where each rule defines:

- What data sources are required
- How to analyze the data (analysis prompt)
- What action to take if applicable (action prompt)
- Whether the action runs in the background or requires user interaction

## Architecture

### Components

1. **Prisma Models** (`prisma/schema.prisma`)
   - `RecommendationRule`: Template rules that define recommendation logic
   - `Recommendation`: Generated recommendations for specific shops
   - `BackgroundJob`: Queue for async processing

2. **Services** (`app/services/recommendations.server.ts`)
   - `getRecommendationsForShop()`: Fetch recommendations with filters
   - `generateRecommendations()`: Main analysis loop
   - `executeRecommendation()`: Execute background actions
   - `dismissRecommendation()`: Mark recommendations as dismissed

3. **Job System**
   - `scheduler.server.ts`: Periodic job enqueuing (every 4 hours per shop)
   - `handlers.server.ts`: Job type handlers
   - `worker.server.ts`: Job processor that polls and executes jobs

### Data Flow

```
┌─────────────────┐
│  Scheduler      │  Every 4 hours
│  (setInterval)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  BackgroundJob (recommendation_     │
│  analysis) created for each shop    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Worker polls pending jobs          │
│  Calls handleRecommendationAnalysis │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  generateRecommendations(shop)      │
│  1. Get connected MCP servers       │
│  2. Load enabled RecommendationRules│
│  3. Filter by requiredServers       │
│  4. For each rule:                  │
│     - Call AI with analysisPrompt   │
│     - AI uses MCP tools to analyze  │
│     - AI returns verdict JSON       │
│     - If applicable, create/update  │
│       Recommendation row            │
└─────────────────────────────────────┘
```

## Recommendation Rules

Rules are stored in the `RecommendationRule` table and define:

```typescript
{
  ruleKey: "unique-identifier",
  title: "Rule title",
  descriptionTemplate: "Description template",
  category: "performance|inventory|marketing|...",
  priority: "high|medium|low",
  requiredServers: "postgres,shopify",  // Comma-separated
  analysisPrompt: "AI prompt to analyze data",
  actionPrompt: "AI prompt to execute action",
  actionType: "background|manual",
  enabled: true,
  cronIntervalMins: 240  // How often to check
}
```

### Analysis Prompt

The `analysisPrompt` is sent to the AI with access to MCP tools. The AI must return JSON:

```json
{
  "applicable": true,
  "title": "Optimize slow queries",
  "description": "Found 3 queries taking >2s. Optimize them to improve performance.",
  "metadata": {
    "slowQueries": ["query1", "query2", "query3"],
    "avgResponseTime": "2.5s"
  }
}
```

### Action Prompt

If `actionType` is "background", the `actionPrompt` is executed automatically when the merchant clicks "Execute". The AI uses MCP tools to perform the action and returns a summary.

If `actionType` is "manual", the recommendation is displayed but requires manual merchant action.

## AI Integration

The system uses the Vercel AI SDK with OpenAI's GPT-4o-mini model:

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const response = await generateText({
  model: openai("gpt-4o-mini"),
  system: "System prompt...",
  prompt: "Analysis prompt...",
  tools: await mcpManager.getToolsForAI(),
});
```

Tools are namespaced as `serverName__toolName` (e.g., `postgres__query`, `shopify__get_products`).

## Job Processing

### Scheduler

The scheduler runs on a timer and enqueues jobs for shops that haven't been analyzed recently:

```typescript
initScheduler();  // Call once at app startup
```

### Worker

The worker polls for pending jobs and processes them:

```typescript
initWorker();  // Call once at app startup
```

### Manual Triggers

You can manually enqueue jobs:

```typescript
// Trigger analysis for a specific shop
await enqueueRecommendationAnalysis("myshop.myshopify.com");

// Execute a specific recommendation
await enqueueRecommendationExecution(
  "myshop.myshopify.com",
  "recommendation-id"
);
```

## Example Rule

Here's an example rule that checks for slow database queries:

```typescript
{
  ruleKey: "slow-queries-detected",
  title: "Slow Database Queries",
  descriptionTemplate: "Performance optimization opportunity",
  category: "performance",
  priority: "high",
  requiredServers: "postgres",
  analysisPrompt: `
    Check the database for queries that take longer than 2 seconds.
    Use the postgres__query tool to analyze query performance.
    
    Return JSON with:
    - applicable: true if you find slow queries
    - title: A clear title like "3 slow queries detected"
    - description: Explain which queries are slow and their impact
    - metadata: Include query details, execution times, etc.
  `,
  actionPrompt: `
    Add indexes to optimize the slow queries identified in the metadata.
    Use postgres__query to create the indexes.
    
    Return a summary of what indexes you created and the expected performance improvement.
  `,
  actionType: "background",
  enabled: true,
  cronIntervalMins: 240
}
```

## Status Flow

Recommendations follow this status lifecycle:

1. **new**: Just created, not yet seen by merchant
2. **executing**: Background action is running
3. **executed**: Background action completed successfully
4. **dismissed**: Merchant dismissed the recommendation
5. **error**: Background action failed

## Testing

Unit tests are provided for all components:

```bash
npm test tests/unit/recommendations.test.ts
npm test tests/unit/scheduler.test.ts
npm test tests/unit/handlers.test.ts
```

## Future Enhancements

- Add webhook support to trigger analysis on specific events
- Implement recommendation expiration (using `expiresAt` field)
- Add recommendation history/audit log
- Support for recommendation dependencies (one recommendation requires another)
- A/B testing for recommendation effectiveness
- Machine learning to improve rule matching over time
