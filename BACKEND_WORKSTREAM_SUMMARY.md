# Backend/Data Workstream Implementation Summary

## Completed Tasks

### 1. Prisma Schema Models ✅

Added three new models to `prisma/schema.prisma`:

#### RecommendationRule
Stores rule templates for generating recommendations.
- **Fields**: id, ruleKey (unique), title, descriptionTemplate, category, priority, requiredServers (JSON), analysisPrompt, actionPrompt, actionType, enabled, cronIntervalMins, timestamps
- **Purpose**: Define reusable recommendation logic that can be evaluated against shop data

#### Recommendation
Stores generated recommendations for shops.
- **Fields**: id, shop, ruleKey, title, description, category, priority, status, actionType, actionPrompt, mcpServersUsed (JSON), metadata (JSON), resultSummary, timestamps, expiresAt, executedAt
- **Indexes**: [shop, status], [shop, ruleKey]
- **Purpose**: Track individual recommendation instances and their lifecycle

#### BackgroundJob
Job queue for asynchronous processing.
- **Fields**: id, shop, jobType, status, payload (JSON), result (JSON), error, attempts, maxAttempts, scheduledAt, startedAt, completedAt, createdAt
- **Indexes**: [status, scheduledAt], [shop, jobType]
- **Purpose**: Queue and track background tasks with retry logic

**Migration**: `20260228031038_add_recommendation_models` applied successfully

### 2. Background Job Worker ✅

Created `app/jobs/worker.server.ts` with the following features:

#### Core Functionality
- **Polling Mechanism**: Polls BackgroundJob table every 10 seconds for pending jobs
- **Job Claiming**: Atomically claims jobs by updating status to "running"
- **Job Routing**: Routes jobs to handlers based on jobType
- **Status Management**: Updates status, result, and error fields on completion
- **Retry Logic**: Retries failed jobs up to maxAttempts (default: 3)
- **Exponential Backoff**: Failed jobs are rescheduled 1 minute later

#### API
- `initWorker()`: Starts the polling loop (singleton pattern, safe to call multiple times)
- `stopWorker()`: Stops the worker gracefully
- `registerJobHandler(jobType, handler)`: Register custom job handlers

#### Built-in Handlers
- `recommendation_analysis`: Analyzes shop data and generates recommendations
- `recommendation_execute`: Executes recommendation actions

#### Error Handling
- Catches and logs all errors
- Updates job status to "failed" after max attempts
- Reschedules jobs for retry with attempt counter

### 3. Recommendation Rules Seed Data ✅

Created `prisma/seed-recommendations.ts` with **21 comprehensive recommendation rules**:

#### Shopify + SFTP (2 rules)
1. **shopify_sftp_inventory_sync**: Sync inventory files to SFTP for warehouse integration
2. **shopify_sftp_product_images**: Backup product images to SFTP storage

#### Shopify + Google Sheets (2 rules)
3. **shopify_sheets_sales_tracking**: Export recent orders to Google Sheets
4. **shopify_sheets_price_audit**: Compare Shopify prices with reference prices

#### Shopify + Email (3 rules)
5. **shopify_email_repeat_customers**: Thank customers with 3+ orders
6. **shopify_email_unanswered**: Follow up on unanswered customer emails (critical priority)
7. **shopify_email_order_followup**: Post-delivery feedback requests

#### Shopify + PostgreSQL/MySQL (3 rules)
8. **shopify_postgres_analytics_sync**: Sync orders to analytics database
9. **shopify_mysql_inventory_discrepancy**: Detect inventory discrepancies (critical priority)
10. **shopify_postgres_customer_segments**: Update customer segmentation

#### Shopify + Airtable (2 rules)
11. **shopify_airtable_returns_tracking**: Log returns in Airtable
12. **shopify_airtable_product_roadmap**: Sync product performance to roadmap

#### Shopify + Google Docs (2 rules)
13. **shopify_gdocs_monthly_report**: Generate monthly sales report
14. **shopify_gdocs_sop_updates**: Review and update SOPs

#### Shopify + Google Drive (2 rules)
15. **shopify_gdrive_data_backup**: Backup critical data to Google Drive
16. **shopify_gdrive_asset_organization**: Organize product assets

#### Shopify + Custom API (2 rules)
17. **shopify_customapi_external_sync**: Push product updates to external platform
18. **customapi_health_check**: Monitor Custom API health

#### Cross-MCP Combinations (3 rules)
19. **email_sheets_inquiry_tracking**: Track customer inquiries in Google Sheets
20. **ftp_shopify_inventory_import**: Import inventory updates from SFTP
21. **postgres_email_abandoned_cart_reminder**: Send abandoned cart reminders

#### Rule Categories
- **inventory**: 5 rules (inventory sync, discrepancies, imports)
- **customer**: 5 rules (repeat customers, inquiries, segments)
- **reporting**: 4 rules (sales tracking, audits, reports)
- **sync**: 5 rules (backups, external platforms, data sync)
- **marketing**: 2 rules (abandoned carts, feedback)

#### Priority Distribution
- **Critical**: 2 rules (unanswered emails, inventory discrepancy)
- **High**: 6 rules (inventory sync, analytics, backups)
- **Medium**: 10 rules (most operational tasks)
- **Low**: 3 rules (asset organization, SOPs, roadmap)

#### Action Types
- **background**: 15 rules (automated execution)
- **chat_handoff**: 6 rules (require human review/approval)

## Testing

### Migration Test ✅
```bash
npx prisma migrate dev --name add_recommendation_models
```
- Created migration successfully
- All tables and indexes created
- Prisma Client regenerated

### Seed Test ✅
```bash
npx tsx prisma/seed-recommendations.ts
```
- Seeded 21 recommendation rules
- All rules inserted successfully
- Idempotent (can be run multiple times)

### Worker Test ✅
- Worker initialization: ✅
- Job polling: ✅
- Job claiming: ✅
- Job processing: ✅
- Status updates: ✅
- Singleton pattern: ✅

## Integration Points

### For Frontend Team
- Query `RecommendationRule` table to display available rules
- Query `Recommendation` table filtered by shop and status
- Display recommendations with priority-based sorting
- Provide actions to execute or dismiss recommendations

### For AI/LLM Team
- Use `analysisPrompt` from rules to evaluate shop data
- Generate `Recommendation` records when rules match
- Use `actionPrompt` for executing recommendations
- Store results in `resultSummary` field

### For API Team
- Expose endpoints to fetch recommendations by shop
- Provide webhook/callback for job completion
- Support recommendation execution via API
- Track recommendation lifecycle (new → in_progress → completed)

## Files Created/Modified

### Created
- `app/jobs/worker.server.ts` - Background job worker
- `prisma/seed-recommendations.ts` - Recommendation rules seed data
- `prisma/migrations/20260228031038_add_recommendation_models/` - Database migration

### Modified
- `prisma/schema.prisma` - Added 3 new models

## Next Steps (For Other Teams)

1. **Frontend**: Build UI to display and interact with recommendations
2. **AI/LLM**: Implement recommendation analysis logic using MCP tools
3. **API**: Create REST endpoints for recommendation CRUD operations
4. **Integration**: Wire up worker to run on app startup
5. **Monitoring**: Add logging and metrics for job processing

## Usage Example

```typescript
// Create a background job
await prisma.backgroundJob.create({
  data: {
    shop: 'example.myshopify.com',
    jobType: 'recommendation_analysis',
    payload: JSON.stringify({ ruleKeys: ['shopify_sheets_sales_tracking'] }),
  },
});

// Start the worker (in app initialization)
import { initWorker } from './app/jobs/worker.server';
initWorker();

// Query recommendations for a shop
const recommendations = await prisma.recommendation.findMany({
  where: {
    shop: 'example.myshopify.com',
    status: 'new',
  },
  orderBy: [
    { priority: 'desc' },
    { createdAt: 'desc' },
  ],
});
```

## Database Schema Diagram

```
RecommendationRule (template)
  ↓ (generates)
Recommendation (instance for shop)
  ↓ (triggers)
BackgroundJob (async execution)
```

## Performance Considerations

- Worker polls every 10 seconds (configurable)
- Processes up to 10 jobs per poll
- Atomic job claiming prevents race conditions
- Failed jobs retry with 1-minute delay
- Indexes optimize queries by shop and status

---

**Status**: ✅ All tasks completed successfully
**Team**: Backend/Data Workstream (Teammate 1)
**Date**: 2026-02-28
