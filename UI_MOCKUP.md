# UI Mockup - Recommendations Feature

## Empty State (Landing Page)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                        Good morning                             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  💡 Recommendations                              🔄      │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  [All] [Inventory] [Customer] [Reporting] [Sync] ...   │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ INVENTORY  ● │  │ CUSTOMER   ● │  │ REPORTING  ● │ │  │
│  │  │              │  │              │  │              │ │  │
│  │  │ Low Stock    │  │ New VIP      │  │ Sales Report │ │  │
│  │  │ Alert        │  │ Customer     │  │ Ready        │ │  │
│  │  │              │  │              │  │              │ │  │
│  │  │ 5 products   │  │ High-value   │  │ Weekly sales │ │  │
│  │  │ running low  │  │ customer...  │  │ summary...   │ │  │
│  │  │              │  │              │  │              │ │  │
│  │  │ 🛒 Shopify   │  │ 🛒 📊 Airtbl │  │ 🛒 📊 Sheets │ │  │
│  │  │              │  │              │  │              │ │  │
│  │  │ [Execute]    │  │ [Execute]    │  │ [Execute]    │ │  │
│  │  │ [Dismiss]    │  │ [Dismiss]    │  │ [Dismiss]    │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  How can I help you today?                          ↑  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [Recent orders] [Sales overview] [Low inventory] ...          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Active Chat State

```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Recommendations                                          ▲  │
│  ─────────────────────────────────────────────────────────────  │
│  [All] [Inventory] [Customer] [Reporting] [Sync] [Marketing]   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ INVENTORY  ● │  │ CUSTOMER   ● │  │ SYNC       ● │         │
│  │ High         │  │ Medium       │  │ Low          │         │
│  │              │  │              │  │              │         │
│  │ ⏳ Executing │  │ Low Stock    │  │ Sync Orders  │         │
│  │              │  │ Alert        │  │              │         │
│  │ Checking...  │  │ 3 products   │  │ Sync recent  │         │
│  │              │  │ need restock │  │ orders to... │         │
│  │              │  │              │  │              │         │
│  │ 🛒 📊 Google │  │ 🛒 Shopify   │  │ 🛒 📊 Airtbl │         │
│  │              │  │              │  │              │         │
│  │ [Executing]  │  │ [Execute]    │  │ [Execute]    │         │
│  │ [Dismiss]    │  │ [Dismiss]    │  │ [Dismiss]    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👤 User                                                         │
│  Show me my recent orders                                       │
│                                                                  │
│  🤖 Sidekick                                                     │
│  I'll check your recent orders for you...                       │
│                                                                  │
│  [Order details displayed here]                                 │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Reply...                                                    ↑  │
└─────────────────────────────────────────────────────────────────┘
```

## Collapsed State

```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Recommendations                                          ▼  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  👤 User                                                         │
│  Show me my recent orders                                       │
│                                                                  │
│  🤖 Sidekick                                                     │
│  I'll check your recent orders for you...                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Recommendation Card States

### Pending (Default)
```
┌──────────────────────────┐
│ INVENTORY              ● │  ← Category badge + priority dot
│ High                     │  ← Priority level
│                          │
│ Low Stock Alert          │  ← Title
│                          │
│ 5 products are running   │  ← Description
│ low on inventory         │
│                          │
│ ─────────────────────── │
│ 🛒 Shopify               │  ← MCP server badges
│                          │
│ [Execute]  [Dismiss]     │  ← Action buttons
└──────────────────────────┘
```

### In Progress
```
┌──────────────────────────┐
│ CUSTOMER               ● │
│ Medium                   │
│                          │
│ ⏳ Executing...          │  ← Status indicator
│                          │
│ Analyzing Customer Data  │
│                          │
│ Checking customer        │
│ purchase patterns...     │
│                          │
│ ─────────────────────── │
│ 🛒 Shopify  📊 Airtable  │
│                          │
│ [Executing] [Dismiss]    │  ← Disabled execute
└──────────────────────────┘
```

### Completed
```
┌──────────────────────────┐
│ REPORTING              ● │
│ Low                      │
│                          │
│ ✅ Completed             │  ← Success status
│                          │
│ Sales Report Generated   │
│                          │
│ Your weekly sales        │
│ report is ready          │
│                          │
│ ─────────────────────── │
│ 🛒 Shopify  📊 Sheets    │
│                          │
│ [Completed] [Dismiss]    │  ← Disabled execute
└──────────────────────────┘
```

### Failed
```
┌──────────────────────────┐
│ SYNC                   ● │
│ Medium                   │
│                          │
│ ❌ Failed                │  ← Error status
│                          │
│ Sync Orders to Airtable  │
│                          │
│ Unable to connect to     │
│ Airtable. Try again.     │
│                          │
│ ─────────────────────── │
│ 🛒 Shopify  📊 Airtable  │
│                          │
│ [Execute]  [Dismiss]     │  ← Can retry
└──────────────────────────┘
```

## Empty State
```
┌─────────────────────────────────────────────────────────────────┐
│  💡 Recommendations                              🔄 Refresh     │
│  ─────────────────────────────────────────────────────────────  │
│  [All] [Inventory] [Customer] [Reporting] [Sync] [Marketing]   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │                       💡                                │    │
│  │                                                         │    │
│  │           No recommendations yet                       │    │
│  │                                                         │    │
│  │   Recommendations will appear here based on            │    │
│  │   your store activity                                  │    │
│  │                                                         │    │
│  │                  [Refresh]                             │    │
│  │                                                         │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Loading State
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                          ⏳                                      │
│                   Loading...                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Color Legend

### Categories
- 🟣 INVENTORY (Purple #8B5CF6)
- 🔵 CUSTOMER (Blue #3B82F6)
- 🟢 REPORTING (Green #10B981)
- 🟠 SYNC (Orange #F59E0B)
- 🩷 MARKETING (Pink #EC4899)

### Priority Dots
- ⚪ Low (Gray #94A3B8)
- 🟠 Medium (Orange #F59E0B)
- 🔴 High (Red #EF4444)

### Status Colors
- ⚪ Pending (Gray #94A3B8)
- 🔵 In Progress (Blue #3B82F6)
- 🟢 Completed (Green #10B981)
- 🔴 Failed (Red #EF4444)

### MCP Server Icons
- 🛒 Shopify
- 📊 Google Sheets
- 📁 Google Drive
- 📄 Google Docs
- 🗂️ Airtable
- 🗄️ PostgreSQL
- 🗄️ MySQL
- ☁️ S3
- 📧 Email
- 📥 FTP

## Interaction Patterns

### Hover States
- Cards: Subtle shadow increase
- Buttons: Background color change
- Filter tabs: Background highlight
- Refresh button: Border color change

### Click Actions
- Execute button → API call → Status update → Possible chat handoff
- Dismiss button → API call → Remove from list
- Filter tabs → Filter recommendations by category
- Refresh button → Reload recommendations
- Collapse toggle → Show/hide panel

### Keyboard Navigation
- Tab through interactive elements
- Enter/Space to activate buttons
- Arrow keys for horizontal scrolling

## Responsive Behavior
- Cards scroll horizontally on smaller screens
- Filter tabs scroll horizontally
- Minimum card width: 320px
- Maximum card width: 320px (fixed for consistency)
- Gap between cards: 16px
