# Recommendation Engine Integration Guide

This guide shows how to integrate the recommendation engine into your Shopify app.

## Prerequisites

1. ✅ Prisma schema with `RecommendationRule`, `Recommendation`, and `BackgroundJob` models
2. ✅ MCP Manager initialized and working
3. ✅ Vercel AI SDK configured with OpenAI

## Step 1: Initialize Services at App Startup

In your main app entry point (e.g., `app/entry.server.ts` or `app/root.tsx`), initialize the scheduler and worker:

```typescript
import { initScheduler } from "./jobs/scheduler.server";
import { initWorker } from "./jobs/worker.server";

// Initialize background services
if (typeof window === "undefined") {
  // Only run on server
  initScheduler();
  initWorker();
}
```

## Step 2: Seed Initial Recommendation Rules

Create your recommendation rules using the example seed file:

```bash
# Copy the example seed file
cp prisma/seeds/recommendation-rules.example.ts prisma/seeds/recommendation-rules.ts

# Customize the rules for your needs
# Then run the seed:
npx tsx prisma/seeds/recommendation-rules.ts
```

Or create rules directly in your database:

```typescript
await prisma.recommendationRule.create({
  data: {
    ruleKey: "my-custom-rule",
    title: "My Custom Rule",
    descriptionTemplate: "Description",
    category: "performance",
    priority: "high",
    requiredServers: "postgres,shopify",
    analysisPrompt: "Your analysis prompt here...",
    actionPrompt: "Your action prompt here...",
    actionType: "background",
    enabled: true,
    cronIntervalMins: 240,
  },
});
```

## Step 3: Create API Routes

Create API routes for the frontend to interact with recommendations:

### `app/routes/api.recommendations.ts`

```typescript
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { json } from "react-router";
import {
  getRecommendationsForShop,
  dismissRecommendation,
} from "../services/recommendations.server";
import { enqueueRecommendationExecution } from "../jobs/scheduler.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const priority = url.searchParams.get("priority") || undefined;

  const recommendations = await getRecommendationsForShop(session.shop, {
    status,
    category,
    priority,
  });

  return json({ recommendations });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const id = formData.get("id") as string;

  if (action === "dismiss") {
    const recommendation = await dismissRecommendation(id);
    return json({ recommendation });
  }

  if (action === "execute") {
    const job = await enqueueRecommendationExecution(session.shop, id);
    return json({ job });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}
```

## Step 4: Create Frontend Components

### Recommendations List Component

```typescript
import { useLoaderData, useFetcher } from "react-router";
import { Card, Button, Badge, Stack, Text } from "@shopify/polaris";

export default function RecommendationsPage() {
  const { recommendations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Stack vertical>
      {recommendations.map((rec) => (
        <Card key={rec.id}>
          <Stack vertical>
            <Stack distribution="equalSpacing" alignment="center">
              <Text variant="headingMd">{rec.title}</Text>
              <Badge status={getPriorityStatus(rec.priority)}>
                {rec.priority}
              </Badge>
            </Stack>
            
            <Text>{rec.description}</Text>
            
            <Stack distribution="trailing">
              <Button
                onClick={() => {
                  fetcher.submit(
                    { action: "dismiss", id: rec.id },
                    { method: "post" }
                  );
                }}
              >
                Dismiss
              </Button>
              
              {rec.actionType === "background" && (
                <Button
                  primary
                  onClick={() => {
                    fetcher.submit(
                      { action: "execute", id: rec.id },
                      { method: "post" }
                    );
                  }}
                >
                  Execute
                </Button>
              )}
            </Stack>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function getPriorityStatus(priority: string) {
  switch (priority) {
    case "high":
      return "critical";
    case "medium":
      return "warning";
    case "low":
      return "info";
    default:
      return "info";
  }
}
```

## Step 5: Monitor Background Jobs

Create an admin page to monitor background jobs:

```typescript
import { useLoaderData } from "react-router";
import { json } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { DataTable, Card } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const jobs = await prisma.backgroundJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({ jobs });
}

export default function BackgroundJobsPage() {
  const { jobs } = useLoaderData<typeof loader>();

  const rows = jobs.map((job) => [
    job.jobType,
    job.status,
    job.attempts,
    new Date(job.createdAt).toLocaleString(),
    job.completedAt ? new Date(job.completedAt).toLocaleString() : "-",
  ]);

  return (
    <Card>
      <DataTable
        columnContentTypes={["text", "text", "numeric", "text", "text"]}
        headings={["Job Type", "Status", "Attempts", "Created", "Completed"]}
        rows={rows}
      />
    </Card>
  );
}
```

## Step 6: Manual Triggers (Optional)

Create an admin action to manually trigger recommendation analysis:

```typescript
// In your settings or admin page
import { enqueueRecommendationAnalysis } from "../jobs/scheduler.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  const job = await enqueueRecommendationAnalysis(session.shop);
  
  return json({ 
    success: true, 
    message: "Analysis job enqueued",
    jobId: job.id 
  });
}
```

## Step 7: Testing

Test the recommendation engine:

```bash
# Run unit tests
npm test tests/unit/recommendations.test.ts
npm test tests/unit/scheduler.test.ts
npm test tests/unit/handlers.test.ts

# Start your app
npm run dev

# In another terminal, trigger a manual analysis
curl -X POST http://localhost:3000/api/recommendations/analyze \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check the logs for analysis progress
# Check the database for created recommendations
```

## Troubleshooting

### Recommendations not being generated

1. Check that the scheduler is initialized: Look for `[Scheduler] Job scheduler initialized` in logs
2. Check that the worker is running: Look for `[Worker] Starting background job worker` in logs
3. Check that MCP servers are connected: Use `mcpManager.getFullStatus()`
4. Check that rules have `enabled: true`
5. Check that rules' `requiredServers` match your connected servers

### Background jobs stuck in "pending"

1. Check that the worker is polling: Look for `[Worker]` logs
2. Check job `attempts` and `maxAttempts` - may have exceeded retry limit
3. Check job `scheduledAt` - may be scheduled for future
4. Check for errors in the `error` field

### AI not returning proper JSON

1. Check the `analysisPrompt` - ensure it clearly requests JSON format
2. Check AI response in logs - may need to adjust prompt
3. Consider adding JSON schema validation
4. Use structured output mode if available in AI SDK

## Performance Considerations

### Scaling

- The scheduler checks every minute but only enqueues jobs every 4 hours per shop
- The worker polls every 10 seconds and processes up to 10 jobs per poll
- Each job is processed sequentially to avoid overwhelming the AI API

### Optimization

- Adjust `POLL_INTERVAL_MS` in `worker.server.ts` for faster/slower processing
- Adjust `RECOMMENDATION_ANALYSIS_INTERVAL_MS` in `scheduler.server.ts` for more/less frequent analysis
- Use job priorities if you need certain jobs to run first
- Consider using a proper job queue (BullMQ, Celery) for production

## Next Steps

1. Create custom recommendation rules for your specific use case
2. Build a UI for managing rules (CRUD operations)
3. Add analytics to track recommendation effectiveness
4. Implement A/B testing for different recommendation strategies
5. Add webhook triggers for real-time recommendations
6. Integrate with Shopify's notification system

## Support

For questions or issues, refer to:
- `docs/RECOMMENDATION_ENGINE.md` - Architecture documentation
- `docs/TEAMMATE_2_SUMMARY.md` - Implementation details
- `prisma/seeds/recommendation-rules.example.ts` - Example rules
