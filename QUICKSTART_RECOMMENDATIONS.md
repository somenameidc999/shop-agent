# Quick Start Guide - Recommendation Engine

## 🚀 Getting Started

The recommendation engine is now fully integrated into your Shopify Sidekick app. Follow these steps to see it in action:

### 1. Restart Your Dev Server

The worker and scheduler are initialized on app startup, so restart your dev server:

```bash
npm run dev
```

### 2. Verify Recommendation Rules Are Seeded

The seed script has already been run (21 rules created). To verify:

```bash
npx prisma studio
```

Navigate to the `RecommendationRule` table and confirm you see 21 rules.

### 3. Connect MCP Data Sources

Go to the **Settings** page in your app and connect at least 2 MCP data sources. For example:
- Shopify (already connected automatically)
- Google Sheets (requires service account JSON)
- SFTP (requires host, username, password)
- Email (requires IMAP/SMTP credentials)

The more data sources you connect, the more recommendations you'll see!

### 4. Trigger Recommendation Analysis

The scheduler runs automatically every 4 hours, but you can manually trigger it:

**Option A: Via API**
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"action": "generate"}'
```

**Option B: Via the UI**
Click the "Refresh" button in the RecommendationsPanel (on the chat page).

### 5. View Recommendations

Go to the **Chat** page. You should see:
- **Empty state**: Recommendation cards appear between the greeting and the input box
- **Active chat**: A collapsible recommendations bar above the messages

### 6. Execute a Recommendation

Click the **Execute** button on any recommendation card:

- **Chat handoff** recommendations inject a prompt into the chat and let the AI handle it conversationally
- **Background** recommendations run silently via the job queue and show a status indicator

### 7. Monitor Job Status

If you executed a background recommendation, you can poll its status:

```bash
curl "http://localhost:3000/api/jobs?jobId=YOUR_JOB_ID"
```

Or just watch the UI - it auto-polls every 3 seconds and updates the card status.

---

## 📊 Understanding the System

### Recommendation Categories

Recommendations are organized into 5 categories:

1. **Inventory** (purple) - Stock management, product updates
2. **Customer** (blue) - Customer engagement, support
3. **Reporting** (green) - Analytics, reports, insights
4. **Sync** (orange) - Data synchronization across systems
5. **Marketing** (pink) - Campaigns, promotions, outreach

### Recommendation Priorities

- **Low** - Nice to have, no urgency
- **Medium** - Should be addressed soon (default)
- **High** - Important, affects business operations
- **Critical** - Urgent, requires immediate attention

### Action Types

- **Background** - Runs silently via job queue, shows progress indicator
- **Chat handoff** - Injects prompt into chat for conversational execution

---

## 🔧 Customization

### Adjust Scheduler Interval

Edit `app/jobs/scheduler.server.ts`:

```typescript
const ANALYSIS_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours (default)
```

Change to run more/less frequently (e.g., `1 * 60 * 60 * 1000` for 1 hour).

### Create Custom Rules

Add new rules to `prisma/seed-recommendations.ts`:

```typescript
{
  ruleKey: "my_custom_rule",
  title: "Custom Recommendation",
  descriptionTemplate: "Description here",
  category: "inventory",
  priority: "medium",
  requiredServers: JSON.stringify(["shopify", "google"]),
  analysisPrompt: "Check if X condition is true using Y tool...",
  actionPrompt: "Do Z to fix the issue...",
  actionType: "background",
  enabled: true,
  cronIntervalMins: 240,
}
```

Then re-run the seed script:

```bash
npx tsx prisma/seed-recommendations.ts
```

### Disable Specific Rules

In Prisma Studio, find the rule and set `enabled = false`.

---

## 🐛 Troubleshooting

### No Recommendations Appearing

**Check 1**: Are MCP servers connected?
```bash
curl http://localhost:3000/api/chat-status
```

**Check 2**: Has the analysis job run?
```bash
# Check BackgroundJob table in Prisma Studio
npx prisma studio
```

**Check 3**: Are rules enabled?
```bash
# Check RecommendationRule table - enabled should be true
npx prisma studio
```

**Check 4**: Manually trigger analysis
```bash
curl -X POST http://localhost:3000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"action": "generate"}'
```

### Worker Not Running

Check the server logs for:
```
✓ Background job worker initialized
✓ Recommendation scheduler initialized
```

If missing, ensure `app/routes/app.tsx` has:
```typescript
initWorker();
initScheduler();
```

### Recommendations Not Executing

**Check 1**: Is the job in the queue?
```bash
curl "http://localhost:3000/api/jobs?jobId=YOUR_JOB_ID"
```

**Check 2**: Check worker logs for errors
Look for error messages in the terminal where the dev server is running.

**Check 3**: Check BackgroundJob table
```bash
npx prisma studio
```
Look for jobs with `status = "failed"` and check the `error` field.

---

## 📈 Monitoring

### View All Recommendations
```bash
curl http://localhost:3000/api/recommendations
```

### Filter by Status
```bash
curl "http://localhost:3000/api/recommendations?status=new"
curl "http://localhost:3000/api/recommendations?status=in_progress"
curl "http://localhost:3000/api/recommendations?status=completed"
```

### Filter by Category
```bash
curl "http://localhost:3000/api/recommendations?category=inventory"
curl "http://localhost:3000/api/recommendations?category=customer"
```

### View Job Queue
```bash
# In Prisma Studio, open BackgroundJob table
npx prisma studio
```

---

## 🎯 Example Workflow

1. **Connect Google Sheets + Shopify** (in Settings)
2. **Wait for scheduler** (or manually trigger analysis)
3. **See recommendation**: "Weekly sales summary hasn't been synced to your tracking spreadsheet"
4. **Click Execute** → AI exports recent orders and appends to Google Sheets
5. **View result** in the recommendation card status
6. **Click Dismiss** to remove the card

---

## 📚 Additional Resources

- **Full Documentation**: See `RECOMMENDATION_ENGINE_COMPLETE.md`
- **API Reference**: See `docs/api-recommendations.md`
- **Architecture Details**: See `docs/RECOMMENDATION_ENGINE.md`
- **Frontend Guide**: See `FRONTEND_IMPLEMENTATION.md`

---

## 🎉 You're All Set!

The recommendation engine is now running and will automatically analyze your store every 4 hours. Connect more MCP data sources to unlock more recommendations!
