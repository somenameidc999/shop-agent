# Recommendations API Documentation

## Overview

The Recommendations API provides endpoints for managing AI-powered recommendations for Shopify merchants. This includes listing, generating, executing, and dismissing recommendations, as well as polling job status for background tasks.

## Endpoints

### 1. List Recommendations

**Endpoint:** `GET /api/recommendations`

**Description:** Fetches recommendations for the authenticated shop with optional filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by status (`new`, `executed`, `dismissed`, `error`)
- `category` (optional): Filter by category
- `limit` (optional): Number of results to return (1-100, default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Response:**
```json
{
  "recommendations": [
    {
      "id": "rec_123",
      "shop": "example.myshopify.com",
      "ruleKey": "low_inventory_alert",
      "title": "Low inventory detected on 5 products",
      "description": "Several products are running low on stock...",
      "category": "inventory",
      "priority": "high",
      "status": "new",
      "actionType": "chat_handoff",
      "actionPrompt": "Help me reorder inventory for these products...",
      "mcpServersUsed": "shopify,google-sheets",
      "metadata": "{\"products\": [...]}",
      "createdAt": "2026-02-27T10:00:00Z",
      "updatedAt": "2026-02-27T10:00:00Z"
    }
  ],
  "total": 1
}
```

**Example:**
```bash
GET /api/recommendations?status=new&category=inventory&limit=20&offset=0
```

---

### 2. Generate Recommendations

**Endpoint:** `POST /api/recommendations`

**Description:** Enqueues a background job to analyze shop data and generate new recommendations.

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
  "jobId": "job_abc123",
  "status": "queued",
  "message": "Recommendation analysis job enqueued"
}
```

**Usage:**
1. Call this endpoint to trigger recommendation generation
2. Use the returned `jobId` to poll job status via `/api/jobs?jobId=xxx`
3. When job completes, fetch updated recommendations via `GET /api/recommendations`

---

### 3. Execute Recommendation

**Endpoint:** `POST /api/recommendations`

**Description:** Executes a recommendation. Behavior depends on the recommendation's `actionType`:
- `chat_handoff`: Returns a prompt for the UI to inject into the chat
- `background`: Enqueues a background job to execute the action

**Request Body:**
```json
{
  "action": "execute",
  "recommendationId": "rec_123"
}
```

**Response (chat_handoff):**
```json
{
  "handoff": true,
  "prompt": "Help me reorder inventory for these products...",
  "recommendation": {
    "id": "rec_123",
    "title": "Low inventory detected on 5 products",
    "description": "Several products are running low on stock..."
  }
}
```

**Response (background):**
```json
{
  "success": true,
  "jobId": "job_xyz789",
  "status": "queued",
  "message": "Recommendation execution job enqueued"
}
```

**Usage:**
- For `chat_handoff` responses: Inject the `prompt` into the chat interface
- For `background` responses: Poll job status via `/api/jobs?jobId=xxx`

---

### 4. Dismiss Recommendation

**Endpoint:** `POST /api/recommendations`

**Description:** Marks a recommendation as dismissed, removing it from the active list.

**Request Body:**
```json
{
  "action": "dismiss",
  "recommendationId": "rec_123"
}
```

**Response:**
```json
{
  "success": true,
  "recommendation": {
    "id": "rec_123",
    "status": "dismissed",
    "updatedAt": "2026-02-27T12:00:00Z"
  },
  "message": "Recommendation dismissed"
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
const generateResponse = await fetch('/api/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'generate' })
});

const { jobId } = await generateResponse.json();

// 2. Poll job status
const pollInterval = setInterval(async () => {
  const statusResponse = await fetch(`/api/jobs?jobId=${jobId}`);
  const { status, result, error } = await statusResponse.json();
  
  if (status === 'completed') {
    clearInterval(pollInterval);
    console.log('Analysis complete:', result);
    
    // 3. Fetch updated recommendations
    const recsResponse = await fetch('/api/recommendations?status=new');
    const { recommendations } = await recsResponse.json();
    console.log('New recommendations:', recommendations);
  } else if (status === 'failed') {
    clearInterval(pollInterval);
    console.error('Analysis failed:', error);
  }
}, 2000); // Poll every 2 seconds
```

### Frontend: Execute Recommendation

```typescript
// Execute a recommendation
const executeResponse = await fetch('/api/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute',
    recommendationId: 'rec_123'
  })
});

const result = await executeResponse.json();

if (result.handoff) {
  // Chat handoff - inject prompt into chat
  injectMessageIntoChat(result.prompt);
} else if (result.jobId) {
  // Background job - poll status
  pollJobStatus(result.jobId);
}
```

### Frontend: Dismiss Recommendation

```typescript
const dismissResponse = await fetch('/api/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'dismiss',
    recommendationId: 'rec_123'
  })
});

const { success } = await dismissResponse.json();
if (success) {
  // Remove from UI
  removeRecommendationFromList('rec_123');
}
```

---

## Related Files

- **Service Layer:** `app/services/recommendations.server.ts`
- **Job Scheduler:** `app/jobs/scheduler.server.ts`
- **Database Models:** `prisma/schema.prisma`
- **API Routes:** 
  - `app/routes/api.recommendations.ts`
  - `app/routes/api.jobs.ts`
