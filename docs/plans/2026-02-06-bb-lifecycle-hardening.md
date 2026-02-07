# BB Lifecycle Hardening — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical/high issues from the BB creation lifecycle audit — trigger persistence, streaming feedback, output validation, webhook URLs, unsaved-bot guards, rate limiting, analytics differentiation, and mobile UX.

**Architecture:** Four sprints targeting descending severity. Sprint 1 fixes the 3 critical blockers (triggers, streaming, validation). Sprint 2 tackles the 9 high issues. Sprint 3 addresses medium-severity UX gaps. Sprint 4 handles polish and remaining items.

**Tech Stack:** Next.js 15, React 19 (compiler — no manual memoization), TypeScript, Tailwind CSS, shadcn/ui, lucide-react, tRPC, Drizzle ORM, Vitest, Zod.

**Design doc:** `docs/reviews/2026-02-06-bb-lifecycle-comprehensive-review.md`

---

## Dependency Graph

```
Sprint 1 (Critical) ─── must complete first
    │
    ├── Task 1: Trigger persistence (C1, H7)
    ├── Task 2: Validate internal BB outputs (C3)
    └── Task 3: Wire creator bot streaming (C2)

Sprint 2 (High) ─── needs Sprint 1
    │
    ├── Task 4: Webhook URL display (H1)
    ├── Task 5: Unsaved-bot guards (H2)
    ├── Task 6: Differentiate Analytics vs Monitor (H3)
    ├── Task 7: Rate limit AI mutations (H4)
    ├── Task 8: Mobile building indicator (H5)
    ├── Task 9: Input validation UX (H6)
    ├── Task 10: Cron validation + next-run preview (H8)
    └── Task 11: BB completion trigger sync (H9)

Sprint 3 (Medium) ─── can run after Sprint 2
    │
    ├── Task 12: Connection analysis re-run (M1)
    ├── Task 13: Error recovery UX (M5)
    ├── Task 14: Test comparison upgrade (M6)
    ├── Task 15: Test execution timeout + parallel run (M7, M8)
    ├── Task 16: Wire deployment_advisor (M10)
    └── Task 17: Optimistic locking on test saves (M11)

Sprint 4 (Polish) ─── can run after Sprint 3
    │
    ├── Task 18: Hub topology in visual editor (M9)
    ├── Task 19: BAL code inline in chat + entity animation (M2, M3)
    ├── Task 20: Missing CSS + minor polish (M12, L items)
    └── Task 21: Final verification
```

---

## Sprint 1: Critical Fixes

### Task 1: Trigger persistence + loading

**Goal:** Save trigger configuration to DB and load it on page init so triggers survive page refreshes.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (add `saveTriggerConfig` mutation after line 1058)
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 161, 944-994, and saveFromSession call)
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (update `saveFromSession` to include triggers)

**Step 1:** Add `saveTriggerConfig` mutation to baleybots router.

In `apps/web/src/lib/trpc/routers/baleybots.ts`, after the `saveTestCases` mutation (after line 1058), add:

```typescript
  saveTriggerConfig: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      triggerConfig: z.object({
        type: z.enum(['manual', 'schedule', 'webhook', 'other_bb']),
        cronExpression: z.string().optional(),
        webhookPath: z.string().optional(),
        sourceBaleybotId: z.string().uuid().optional(),
        triggerEvent: z.enum(['success', 'failure', 'completion']).optional(),
      }).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await updateWithLock(baleybots, input.id, existing.version, {
        triggers: input.triggerConfig ? [input.triggerConfig] : [],
        updatedAt: new Date(),
      });

      return { success: true };
    }),
```

**Step 2:** Load trigger config in page init effect.

In `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`, inside the init effect (around line 968, after test cases loading), add:

```typescript
      // Load trigger configuration
      if (existingBaleybot.triggers && Array.isArray(existingBaleybot.triggers) && existingBaleybot.triggers.length > 0) {
        const savedTrigger = existingBaleybot.triggers[0] as TriggerConfigType;
        setTriggerConfig(savedTrigger);
      }
```

**Step 3:** Wire auto-save for trigger changes.

In `page.tsx`, after the test cases auto-save effect (after line 796), add:

```typescript
  // Auto-save trigger config when it changes
  const saveTriggerMutation = trpc.baleybots.saveTriggerConfig.useMutation();

  useEffect(() => {
    if (!savedBaleybotId) return;
    const timeout = setTimeout(() => {
      saveTriggerMutation.mutate({
        id: savedBaleybotId,
        triggerConfig: triggerConfig ?? null,
      });
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerConfig, savedBaleybotId]);
```

**Step 4:** Run `pnpm type-check` — Expected: PASS

**Step 5:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: persist trigger configuration to database"
```

---

### Task 2: Validate internal BB outputs with Zod

**Goal:** Prevent runtime crashes when `test_generator` or `connection_advisor` return malformed data.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (lines 1093-1112, 1146-1164)

**Step 1:** Add Zod schemas for internal BB outputs.

At the top of `baleybots.ts` (after existing imports, around line 25), add:

```typescript
const testGeneratorOutputSchema = z.object({
  tests: z.array(z.object({
    name: z.string(),
    level: z.enum(['unit', 'integration', 'e2e']),
    input: z.string(),
    expectedOutput: z.string().optional(),
    description: z.string().optional(),
  })),
  strategy: z.string().optional(),
});

const connectionAdvisorOutputSchema = z.object({
  analysis: z.object({
    aiProvider: z.object({
      needed: z.boolean(),
      recommended: z.string().optional(),
      reason: z.string(),
    }).optional(),
    databases: z.array(z.object({
      type: z.string(),
      tools: z.array(z.string()),
      configHints: z.string().optional(),
    })).optional(),
    external: z.array(z.object({
      service: z.string(),
      reason: z.string(),
    })).optional(),
  }).optional(),
  recommendations: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});
```

**Step 2:** Replace the unsafe cast in `generateTests` mutation (around line 1102).

Replace:
```typescript
      return output as { tests: Array<{ name: string; level: string; input: string; expectedOutput?: string; description?: string }>; strategy?: string };
```

With:
```typescript
      try {
        const parsed = testGeneratorOutputSchema.parse(output);
        return parsed;
      } catch {
        log.error('test_generator returned malformed output', { output, baleybotId: input.baleybotId });
        // Return empty result instead of crashing
        return { tests: [], strategy: 'Test generation returned unexpected format. Please try again.' };
      }
```

**Step 3:** Replace the unsafe cast in `analyzeConnections` mutation (around line 1155).

Replace:
```typescript
      return output as { analysis: { ... }; recommendations: string[]; warnings: string[] };
```

With:
```typescript
      try {
        const parsed = connectionAdvisorOutputSchema.parse(output);
        return parsed;
      } catch {
        log.error('connection_advisor returned malformed output', { output, baleybotId: input.baleybotId });
        return { analysis: undefined, recommendations: ['Connection analysis returned unexpected format. Please try again.'], warnings: [] };
      }
```

**Step 4:** Run `pnpm type-check` — Expected: PASS

**Step 5:** Run `pnpm test` — Expected: All passing

**Step 6:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: validate internal BB outputs with Zod schemas"
```

---

### Task 3: Wire creator bot streaming feedback

**Goal:** Replace fake phase cycling with real progress from `streamCreatorMessage()`.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 277-451)
- Modify: `apps/web/src/components/creator/ConversationThread.tsx` (lines 484-532)
- Modify: `apps/web/src/lib/baleybot/creator-types.ts` (add CreationProgress type)

**Step 1:** Add a `CreationProgress` type to `creator-types.ts` (after line 255):

```typescript
export interface CreationProgress {
  phase: 'understanding' | 'designing' | 'connecting' | 'generating' | 'complete';
  message: string;
  entitiesCreated?: number;
  connectionsCreated?: number;
}
```

**Step 2:** In `page.tsx`, add progress state (after line 165):

```typescript
  const [creationProgress, setCreationProgress] = useState<CreationProgress | null>(null);
```

**Step 3:** In `handleSendMessage` (starting around line 277), replace the single `await creatorMutation.mutateAsync(...)` call with a streaming approach. Before the mutation call (line 293), add progress tracking:

```typescript
      setCreationProgress({ phase: 'understanding', message: 'Understanding your request...' });
```

After the mutation returns successfully (around line 308, before processing entities), add:

```typescript
      setCreationProgress({ phase: 'designing', message: `Designed ${result.entities.length} entit${result.entities.length === 1 ? 'y' : 'ies'}` });
```

After entities are set (around line 325):

```typescript
      if (result.connections?.length > 0) {
        setCreationProgress({ phase: 'connecting', message: `Connected ${result.connections.length} workflow${result.connections.length === 1 ? '' : 's'}` });
      }
```

Before the assistant message is added (around line 355):

```typescript
      setCreationProgress({ phase: 'generating', message: 'Generating BAL code...' });
```

After status is set to 'ready' (line 436):

```typescript
      setCreationProgress({ phase: 'complete', message: 'Ready!' });
      // Clear progress after a brief delay
      setTimeout(() => setCreationProgress(null), 1000);
```

In the catch block (after line 439):

```typescript
      setCreationProgress(null);
```

**Step 4:** Pass `creationProgress` to LeftPanel/ConversationThread.

In the LeftPanel render (find where `isBuilding` is passed), add:

```typescript
  creationProgress={creationProgress}
```

**Step 5:** Update `ConversationThread.tsx` to use real progress instead of fake phases.

Replace the fake phase cycling in `BuildingIndicator` (lines 484-532). Change the component to accept and use real progress:

```typescript
function BuildingIndicator({ progress }: { progress?: CreationProgress | null }) {
  const phase = progress?.phase ?? 'understanding';
  const message = progress?.message ?? 'Processing...';

  const BUILD_PHASES = [
    { label: 'Understanding', icon: Brain, phase: 'understanding' },
    { label: 'Designing', icon: Layers, phase: 'designing' },
    { label: 'Connecting', icon: GitBranch, phase: 'connecting' },
    { label: 'Generating', icon: Code2, phase: 'generating' },
  ] as const;

  const currentIndex = BUILD_PHASES.findIndex(p => p.phase === phase);

  return (
    <div className="flex items-start gap-3 px-4">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          {BUILD_PHASES.map((p, i) => {
            const Icon = p.icon;
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            return (
              <div key={p.phase} className={cn(
                'flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all duration-300',
                isActive && 'bg-primary/10 text-primary font-medium',
                isDone && 'text-green-600 dark:text-green-400',
                !isActive && !isDone && 'text-muted-foreground/40',
              )}>
                {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                <span className="hidden sm:inline">{p.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground animate-fade-in">{message}</p>
      </div>
    </div>
  );
}
```

Remove the old `useEffect` with `setInterval` for fake phase cycling.

**Step 6:** Add any missing imports (`CheckCircle2` from lucide-react, `CreationProgress` from creator-types).

**Step 7:** Run `pnpm type-check` — Expected: PASS

**Step 8:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx apps/web/src/components/creator/ConversationThread.tsx apps/web/src/lib/baleybot/creator-types.ts
git commit -m "feat: wire real creation progress to building indicator"
```

---

## Sprint 2: High-Severity Fixes

### Task 4: Display webhook URL in TriggerConfig

**Files:**
- Modify: `apps/web/src/components/baleybots/TriggerConfig.tsx` (lines 234-257)

**Step 1:** Update `TriggerConfigProps` to accept `baleybotId` and `workspaceId`:

```typescript
interface TriggerConfigProps {
  value: TriggerConfigType | undefined;
  onChange: (config: TriggerConfigType | undefined) => void;
  baleybotId?: string;
  workspaceId?: string;
  disabled?: boolean;
  className?: string;
}
```

**Step 2:** Replace the placeholder text in the webhook section (around line 252) with a real URL display:

```typescript
            {value?.type === 'webhook' && baleybotId && workspaceId && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono flex-1 break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/baleybots/{workspaceId}/{baleybotId}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => {
                        const url = `${window.location.origin}/api/webhooks/baleybots/${workspaceId}/${baleybotId}`;
                        navigator.clipboard.writeText(url);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Example cURL</p>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">
{`curl -X POST \\
  ${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/baleybots/${workspaceId}/${baleybotId} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: YOUR_SECRET" \\
  -d '{"input": "test"}'`}
                  </pre>
                </div>
              </div>
            )}
```

**Step 3:** Add `Copy` import from lucide-react. Pass `baleybotId` and `workspaceId` from `page.tsx` where TriggerConfig is rendered.

**Step 4:** Run `pnpm type-check` — Expected: PASS

**Step 5:** Commit

```bash
git add apps/web/src/components/baleybots/TriggerConfig.tsx apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: display webhook URL and cURL example in trigger config"
```

---

### Task 5: Guard unsaved bot operations

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 804, 874)

**Step 1:** In `handleGenerateTests` (line 804), replace the silent return with a user-facing message:

```typescript
  const handleGenerateTests = async () => {
    if (!savedBaleybotId) {
      // Add a chat message telling user to save first
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-system`,
        role: 'assistant' as const,
        content: 'Please save your bot first before generating tests.',
        timestamp: new Date(),
        metadata: {
          diagnostic: {
            level: 'warning' as const,
            title: 'Save Required',
            details: 'Your bot needs to be saved before tests can be generated.',
            suggestions: ['Click the Save button in the header to save your bot.'],
          },
        },
      }]);
      return;
    }
    // ... rest of function unchanged
```

**Step 2:** In `handleRunTest` (line 874), add the same guard with a message:

```typescript
  const handleRunTest = async (testId: string) => {
    const test = testCases.find(t => t.id === testId);
    if (!test) return;

    if (!savedBaleybotId) {
      setTestCases(prev => prev.map(t =>
        t.id === testId ? { ...t, status: 'failed' as const, error: 'Bot must be saved before running tests.' } : t
      ));
      return;
    }
    // ... rest of function unchanged
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: show clear message when unsaved bot operations attempted"
```

---

### Task 6: Differentiate Analytics vs Monitor tabs

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 1505-1518)

**Step 1:** Add a `getDashboardOverview` tRPC query (near other queries, around line 259):

```typescript
  const { data: dashboardOverview, isLoading: isLoadingDashboard } = trpc.analytics.getDashboardOverview.useQuery(
    undefined,
    { enabled: viewMode === 'analytics' },
  );
```

**Step 2:** Replace the analytics view (lines 1505-1518) with a workspace-level overview:

```typescript
                  {/* Analytics View — workspace-level overview */}
                  {viewMode === 'analytics' && (
                    <div className="h-full overflow-auto bg-background rounded-lg border p-4 space-y-4">
                      {isLoadingDashboard ? (
                        <div className="space-y-4">
                          <Skeleton className="h-20 w-full" />
                          <div className="grid grid-cols-3 gap-3">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                          </div>
                        </div>
                      ) : !dashboardOverview || dashboardOverview.totalExecutions === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-4" />
                          <h3 className="text-lg font-medium mb-2">No analytics yet</h3>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Run your bots to see workspace-wide analytics here.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-xl font-bold">{dashboardOverview.totalExecutions}</p>
                              <p className="text-[10px] text-muted-foreground">Total Executions</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-xl font-bold">{(dashboardOverview.successRate * 100).toFixed(1)}%</p>
                              <p className="text-[10px] text-muted-foreground">Success Rate</p>
                            </div>
                            <div className="rounded-lg border p-3 text-center">
                              <p className="text-xl font-bold">
                                {dashboardOverview.avgDurationMs > 1000
                                  ? `${(dashboardOverview.avgDurationMs / 1000).toFixed(1)}s`
                                  : `${Math.round(dashboardOverview.avgDurationMs)}ms`}
                              </p>
                              <p className="text-[10px] text-muted-foreground">Avg Duration</p>
                            </div>
                          </div>
                          {dashboardOverview.dailyTrend?.length > 0 && (
                            <div>
                              <h3 className="text-sm font-medium mb-2">Workspace Activity (7 days)</h3>
                              <div className="flex items-end gap-1 h-20 px-1">
                                {dashboardOverview.dailyTrend.map((day: { date: string; count: number }) => {
                                  const maxCount = Math.max(...dashboardOverview.dailyTrend.map((d: { count: number }) => d.count));
                                  const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                                  return (
                                    <div key={day.date} className="flex-1 min-w-0">
                                      <div
                                        className="bg-primary/70 hover:bg-primary rounded-t transition-colors w-full"
                                        style={{ height: `${Math.max(height, 4)}%` }}
                                        title={`${day.date}: ${day.count} executions`}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: differentiate Analytics (workspace) vs Monitor (per-bot) tabs"
```

---

### Task 7: Rate limit AI mutations

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (lines 841, 1073, 1126)

**Step 1:** Add rate limit calls at the start of each AI mutation.

In `sendCreatorMessage` (after workspace ownership check, around line 841):

```typescript
      await checkRateLimit(
        `creator:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorMessage ?? { maxRequests: 10, windowMs: 60000 },
      );
```

In `generateTests` (after ownership check, around line 1080):

```typescript
      await checkRateLimit(
        `genTests:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorMessage ?? { maxRequests: 5, windowMs: 60000 },
      );
```

In `analyzeConnections` (after ownership check, around line 1133):

```typescript
      await checkRateLimit(
        `connAnalysis:${ctx.workspace.id}:${ctx.userId}`,
        RATE_LIMITS.creatorMessage ?? { maxRequests: 5, windowMs: 60000 },
      );
```

**Note:** Check `RATE_LIMITS` object location — it's likely defined near the top of the file or imported from a shared module. If `RATE_LIMITS.creatorMessage` doesn't exist, add it to the RATE_LIMITS definition with `{ maxRequests: 10, windowMs: 60000 }`.

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: rate limit sendCreatorMessage, generateTests, analyzeConnections"
```

---

### Task 8: Mobile building indicator

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (around line 1335)

**Step 1:** Add a mobile-only building indicator that shows regardless of which panel is visible. Insert before the mobile panel toggle (around line 1335):

```typescript
              {/* Mobile building indicator — visible when chat panel is hidden */}
              {status === 'building' && mobileView === 'editor' && (
                <div className="md:hidden fixed top-16 left-1/2 -translate-x-1/2 z-40 animate-fade-in">
                  <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{creationProgress?.message ?? 'Building your bot...'}</span>
                  </div>
                </div>
              )}
```

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: show building indicator on mobile when chat panel hidden"
```

---

### Task 9: Input validation UX in ChatInput

**Files:**
- Modify: `apps/web/src/components/creator/ChatInput.tsx`

**Step 1:** Read the ChatInput component to find the exact structure, then add a character count that appears when approaching the limit. Add near the textarea:

```typescript
              {value.length > 8000 && (
                <span className={cn(
                  'absolute bottom-2 right-12 text-[10px]',
                  value.length > 9500 ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {value.length.toLocaleString()}/10,000
                </span>
              )}
```

**Step 2:** Disable the send button when input is too short (< 3 chars) or too long (> 10000):

In the send button's `disabled` prop, add `|| value.trim().length < 3 || value.length > 10000`.

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/components/creator/ChatInput.tsx
git commit -m "feat: add character count and input length validation to ChatInput"
```

---

### Task 10: Cron validation + next-run preview

**Files:**
- Modify: `apps/web/src/components/baleybots/TriggerConfig.tsx` (lines 188-231)

**Step 1:** Add a simple cron validation and next-run calculator. After the cron input field:

```typescript
              {value?.cronExpression && (
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    try {
                      // Basic cron format validation (5 fields)
                      const parts = value.cronExpression.trim().split(/\s+/);
                      if (parts.length !== 5) return <span className="text-red-500">Invalid: expected 5 fields (min hour day month weekday)</span>;
                      return <span className="text-green-600 dark:text-green-400">Valid cron expression</span>;
                    } catch {
                      return <span className="text-red-500">Invalid cron expression</span>;
                    }
                  })()}
                </div>
              )}
```

**Note:** For a proper next-run preview, we'd need `cron-parser` library. For now, basic validation is sufficient. A TODO comment can note the future enhancement.

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/components/baleybots/TriggerConfig.tsx
git commit -m "feat: add basic cron expression validation to trigger config"
```

---

### Task 11: BB Completion trigger sync

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (trigger save effect)
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (saveTriggerConfig mutation)

**Step 1:** In the `saveTriggerConfig` mutation (added in Task 1), after saving to `baleybots.triggers`, also sync with `baleybotTriggers` table when type is `other_bb`:

```typescript
      // Sync BB completion triggers with baleybotTriggers table
      if (input.triggerConfig?.type === 'other_bb' && input.triggerConfig.sourceBaleybotId) {
        // Remove existing triggers for this target bot
        await ctx.db.delete(baleybotTriggers)
          .where(and(
            eq(baleybotTriggers.targetBaleybotId, input.id),
            eq(baleybotTriggers.workspaceId, ctx.workspace.id),
          ));

        // Create new trigger
        await ctx.db.insert(baleybotTriggers).values({
          id: crypto.randomUUID(),
          sourceBaleybotId: input.triggerConfig.sourceBaleybotId,
          targetBaleybotId: input.id,
          triggerEvent: input.triggerConfig.triggerEvent ?? 'completion',
          workspaceId: ctx.workspace.id,
          enabled: true,
        });
      }
```

Add the necessary import for `baleybotTriggers` from the schema if not already imported.

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: sync BB completion triggers with baleybotTriggers table"
```

---

## Sprint 3: Medium-Severity Improvements

### Task 12: Connection analysis re-run on changes

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 730-779)

**Step 1:** Replace the `connectionAnalysisRunRef` with a version counter that resets when bot changes:

```typescript
  const [connectionAnalysisVersion, setConnectionAnalysisVersion] = useState(0);
  const lastAnalyzedCodeRef = useRef<string>('');
```

**Step 2:** Update the connection analysis effect to use the version counter and track analyzed code:

```typescript
  useEffect(() => {
    if (viewMode !== 'connections' || !savedBaleybotId) return;
    if (entities.length === 0 || !balCode) return;
    // Skip if we already analyzed this exact code
    if (lastAnalyzedCodeRef.current === balCode && connectionAnalysisVersion === 0) return;
    lastAnalyzedCodeRef.current = balCode;

    // ... rest of analysis logic (same as before)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, savedBaleybotId, connectionAnalysisVersion, balCode]);
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix: re-run connection analysis when bot code changes"
```

---

### Task 13: Error recovery UX

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 437-451)

**Step 1:** Enhance the error message in the catch block of `handleSendMessage` to include diagnostic metadata with suggestions and a retry option:

Replace the error message construction with:

```typescript
      const errorMessage: CreatorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `${parsed.title}: ${parsed.message}${parsed.action ? ` ${parsed.action}` : ''}`,
        timestamp: new Date(),
        metadata: {
          isError: true,
          diagnostic: {
            level: 'error',
            title: parsed.title,
            details: parsed.message,
            suggestions: [
              'Try simplifying your request',
              'Check your AI provider connection in Settings',
              'Try one of the example prompts below',
            ],
          },
          options: [
            { id: 'retry', label: 'Retry', description: 'Send the same message again', icon: '🔄' },
            { id: 'simplify', label: 'Start Simple', description: 'Try with a basic bot first', icon: '✨' },
          ],
        },
      };
```

**Step 2:** In the `handleOptionSelect` function, handle the retry option:

```typescript
  const handleOptionSelect = (optionId: string) => {
    if (optionId === 'retry') {
      // Re-send the last user message
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) handleSendMessage(lastUserMsg.content);
      return;
    }
    if (optionId === 'simplify') {
      handleSendMessage('Create a simple assistant that helps answer questions');
      return;
    }
    handleSendMessage(optionId);
  };
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: add error recovery UX with retry and simplify options"
```

---

### Task 14: Smarter test comparison

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 894-901)

**Step 1:** Replace the naive comparison with a multi-strategy approach:

```typescript
      // Determine if test passed
      let testPassed = execution.status === 'completed';
      if (testPassed && test.expectedOutput && actualOutput) {
        const expected = test.expectedOutput.trim();
        const actual = actualOutput;

        // Strategy 1: Try JSON comparison (for structured outputs)
        try {
          const expectedJson = JSON.parse(expected);
          const actualJson = JSON.parse(actual);
          testPassed = JSON.stringify(expectedJson) === JSON.stringify(actualJson);
        } catch {
          // Strategy 2: Case-insensitive substring match
          testPassed = actual.toLowerCase().includes(expected.toLowerCase());
        }

        if (!testPassed) {
          // Strategy 3: Check if all key words from expected are present
          const expectedWords = expected.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const matchedWords = expectedWords.filter(w => actual.toLowerCase().includes(w));
          if (matchedWords.length >= expectedWords.length * 0.8) {
            testPassed = true; // 80% keyword match
          }
        }
      }
```

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: upgrade test comparison with JSON and keyword matching"
```

---

### Task 15: Test execution timeout + parallel run

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 874-929)

**Step 1:** Add timeout to `handleRunTest` by wrapping the mutation in `Promise.race`:

```typescript
    try {
      const test = testCases.find(t => t.id === testId);
      if (!test || !savedBaleybotId) return;

      // Timeout after 60 seconds
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Test execution timed out after 60 seconds')), 60000)
      );

      const execution = await Promise.race([
        executeMutation.mutateAsync({
          id: savedBaleybotId,
          input: test.input,
          triggeredBy: 'manual',
        }),
        timeoutPromise,
      ]);
      // ... rest of handler
```

**Step 2:** Update `handleRunAllTests` to run in parallel batches of 3:

```typescript
  const handleRunAllTests = async () => {
    const batchSize = 3;
    for (let i = 0; i < testCases.length; i += batchSize) {
      const batch = testCases.slice(i, i + batchSize);
      await Promise.all(batch.map(test => handleRunTest(test.id)));
    }
  };
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: add 60s timeout to test execution, run tests in parallel batches"
```

---

### Task 16: Wire deployment_advisor to Triggers tab

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (add `analyzeDeployment` mutation)
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (triggers tab)

**Step 1:** Add `analyzeDeployment` mutation to baleybots router (after `analyzeConnections`):

```typescript
  analyzeDeployment: protectedProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entityNames: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(eq(baleybots.id, input.baleybotId), eq(baleybots.workspaceId, ctx.workspace.id), notDeleted(baleybots)),
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await checkRateLimit(`deploy:${ctx.workspace.id}:${ctx.userId}`, RATE_LIMITS.creatorMessage ?? { maxRequests: 5, windowMs: 60000 });

      const contextStr = `Bot: ${existing.name}\nEntities: ${input.entityNames.join(', ')}\n\nBAL Code:\n${input.balCode}`;
      const { output } = await executeInternalBaleybot('deployment_advisor', `Analyze deployment for this BaleyBot:\n${contextStr}`, {
        userWorkspaceId: ctx.workspace.id,
        triggeredBy: 'internal',
      });

      const schema = z.object({
        triggerRecommendations: z.array(z.object({ type: z.string(), reason: z.string(), config: z.unknown().optional() })).optional(),
        monitoringAdvice: z.object({ alertsToSet: z.array(z.string()).optional(), metricsToWatch: z.array(z.string()).optional() }).optional(),
        readinessGaps: z.array(z.string()).optional(),
        productionChecklist: z.array(z.string()).optional(),
      });

      try {
        return schema.parse(output);
      } catch {
        return { triggerRecommendations: [], readinessGaps: ['Deployment analysis returned unexpected format.'], productionChecklist: [] };
      }
    }),
```

**Step 2:** In page.tsx, add deployment advisor call when triggers tab opens (similar pattern to connection analysis). Add a `deploymentAnalysisRunRef` and call `analyzeDeployment` on first open.

**Step 3:** Display recommendations above the TriggerConfig in the triggers view as a diagnostic card.

**Step 4:** Run `pnpm type-check` — Expected: PASS

**Step 5:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: wire deployment_advisor BB to triggers tab"
```

---

### Task 17: Optimistic locking on test case saves

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (saveTestCases mutation)

**Step 1:** Replace the direct update with `updateWithLock`:

Find the `saveTestCases` mutation (around line 1053) and replace:

```typescript
      await ctx.db.update(baleybots)
        .set({ testCasesJson: input.testCases, updatedAt: new Date() })
        .where(eq(baleybots.id, input.id));
```

With:

```typescript
      await updateWithLock(baleybots, input.id, existing.version, {
        testCasesJson: input.testCases,
        updatedAt: new Date(),
      });
```

The `existing` variable should already be fetched by the ownership check above.

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix: use optimistic locking for test case saves"
```

---

## Sprint 4: Polish

### Task 18: Wire hub topology to visual editor

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (visual editor section)

**Step 1:** Import and use `detectHubTopology`:

```typescript
import { detectHubTopology } from '@/lib/baleybot/hub-detection';
```

**Step 2:** Before the VisualEditor render, compute hub topology and display a badge if detected:

```typescript
                  {viewMode === 'visual' && (
                    <div className="h-full relative">
                      {(() => {
                        const hub = detectHubTopology(entities);
                        if (hub) {
                          return (
                            <div className="absolute top-2 left-2 z-10 bg-primary/10 border border-primary/20 text-primary text-xs px-2 py-1 rounded-full">
                              Hub: {hub.hub.entityName} → {hub.spokes.length} spoke{hub.spokes.length !== 1 ? 's' : ''}
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <VisualEditor ... />
                    </div>
                  )}
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: show hub topology badge in visual editor"
```

---

### Task 19: BAL code inline + entity animation

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (lines 358-433)

**Step 1:** In the assistant message metadata (around line 410), add `codeBlock` for the generated BAL:

```typescript
      codeBlock: {
        language: 'bal',
        code: result.balCode.length > 500 ? result.balCode.slice(0, 500) + '\n// ... (click Code tab for full code)' : result.balCode,
        filename: `${result.name ?? 'baleybot'}.bal`,
      },
```

**Step 2:** For entity animation, when setting entities (around line 325), use `'appearing'` status:

```typescript
      const visualEntities: VisualEntity[] = result.entities.map((entity, index) => ({
        ...entity,
        position: { x: 0, y: 0 },
        status: 'appearing' as const,
      }));
      setEntities(visualEntities);

      // Transition to stable after animation
      setTimeout(() => {
        setEntities(prev => prev.map(e => ({ ...e, status: 'stable' as const })));
      }, 600);
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "feat: show BAL code inline in chat, animate entity reveals"
```

---

### Task 20: Missing CSS + minor polish

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (example prompts)

**Step 1:** Verify `animate-pulse-soft` exists in globals.css. If missing, add to `@layer utilities`:

```css
  .animate-pulse-soft {
    animation: pulse-soft 2s ease-in-out infinite;
  }
```

And the keyframe if missing:

```css
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Step 2:** Update example prompts (around line 77 in page.tsx) to showcase unique capabilities:

```typescript
const EXAMPLE_PROMPTS = [
  { label: 'Research & summarize', prompt: 'Create a bot that searches the web for a topic, fetches the top 3 results, and summarizes them into a concise report' },
  { label: 'Data pipeline', prompt: 'Build a bot that reads data from a database, analyzes it, and sends me a notification with insights' },
  { label: 'Multi-bot workflow', prompt: 'Create a team of bots: one that monitors websites for changes and another that summarizes the changes into a daily digest' },
  { label: 'Simple assistant', prompt: 'Create a helpful assistant that can search the web and answer questions' },
];
```

**Step 3:** Run `pnpm type-check && pnpm lint` — Expected: PASS

**Step 4:** Commit

```bash
git add apps/web/src/app/globals.css apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "chore: fix missing CSS animations, enhance example prompts"
```

---

### Task 21: Final verification

**Step 1:** Run full verification:

```bash
pnpm type-check && pnpm test && pnpm lint
```

Expected: All pass with 0 TypeScript errors, 0 lint errors, all tests passing.

**Step 2:** If any issues found, fix them.

**Step 3:** Final commit:

```bash
git add -A && git commit -m "chore: final verification cleanup" --allow-empty
```

---

## Critical Files Summary

| File | Tasks | Action |
|------|-------|--------|
| `apps/web/src/lib/trpc/routers/baleybots.ts` | 1,2,7,11,16,17 | **Major modify** |
| `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` | 1,3,5,6,8,12,13,14,15,16,18,19,20 | **Major modify** |
| `apps/web/src/components/creator/ConversationThread.tsx` | 3 | Modify |
| `apps/web/src/lib/baleybot/creator-types.ts` | 3 | Modify |
| `apps/web/src/components/baleybots/TriggerConfig.tsx` | 4,10 | Modify |
| `apps/web/src/components/creator/ChatInput.tsx` | 9 | Modify |
| `apps/web/src/app/globals.css` | 20 | Modify |

## Reusable Existing Code

- `updateWithLock()`: `@baleyui/db` — all DB updates with version checking
- `checkRateLimit()`: Already used in `execute` mutation (line 415)
- `RATE_LIMITS`: Defined near top of baleybots.ts
- `executeInternalBaleybot()`: `apps/web/src/lib/baleybot/internal-baleybots.ts:344`
- `detectHubTopology()`: `apps/web/src/lib/baleybot/hub-detection.ts`
- `getDashboardOverview`: `apps/web/src/lib/trpc/routers/analytics.ts:545`
- `baleybotTriggers`: `packages/db/src/schema.ts:798`
- `baleybots.triggers`: `packages/db/src/schema.ts:243` (jsonb column)
