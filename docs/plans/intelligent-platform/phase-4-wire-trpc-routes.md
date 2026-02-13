# Phase 4: Wire 5 tRPC Routes

**Status:** Pending Review
**Dependencies:** None (all 5 routes are backend-complete)
**Estimated Scope:** ~500 LOC across 5 UI integration points

## Overview

Five tRPC procedures in the `baleybots` router are fully implemented on the backend but have no frontend consumers. This phase wires each one to appropriate UI surfaces.

**Existing code (DO NOT rebuild):** All procedures live in `apps/web/src/lib/trpc/routers/baleybots.ts`.

---

## 4.1 — `verifyTool` → Connections Panel "Verify" Button

### Backend Procedure

`baleybots.verifyTool` — runs a multi-phase verification check on a single tool (schema validation, connectivity test, permission check).

### Frontend Integration

**Location:** ConnectionsPanel component (on the bot detail integrate tab)

**UI:** Add a "Verify" button next to each connection-derived tool listed in the panel.

```
┌─────────────────────────────────────────────────┐
│ postgres_query (from: my-db)  [Verify] [✓ OK]   │
│ mysql_query (from: analytics) [Verify] [⚠ Warn]  │
└─────────────────────────────────────────────────┘
```

**Behavior:**
1. Click "Verify" → calls `baleybots.verifyTool.mutate({ baleybotId, toolName })`
2. Shows loading spinner on the button
3. On success: green checkmark with summary
4. On failure: red/yellow status with error message
5. Results are ephemeral (not persisted) — just UI feedback

---

## 4.2 — `validateBaleybot` → Tab-Level Lazy Validation Banners

### Backend Procedure

`baleybots.validateBaleybot` — runs comprehensive validation: BAL syntax, tool availability, connection requirements, entity structure.

### Frontend Integration

**Location:** Bot detail page — each tab (visual, code, test, integrate) shows a validation banner when relevant issues exist.

**Trigger:** Lazy — validate on tab mount or when BAL code changes (debounced 2s).

```
┌─────────────────────────────────────────────────────┐
│ ⚠ 2 validation issues                    [Details]  │
│   • Entity "analyzer" uses tool "pg_query" but no   │
│     PostgreSQL connection is configured              │
│   • Entity "writer" has no goal defined              │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
1. Call `baleybots.validateBaleybot.useQuery({ baleybotId })` on tab mount
2. Display issues as a collapsible banner at the top of the tab
3. Issues are categorized: error (red), warning (yellow), info (blue)
4. Each issue links to the relevant tab/action to fix it

---

## 4.3 — `analyzeConnections` → ConnectionsPanel "Analyze" Button

### Backend Procedure

`baleybots.analyzeConnections` — analyzes which connections a BB needs based on its BAL code, which are satisfied, and which are missing.

### Frontend Integration

**Location:** ConnectionsPanel on the integrate tab

**UI:** Add an "Analyze Dependencies" button at the top of the connections panel.

```
┌─────────────────────────────────────────────────┐
│ Connection Dependencies          [Analyze]       │
│                                                   │
│ ✅ PostgreSQL: my-db (connected)                 │
│ ❌ OpenAI: not configured (entity "writer"       │
│    uses model "openai:gpt-4o")                   │
│ ℹ️ No MCP servers needed                         │
└─────────────────────────────────────────────────┘
```

**Behavior:**
1. Click "Analyze" → calls `baleybots.analyzeConnections.mutate({ baleybotId })`
2. Shows structured dependency report
3. Missing connections show a "Configure" link that navigates to connections settings

---

## 4.4 — `analyzeDeployment` → Integrate Tab AI Analysis Section

### Backend Procedure

`baleybots.analyzeDeployment` — AI-powered deployment readiness analysis. Checks trigger configuration, connection health, test coverage, monitoring setup.

### Frontend Integration

**Location:** Bot detail integrate tab, new "Deployment Analysis" card

```
┌─────────────────────────────────────────────────────┐
│ Deployment Analysis                    [Run ↻]      │
│                                                      │
│ Overall: Ready with warnings                         │
│                                                      │
│ ✅ Trigger configured (webhook)                      │
│ ✅ All connections healthy                            │
│ ⚠ No test cases defined                              │
│ ⚠ No monitoring alerts configured                    │
│                                                      │
│ Recommendation: Add at least 3 test cases before     │
│ going live to catch regressions.                     │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
1. Click "Run" → calls `baleybots.analyzeDeployment.mutate({ baleybotId })`
2. Shows structured readiness report
3. Each item links to the relevant action (e.g., "Add test" → test tab)

---

## 4.5 — `getRuntimeInterface` → Integrate Tab API Documentation Card

### Backend Procedure

`baleybots.getRuntimeInterface` — generates the runtime API documentation for a BB: expected input format, output schema, available endpoints, authentication requirements.

### Frontend Integration

**Location:** Bot detail integrate tab, new "API Documentation" card

```
┌─────────────────────────────────────────────────────┐
│ API Documentation                    [Refresh]      │
│                                                      │
│ Endpoint: POST /api/baleybots/{id}/execute          │
│                                                      │
│ Input:                                               │
│   { "message": "string", "context"?: "object" }     │
│                                                      │
│ Output:                                              │
│   { "result": "string", "executionId": "uuid" }     │
│                                                      │
│ Authentication: API key (Bearer token)               │
│                                                      │
│ [Copy cURL] [Copy TypeScript]                        │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
1. Auto-fetch on mount: `baleybots.getRuntimeInterface.useQuery({ baleybotId })`
2. Show formatted API documentation
3. "Copy cURL" and "Copy TypeScript" buttons generate ready-to-use code snippets
4. If the BB has an output schema defined, show the expected output structure

---

## Cross-Cutting Concerns

### Toast Feedback for All Mutations

All 5 tRPC route wirings should include toast feedback using a consistent pattern:

```typescript
// Pattern for all mutations:
const mutation = trpc.baleybots.verifyTool.useMutation({
  onSuccess: (data) => toast({ title: 'Tool verified', description: data.summary }),
  onError: (error) => toast({ title: 'Verification failed', description: error.message, variant: 'destructive' }),
});
```

### Error Recovery Actions

`ExecutionErrorDisplay.tsx` should include contextual retry buttons based on error type:
- **Timeout errors:** "Retry now" or "Re-run with longer timeout"
- **Rate limit errors:** "Try again in X seconds" (with countdown)
- **Configuration errors:** Link to relevant settings page

### Webhook Secret Display

Webhook secret display should use the full value from the data model (not truncated display). Force copy-button-only UI to prevent users from manually copying a truncated secret.

---

## Implementation Order

All 5 are independent and can be built in any order. Recommended:
1. **4.2** (validateBaleybot) — most broadly useful, shown on every tab
2. **4.5** (getRuntimeInterface) — highest user value for integration
3. **4.3** (analyzeConnections) — natural companion to connections panel
4. **4.1** (verifyTool) — complements 4.3
5. **4.4** (analyzeDeployment) — AI analysis, nice-to-have

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing (per route)
1. Create a BB with tools and connections
2. Trigger each UI action
3. Verify the tRPC call returns meaningful data
4. Verify error states (missing connections, invalid BAL, etc.) display correctly

## Files Created/Modified

| Action | File |
|---|---|
| **Modify** | ConnectionsPanel component — add "Verify" + "Analyze" buttons |
| **Create** | `components/baleybots/ValidationBanner.tsx` — reusable validation banner |
| **Modify** | Bot detail tab components — add validation banner |
| **Create** | `components/baleybots/DeploymentAnalysis.tsx` — deployment analysis card |
| **Create** | `components/baleybots/RuntimeInterfaceCard.tsx` — API documentation card |
| **Modify** | Bot detail integrate tab — add deployment analysis + API docs cards |
