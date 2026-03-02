# Component Structure - Recommendations Feature

## File Tree
```
app/
├── components/
│   └── recommendations/
│       ├── RecommendationCard.tsx       (NEW)
│       └── RecommendationsPanel.tsx     (NEW)
└── routes/
    └── app._index.tsx                   (MODIFIED)
```

## Component Hierarchy

```
app._index.tsx (Chat Page)
│
├── Empty State (no messages)
│   ├── Greeting
│   ├── RecommendationsPanel (variant="landing")
│   │   ├── Header (title + refresh button)
│   │   ├── Category Filter Tabs
│   │   └── Horizontal Scrollable Cards
│   │       └── RecommendationCard (multiple)
│   │           ├── Category Badge
│   │           ├── Priority Indicator
│   │           ├── Status Indicator
│   │           ├── Title & Description
│   │           ├── MCP Server Badges
│   │           └── Action Buttons (Execute, Dismiss)
│   ├── Chat Input Card
│   └── Quick Action Pills
│
└── Active Chat State (has messages)
    ├── Collapsible Recommendations Bar
    │   ├── Toggle Header (lightbulb icon)
    │   └── RecommendationsPanel (variant="inline")
    │       └── (same structure as above)
    ├── Messages Area
    └── Bottom Input Bar
```

## Data Flow

### 1. Initial Load
```
app._index.tsx
    ↓
RecommendationsPanel (useEffect on mount)
    ↓
fetch('/api/recommendations')
    ↓
setRecommendations(data)
    ↓
RecommendationCard (map over recommendations)
```

### 2. Execute Action
```
User clicks "Execute"
    ↓
RecommendationCard.handleExecute()
    ↓
RecommendationsPanel.handleExecute(recommendation)
    ↓
Update status to "in_progress"
    ↓
POST /api/recommendations/:id/execute
    ↓
Response: { handoff: true, prompt: "..." }
    ↓
onChatHandoff(prompt)
    ↓
app._index.tsx.handleChatHandoff(prompt)
    ↓
sendMessage({ text: prompt })
    ↓
Chat input receives prompt
```

### 3. Polling Mechanism
```
RecommendationsPanel (useEffect watching recommendations)
    ↓
Check if any recommendation.status === "in_progress"
    ↓
If YES:
    Start interval (every 3s)
        ↓
    fetch('/api/recommendations')
        ↓
    Update recommendations state
        ↓
    Check again
    
If NO:
    Clear interval
```

### 4. Dismiss Action
```
User clicks "Dismiss"
    ↓
RecommendationCard.handleDismiss()
    ↓
RecommendationsPanel.handleDismiss(id)
    ↓
DELETE /api/recommendations/:id
    ↓
Remove from recommendations state
```

## Props Interface

### RecommendationsPanel
```typescript
interface RecommendationsPanelProps {
  onChatHandoff?: (prompt: string) => void;
  variant?: "landing" | "inline";
}
```

### RecommendationCard
```typescript
interface RecommendationCardProps {
  recommendation: Recommendation;
  onExecute: (recommendation: Recommendation) => void;
  onDismiss: (id: string) => void;
}
```

### Recommendation Data Model
```typescript
interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: "inventory" | "customer" | "reporting" | "sync" | "marketing";
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed" | "failed";
  mcpServersUsed: string[];
  actionType: "chat_handoff" | "direct_execution";
  actionPrompt?: string;
  createdAt: string;
}
```

## API Endpoints Expected

### GET /api/recommendations
**Response:**
```json
{
  "recommendations": [
    {
      "id": "rec_123",
      "title": "Low inventory alert",
      "description": "5 products are running low on stock",
      "category": "inventory",
      "priority": "high",
      "status": "pending",
      "mcpServersUsed": ["shopify"],
      "actionType": "chat_handoff",
      "actionPrompt": "Show me products with low inventory",
      "createdAt": "2026-02-27T19:00:00Z"
    }
  ]
}
```

### POST /api/recommendations/:id/execute
**Response:**
```json
{
  "handoff": true,
  "prompt": "Show me products with low inventory",
  "status": "completed"
}
```

### DELETE /api/recommendations/:id
**Response:**
```json
{
  "success": true
}
```

## Styling Notes

- All components use inline styles for consistency with existing codebase
- Shopify Polaris web components: `<s-icon>`, `<s-spinner>`, `<s-badge>`, etc.
- CSS variables for theming: `var(--s-color-text, #1a1a1a)`
- Hover states implemented with `onMouseEnter` and `onMouseLeave`
- Responsive design with horizontal scrolling for cards
- Consistent border radius: 12px for cards, 8px for buttons, 20px for pills
- Consistent spacing: 16px gap between cards, 8px gap for inline elements

## State Management

### Local State (RecommendationsPanel)
- `recommendations: Recommendation[]` - List of all recommendations
- `isLoading: boolean` - Loading state during fetch
- `selectedCategory: CategoryFilter` - Current filter selection
- `pollIntervalRef: NodeJS.Timeout | null` - Polling interval reference

### Local State (ChatBody in app._index.tsx)
- `showRecommendations: boolean` - Toggle state for collapsible bar (defaults to true)

## Error Handling

All API calls wrapped in try-catch blocks:
- Fetch errors logged to console
- Failed executions update status to "failed"
- Graceful degradation if endpoints don't exist yet
