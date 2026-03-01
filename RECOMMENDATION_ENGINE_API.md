# Recommendation Engine API Reference

## Database Models

### RecommendationRule
Template for generating recommendations.

```typescript
interface RecommendationRule {
  id: string;
  ruleKey: string; // unique identifier
  title: string;
  descriptionTemplate: string;
  category: "inventory" | "customer" | "reporting" | "sync" | "marketing";
  priority: "low" | "medium" | "high" | "critical";
  requiredServers: string; // JSON array: ["shopify", "email"]
  analysisPrompt: string; // AI prompt to check if rule applies
  actionPrompt: string; // AI prompt to execute action
  actionType: "background" | "chat_handoff";
  enabled: boolean;
  cronIntervalMins: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Recommendation
Individual recommendation instance for a shop.

```typescript
interface Recommendation {
  id: string;
  shop: string; // e.g., "example.myshopify.com"
  ruleKey: string; // references RecommendationRule.ruleKey
  title: string;
  description: string;
  category: string;
  priority: string;
  status: "new" | "in_progress" | "completed" | "dismissed" | "failed";
  actionType: string;
  actionPrompt: string;
  mcpServersUsed: string; // JSON array of servers used
  metadata?: string; // JSON object with additional data
  resultSummary?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  executedAt?: Date;
}
```

### BackgroundJob
Asynchronous job queue.

```typescript
interface BackgroundJob {
  id: string;
  shop: string;
  jobType: "recommendation_analysis" | "recommendation_execute" | string;
  status: "pending" | "running" | "completed" | "failed";
  payload: string; // JSON object
  result?: string; // JSON object
  error?: string;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}
```

## Common Queries

### Get Active Recommendations for a Shop

```typescript
const recommendations = await prisma.recommendation.findMany({
  where: {
    shop: "example.myshopify.com",
    status: { in: ["new", "in_progress"] },
  },
  orderBy: [
    { priority: "desc" }, // critical, high, medium, low
    { createdAt: "desc" },
  ],
});
```

### Get Recommendations by Category

```typescript
const inventoryRecs = await prisma.recommendation.findMany({
  where: {
    shop: "example.myshopify.com",
    category: "inventory",
    status: "new",
  },
});
```

### Get All Enabled Rules

```typescript
const rules = await prisma.recommendationRule.findMany({
  where: { enabled: true },
  orderBy: { title: "asc" },
});
```

### Get Rules for Specific MCP Servers

```typescript
const rules = await prisma.recommendationRule.findMany({
  where: { enabled: true },
});

// Filter in application code
const shopifyRules = rules.filter(rule => {
  const servers = JSON.parse(rule.requiredServers);
  return servers.includes("shopify");
});
```

### Create a Background Job

```typescript
await prisma.backgroundJob.create({
  data: {
    shop: "example.myshopify.com",
    jobType: "recommendation_analysis",
    payload: JSON.stringify({
      ruleKeys: ["shopify_sheets_sales_tracking"],
      options: { force: true },
    }),
  },
});
```

### Update Recommendation Status

```typescript
await prisma.recommendation.update({
  where: { id: recommendationId },
  data: {
    status: "in_progress",
    executedAt: new Date(),
  },
});
```

### Complete a Recommendation

```typescript
await prisma.recommendation.update({
  where: { id: recommendationId },
  data: {
    status: "completed",
    resultSummary: "Successfully synced 150 products to Google Sheets",
    executedAt: new Date(),
  },
});
```

### Dismiss a Recommendation

```typescript
await prisma.recommendation.update({
  where: { id: recommendationId },
  data: {
    status: "dismissed",
  },
});
```

## Background Worker Usage

### Initialize Worker (App Startup)

```typescript
import { initWorker } from "./app/jobs/worker.server";

// In your app initialization (e.g., entry.server.tsx or app.tsx)
if (process.env.NODE_ENV === "production" || process.env.ENABLE_WORKER === "true") {
  initWorker();
}
```

### Register Custom Job Handler

```typescript
import { registerJobHandler } from "./app/jobs/worker.server";

registerJobHandler("custom_job_type", async (job) => {
  const { customParam } = job.payload;
  
  // Your custom logic here
  
  return {
    success: true,
    processedItems: 42,
  };
});
```

### Stop Worker (Graceful Shutdown)

```typescript
import { stopWorker } from "./app/jobs/worker.server";

process.on("SIGTERM", () => {
  stopWorker();
  process.exit(0);
});
```

## Priority Sorting

Recommendations should be sorted by priority in this order:

1. **critical** - Requires immediate attention (e.g., unanswered customer emails)
2. **high** - Important but not urgent (e.g., inventory sync, backups)
3. **medium** - Regular operational tasks (e.g., sales tracking)
4. **low** - Nice to have (e.g., asset organization)

```typescript
const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };

recommendations.sort((a, b) => {
  return priorityOrder[b.priority] - priorityOrder[a.priority];
});
```

## Status Lifecycle

```
new → in_progress → completed
  ↓
dismissed
  ↓
failed
```

- **new**: Just created, awaiting action
- **in_progress**: Currently being executed
- **completed**: Successfully executed
- **dismissed**: User chose not to execute
- **failed**: Execution failed after retries

## Job Processing Flow

1. Job created with status "pending"
2. Worker polls every 10 seconds
3. Job claimed (status → "running")
4. Handler processes job
5. On success: status → "completed", result stored
6. On failure: 
   - If attempts < maxAttempts: status → "pending", retry in 1 minute
   - If attempts >= maxAttempts: status → "failed", error stored

## Example: Full Recommendation Flow

```typescript
// 1. Create analysis job
const job = await prisma.backgroundJob.create({
  data: {
    shop: "example.myshopify.com",
    jobType: "recommendation_analysis",
    payload: JSON.stringify({ scanAll: true }),
  },
});

// 2. Worker processes job (automatic)
// - Checks which MCP servers are connected
// - Evaluates each enabled rule
// - Creates Recommendation records for matching rules

// 3. Frontend fetches recommendations
const recs = await prisma.recommendation.findMany({
  where: { shop: "example.myshopify.com", status: "new" },
});

// 4. User clicks "Execute" on a recommendation
await prisma.recommendation.update({
  where: { id: recId },
  data: { status: "in_progress" },
});

// 5. Create execution job
await prisma.backgroundJob.create({
  data: {
    shop: "example.myshopify.com",
    jobType: "recommendation_execute",
    payload: JSON.stringify({ recommendationId: recId }),
  },
});

// 6. Worker executes action (automatic)
// - Uses actionPrompt with AI/MCP tools
// - Updates recommendation with result

// 7. Frontend shows completion
const completed = await prisma.recommendation.findUnique({
  where: { id: recId },
});
console.log(completed.resultSummary);
```

## Available Recommendation Rules

See `prisma/seed-recommendations.ts` for the full list of 21 rules covering:

- Shopify + SFTP (inventory, images)
- Shopify + Google Sheets (sales, audits)
- Shopify + Email (marketing, support)
- Shopify + PostgreSQL/MySQL (analytics, segments)
- Shopify + Airtable (returns, roadmap)
- Shopify + Google Docs/Drive (reports, backups)
- Shopify + Custom API (sync, monitoring)
- Cross-MCP combinations (email + sheets, ftp + shopify, db + email)

## Testing

### Run Seed Script

```bash
npx tsx prisma/seed-recommendations.ts
```

### Test Worker

```bash
npx tsx -e "
import { initWorker, stopWorker } from './app/jobs/worker.server';
initWorker();
setTimeout(() => stopWorker(), 5000);
"
```

### Create Test Job

```bash
npx tsx -e "
import prisma from './app/db.server';
await prisma.backgroundJob.create({
  data: {
    shop: 'test.myshopify.com',
    jobType: 'recommendation_analysis',
    payload: JSON.stringify({ test: true }),
  },
});
"
```

## Environment Variables

No additional environment variables required. Worker uses existing database connection from Prisma.

## Performance Notes

- Worker processes up to 10 jobs per poll (10-second interval)
- Indexes optimize queries by [shop, status] and [shop, ruleKey]
- Job claiming uses atomic updates to prevent race conditions
- Failed jobs retry with exponential backoff (1 minute delay)

## Error Handling

All errors are caught and logged. Failed jobs store error messages in the `error` field:

```typescript
const failedJobs = await prisma.backgroundJob.findMany({
  where: { status: "failed" },
  orderBy: { completedAt: "desc" },
});

failedJobs.forEach(job => {
  console.error(`Job ${job.id} failed:`, job.error);
});
```
