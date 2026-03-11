# Recommendations API Documentation

> **IMPORTANT:** The UI calls these "recommendations" but the API and database use "goals" and "goal executions".
> The API endpoint is `/api/goals` — there is NO `/api/recommendations` endpoint.
> The service file is `app/services/goals.server.ts` — there is NO `recommendations.server.ts`.
> The route file is `app/routes/api.goals.ts` — there is NO `api.recommendations.ts`.

## Overview

The Goals API provides endpoints for managing AI-powered recommendations (goal executions) for Shopify merchants. This includes listing, generating, executing, and dismissing recommendations, as well as polling job status for background tasks.

## Endpoints

### 1. List Recommendations (Goal Executions)

**Endpoint:** `GET /api/goals`

**Description:** Fetches goal executions (recommendations) for the authenticated shop with optional filtering and pagination.

**Query Parameters:**
- `type` (optional): `executions` (default), `goals`, or `job`
- `status` (optional): Filter by status (`new`, `executed`, `dismissed`, `error`)
- `category` (optional): Filter by category
- `limit` (optional): Number of results to return (1-100, default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Response:**
```json
{
  "executions": [
    {
      "id": "cuid_123",
      "shop": "example.myshopify.com",
      "goalId": "cuid_456",
      "title": "Low inventory detected on 5 products",
      "description": "Several products are running low on stock...",
      "category": "inventory",
      "priority": "high",
      "status": "pending",
      "actionPrompt": "Help me reorder inventory for these products...",
      "mcpServersUsed": ["shopify", "google-sheets"],
      "metadata": "{\"products\": [...]}",
      "createdAt": "2026-02-27T10:00:00Z",
      "updatedAt": "2026-02-27T10:00:00Z"
    }
  ],
  "total": 1
}
```

Note: Status values are normalized in the response: `new` → `pending`, `executed` → `completed`, `executing` → `in_progress`, `error` → `failed`.

**Example:**
```bash
GET /api/goals?status=new&category=inventory&limit=20&offset=0
```

---

### 2. Generate Recommendations

**Endpoint:** `POST /api/goals`

**Description:** Enqueues a background job to analyze shop data and generate new goal executions (recommendations).

**Request Body:**
```json
{
  "action": "generate"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "cuid_abc123",
  "status": "queued",
  "message": "Goal analysis job enqueued"
}
```

**Usage:**
1. Call this endpoint to trigger recommendation generation
2. Use the returned `jobId` to poll job status via `GET /api/goals?type=job&jobId=xxx`
3. When job completes, fetch updated recommendations via `GET /api/goals`

---

### 3. Execute Recommendation

**Endpoint:** `POST /api/goals`

**Description:** Executes a goal execution (recommendation) by enqueuing a background job.

**Request Body:**
```json
{
  "action": "execute",
  "executionId": "cuid_123"
}
```

Note: The field is `executionId`, NOT `recommendationId`.

**Response:**
```json
{
  "success": true,
  "jobId": "cuid_xyz789",
  "status": "queued",
  "message": "Goal execution job enqueued"
}
```

**Usage:**
- Poll job status via `GET /api/goals?type=job&jobId=xxx`

---

### 4. Dismiss Recommendation

**Endpoint:** `POST /api/goals`

**Description:** Marks a goal execution (recommendation) as dismissed.

**Request Body:**
```json
{
  "action": "dismiss",
  "executionId": "cuid_123"
}
```

Note: The field is `executionId`, NOT `recommendationId`.

**Response:**
```json
{
  "success": true,
  "execution": {
    "id": "cuid_123",
    "status": "dismissed",
    "updatedAt": "2026-02-27T12:00:00Z"
  },
  "message": "Goal execution dismissed"
}
```

---

### 5. Get Job Status

**Endpoint:** `GET /api/jobs`

**Description:** Polls the status of a background job.

**Query Parameters:**
- `jobId` (required): The job ID to check

**Response:**
```json
{
  "status": "completed",
  "jobId": "job_abc123",
  "jobType": "recommendation_analysis",
  "result": "Generated 3 new recommendations",
  "attempts": 1,
  "maxAttempts": 3,
  "startedAt": "2026-02-27T10:00:00Z",
  "completedAt": "2026-02-27T10:05:00Z"
}
```

**Status Values:**
- `pending`: Job is queued but not yet started
- `running`: Job is currently executing
- `completed`: Job finished successfully
- `failed`: Job failed (check `error` field for details)

**Example:**
```bash
GET /api/jobs?jobId=job_abc123
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "details": "Optional detailed error information"
}
```

**Common Status Codes:**
- `400`: Bad request (missing or invalid parameters)
- `403`: Forbidden (resource doesn't belong to authenticated shop)
- `404`: Not found (recommendation or job not found)
- `500`: Internal server error

---

## Authentication

All endpoints require Shopify Admin authentication via `authenticate.admin(request)`. The authenticated shop context is automatically used for all operations.

---

## Integration Example

### Frontend: Generate and Poll Recommendations

```typescript
// 1. Trigger recommendation generation
const generateResponse = await fetch('/api/goals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'generate' })
});

const { jobId } = await generateResponse.json();

// 2. Poll job status via /api/goals?type=job
const pollInterval = setInterval(async () => {
  const statusResponse = await fetch(`/api/goals?type=job&jobId=${jobId}`);
  const { status, error } = await statusResponse.json();

  if (status === 'completed') {
    clearInterval(pollInterval);

    // 3. Fetch updated recommendations (goal executions)
    const recsResponse = await fetch('/api/goals');
    const { executions } = await recsResponse.json();
  } else if (status === 'failed') {
    clearInterval(pollInterval);
    console.error('Analysis failed:', error);
  }
}, 3000); // Poll every 3 seconds
```

### Frontend: Execute Recommendation

```typescript
const executeResponse = await fetch('/api/goals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute',
    executionId: 'cuid_123'  // NOT recommendationId
  })
});

const result = await executeResponse.json();
if (result.jobId) {
  // Background job - poll status
  pollJobStatus(result.jobId);
}
```

### Frontend: Dismiss Recommendation

```typescript
const dismissResponse = await fetch('/api/goals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'dismiss',
    executionId: 'cuid_123'  // NOT recommendationId
  })
});

const { success } = await dismissResponse.json();
if (success) {
  removeRecommendationFromList('cuid_123');
}
```

---

## Related Files

- **Service Layer:** `app/services/goals.server.ts`
- **Job Scheduler:** `app/jobs/scheduler.server.ts`
- **Database Models:** `prisma/schema.prisma` (models: `Goal`, `GoalExecution`, `BackgroundJob`)
- **API Route:** `app/routes/api.goals.ts` (handles all goal/execution/job operations)
- **Job Status:** Also queryable via `app/routes/api.jobs.ts` or `GET /api/goals?type=job&jobId=xxx`
