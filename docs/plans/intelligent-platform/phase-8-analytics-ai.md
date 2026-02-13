# Phase 8: Analytics with AI Interpretation

**Status:** Pending Review
**Dependencies:** Phase 1 (recommendations table)
**Estimated Scope:** ~300 LOC across 4 files

## Overview

Create a new `analytics_interpreter` internal BaleyBot that reads execution data, identifies trends, and generates actionable insights. These insights feed into the Actions Hub (Phase 3) as recommendations.

**Existing infrastructure:**
- `baleybotMetrics`, `baleybotMetricAggregates`, `baleybotUsage` tables (all exist)
- `baleybotAlerts` table (exists)
- `executeInternalBaleybot()` (exists, working)
- Analytics page (exists at `/dashboard/analytics`)

---

## 8.1 — New `analytics_interpreter` Internal BaleyBot

### BAL Definition

Add to `apps/web/src/lib/baleybot/internal-bb/generated-definitions.ts`:

```bal
analytics_interpreter {
  "goal": "Analyze BaleyBot execution metrics, usage patterns, and performance data for a workspace. Identify trends, anomalies, and optimization opportunities. Produce actionable insights with clear recommendations. Focus on: cost optimization (which BBs are expensive and why), performance patterns (slow executions, frequent failures), usage trends (growing/declining BBs), and configuration issues (unused tools, missing connections). Be specific and data-driven — include numbers, percentages, and timeframes.",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "insights": "array<object>",
    "summary": "string",
    "period": "string"
  }
}
```

### Output Schema (Caller Side)

```typescript
const analyticsInsightSchema = z.object({
  insights: z.array(z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    category: z.string().default('general'),
    affectedBaleybots: z.array(z.string()).default([]),
    metric: z.string().optional(),
    value: z.number().optional(),
    trend: z.string().optional(), // 'increasing', 'decreasing', 'stable'
    recommendation: z.string().optional(),
  })).default([]),
  summary: z.string().default('No significant findings'),
  period: z.string().default('7d'),
});
```

---

## 8.2 — Wire to Actions Hub

### Invocation Strategy

Two modes:
1. **On-demand:** User clicks "Generate Insights" button on analytics page
2. **Periodic:** Daily cron job (if workspace has Pro plan with per-minute cron)

### On-Demand Implementation

**File:** `apps/web/src/lib/baleybot/services/analytics-interpreter.ts`

```typescript
export async function generateAnalyticsInsights(workspaceId: string, period: '7d' | '30d' | '90d' = '7d') {
  // 1. Gather data
  const metrics = await getWorkspaceMetrics(workspaceId, period);
  const usage = await getWorkspaceUsage(workspaceId, period);
  const recentFailures = await getRecentFailures(workspaceId, period);

  // 2. Format as context for the analytics_interpreter BB
  const context = formatAnalyticsContext(metrics, usage, recentFailures);

  // 3. Execute the internal BB
  const { output } = await executeInternalBaleybot('analytics_interpreter',
    `Analyze the following workspace analytics data for the past ${period}:\n\n${context}`,
    { userWorkspaceId: workspaceId }
  );

  // 4. Parse output and persist as recommendations
  const result = analyticsInsightSchema.parse(resolveOutput(output));

  for (const insight of result.insights) {
    await db.insert(recommendations).values({
      workspaceId,
      sourceType: 'analytics_interpreter',
      targetType: 'insight',
      title: insight.title,
      description: insight.description,
      severity: insight.severity,
      proposedAction: insight.recommendation ? {
        type: 'analytics_insight',
        recommendation: insight.recommendation,
        affectedBaleybots: insight.affectedBaleybots,
        metric: insight.metric,
        trend: insight.trend,
      } : null,
      confidence: null, // AI insights don't have numeric confidence
      metadata: { period, category: insight.category },
    });
  }

  return result;
}
```

### Data Gathering Helpers

```typescript
async function getWorkspaceMetrics(workspaceId: string, period: string) {
  // Query baleybotMetricAggregates for the period
  // Return: execution counts, avg durations, error rates per BB
}

async function getWorkspaceUsage(workspaceId: string, period: string) {
  // Query baleybotUsage for the period
  // Return: token usage, cost estimates, API call counts per BB
}

async function getRecentFailures(workspaceId: string, period: string) {
  // Query baleybotExecutions where status='failed'
  // Return: failure count, common error patterns, affected BBs
}

function formatAnalyticsContext(metrics, usage, failures): string {
  // Format as a clear, structured text block for the AI to analyze
  // Include: per-BB stats, totals, trends vs previous period
}
```

### Periodic Invocation

**File:** `apps/web/src/app/api/cron/process-scheduled-tasks/route.ts` (existing cron)

Add a check: if it's a new day (UTC), run `generateAnalyticsInsights()` for each workspace that has been active in the last 7 days.

```typescript
// Inside the existing cron handler:
const isNewDay = /* check if first cron run of the day */;
if (isNewDay) {
  const activeWorkspaces = await getActiveWorkspaces(7); // active in last 7 days
  for (const ws of activeWorkspaces) {
    void generateAnalyticsInsights(ws.id, '7d').catch(err => {
      logger.warn('Analytics interpretation failed', { workspaceId: ws.id, error: err.message });
    });
  }
}
```

---

## 8.3 — "AI Insights" Section on Analytics Page

### Current Analytics Page

Located at `apps/web/src/app/dashboard/analytics/` — shows charts and metrics.

### New Section

Add an "AI Insights" card at the top of the analytics page:

```
┌─────────────────────────────────────────────────────┐
│ AI Insights                   [Generate ↻] [7d ▾]   │
│                                                      │
│ 📊 "research_bot usage up 45% this week — consider  │
│    adding rate limiting to control costs."           │
│                                                      │
│ ⚠ "data_processor failed 12 times (18% error rate)  │
│    — most failures are timeout errors. Consider      │
│    increasing maxTokens or splitting into chain."    │
│                                                      │
│ 💡 "writer_bot has 3 unused tools (fetch_url,       │
│    store_memory, schedule_task). Removing them       │
│    would reduce prompt size and cost."               │
│                                                      │
│ Last generated: 2 hours ago                          │
│ [View all in Actions Hub →]                          │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
1. On page load, fetch recent analytics_interpreter recommendations
2. "Generate" button triggers `generateAnalyticsInsights()` on demand
3. Period dropdown: 7d, 30d, 90d
4. Each insight links to the relevant BB detail page
5. "View all" links to Actions Hub filtered by `sourceType: 'analytics_interpreter'`:
   ```
   /dashboard/actions?sourceType=analytics_interpreter
   ```
   Phase 3 added `?sourceType=` URL parameter support with a dismissible filter chip.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing
1. Execute several BBs to generate metrics data
2. Click "Generate Insights" on analytics page
3. Verify insights appear in the AI Insights section
4. Verify same insights appear in the Actions Hub
5. Dismiss an insight → it disappears from both places

## Files Created/Modified

| Action | File |
|---|---|
| **Modify** | `apps/web/src/lib/baleybot/internal-bb/generated-definitions.ts` — add analytics_interpreter |
| **Create** | `apps/web/src/lib/baleybot/services/analytics-interpreter.ts` — insight generation |
| **Modify** | Analytics page component — add "AI Insights" section |
| **Modify** | `apps/web/src/app/api/cron/process-scheduled-tasks/route.ts` — daily analytics cron |
| **Create** | `apps/web/src/components/analytics/AIInsightsCard.tsx` |
