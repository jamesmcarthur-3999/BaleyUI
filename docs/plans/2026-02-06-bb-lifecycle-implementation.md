# BB Lifecycle — Plug the Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire all stub/placeholder lifecycle features into working end-to-end functionality — test generation via AI, test persistence, rich chat metadata production, specialist BB orchestration, readiness accuracy, and option selection handling.

**Architecture:** The page.tsx orchestrates by building a `SessionContext` from current state and calling `executeInternalBaleybot()` for specialist tasks (test generation, connection advice). Results are transformed into `MessageMetadata` for rich chat rendering and into state updates for the readiness machine. Test cases persist via a new tRPC mutation that stores them as JSON on the `baleybots` row (no new table needed — YAGNI).

**Tech Stack:** Next.js 15, React 19, TypeScript, tRPC, Drizzle ORM, Vitest, shadcn/ui, Tailwind CSS.

**Design doc:** `docs/plans/2026-02-06-bb-creation-lifecycle-redesign.md`

---

## Dependency Graph

```
Task 1 (Fix readiness computation) ── no deps
Task 2 (Test persistence) ── no deps
Task 3 (Wire test_generator BB) ── needs Task 2
Task 4 (Wire option selection) ── no deps
Task 5 (Enrich creator bot metadata) ── needs Task 4
Task 6 (Wire connection_advisor) ── needs Task 5
Task 7 (Wire monitoring readiness) ── no deps
Task 8 (Test assertion logic) ── needs Task 2
Task 9 (Remove dead code) ── after all others
```

---

## Task 1: Fix readiness "connected" dimension

The readiness computation only checks for AI provider. It should also check tool-specific connection requirements.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx:660-679`

**Step 1:** Replace the readiness computation effect (lines 660-679):

```typescript
  // Compute readiness whenever relevant state changes
  useEffect(() => {
    const allTools = entities.flatMap(e => e.tools);
    const wsConns = workspaceConnections ?? [];
    const connectedTypes = new Set(wsConns.filter(c => c.status === 'connected').map(c => c.type));
    const hasAiProvider = connectedTypes.has('openai') || connectedTypes.has('anthropic') || connectedTypes.has('ollama');

    // Check tool-specific connection requirements
    const summary = getConnectionSummary(allTools);
    const toolRequirementsMet = summary.required.every(req =>
      wsConns.some(c => c.type === req.connectionType && (c.status === 'connected' || c.status === 'unconfigured'))
    );
    const allConnectionsMet = hasAiProvider && (summary.required.length === 0 || toolRequirementsMet);

    const newReadiness = computeReadiness({
      hasBalCode: balCode.length > 0,
      hasEntities: entities.length > 0,
      tools: allTools,
      connectionsMet: allConnectionsMet,
      hasConnections: wsConns.length > 0,
      testsPassed: testCases.length > 0 && testCases.every(t => t.status === 'passed'),
      hasTestRuns: testCases.filter(t => t.status !== 'pending').length,
      hasTrigger: !!triggerConfig,
      hasMonitoring: false, // Task 7 will wire this
    });
    setReadiness(newReadiness);
  }, [balCode, entities, testCases, triggerConfig, workspaceConnections]);
```

**Step 2:** Add import at top of page.tsx:

```typescript
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';
```

**Step 3:** Fetch connections eagerly (not just when on connections tab) so readiness is accurate. Change line 253-256 — remove `{ enabled: viewMode === 'connections' }`:

```typescript
  // Fetch workspace connections (for connections panel AND readiness computation)
  const { data: workspaceConnections, isLoading: isLoadingConnections } = trpc.connections.list.useQuery(
    { limit: 50 },
  );
```

**Step 4:** Run `pnpm type-check` — Expected: PASS

**Step 5:** Commit:
```bash
git add 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "fix: readiness 'connected' dimension checks tool requirements, not just AI provider"
```

---

## Task 2: Add test case persistence

Test cases currently live only in React state and are lost on reload. Store them as JSON on the baleybots row.

**Files:**
- Modify: `packages/db/src/schema.ts` (add `testCasesJson` column to baleybots table)
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (add `saveTestCases` mutation)
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` (load on init, auto-save on change)

**Step 1:** Add `testCasesJson` column to baleybots table in `packages/db/src/schema.ts`. Find the baleybots table definition and add after the `triggerConfig` column:

```typescript
  /** Persisted test cases for the lifecycle test panel */
  testCasesJson: jsonb('test_cases_json').default([]),
```

**Step 2:** Run `pnpm db:push` to apply schema change.

**Step 3:** Add a `saveTestCases` mutation to `apps/web/src/lib/trpc/routers/baleybots.ts`. Add near the other mutations:

```typescript
  saveTestCases: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      testCases: z.array(z.object({
        id: z.string(),
        name: z.string(),
        level: z.enum(['unit', 'integration', 'e2e']),
        input: z.string(),
        expectedOutput: z.string().optional(),
        status: z.enum(['pending', 'running', 'passed', 'failed']),
        actualOutput: z.string().optional(),
        error: z.string().optional(),
        durationMs: z.number().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });

      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      await ctx.db.update(baleybots)
        .set({ testCasesJson: input.testCases, updatedAt: new Date() })
        .where(eq(baleybots.id, input.id));

      return { success: true };
    }),
```

**Step 4:** In page.tsx, load test cases from existing BaleyBot on init. In the `useEffect` that initializes state from existing BaleyBot (around line 751), after setting other state, add:

```typescript
      // Load persisted test cases
      if (existingBaleybot.testCasesJson && Array.isArray(existingBaleybot.testCasesJson)) {
        setTestCases(existingBaleybot.testCasesJson as TestCase[]);
      }
```

**Step 5:** Add a save mutation and auto-save effect in page.tsx:

```typescript
  const saveTestsMutation = trpc.baleybots.saveTestCases.useMutation();
```

Add a debounced save effect after test state changes:

```typescript
  // Auto-save test cases when they change (debounced)
  useEffect(() => {
    if (!savedBaleybotId || testCases.length === 0) return;
    const timeout = setTimeout(() => {
      saveTestsMutation.mutate({
        id: savedBaleybotId,
        testCases: testCases.map(t => ({
          ...t,
          // Reset running status to pending on save (can't persist mid-run)
          status: t.status === 'running' ? 'pending' : t.status,
        })),
      });
    }, 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testCases, savedBaleybotId]);
```

**Step 6:** Run `pnpm type-check` — Expected: PASS

**Step 7:** Run `pnpm test` — Expected: PASS (existing tests unaffected)

**Step 8:** Commit:
```bash
git add packages/db/src/schema.ts 'apps/web/src/lib/trpc/routers/baleybots.ts' 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: persist test cases on baleybots row, auto-save on change"
```

---

## Task 3: Wire test_generator internal BB

Replace the stub `handleGenerateTests` with a real call to the `test_generator` internal BB.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (add `generateTests` mutation)
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx:685-699`

**Step 1:** Add a server-side `generateTests` mutation to `baleybots.ts`:

```typescript
  generateTests: protectedProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entities: z.array(z.object({
        name: z.string(),
        tools: z.array(z.string()),
        purpose: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      const contextStr = [
        `Bot: ${baleybot.name}`,
        `Entities: ${input.entities.map(e => `${e.name} (${e.tools.join(', ')})`).join('; ')}`,
        '',
        'BAL Code:',
        input.balCode,
      ].join('\n');

      const { output } = await executeInternalBaleybot(
        'test_generator',
        `Generate comprehensive tests for this BaleyBot:\n${contextStr}`,
        {
          userWorkspaceId: ctx.workspace.id,
          triggeredBy: 'internal',
        }
      );

      return output as {
        tests: Array<{
          name: string;
          level: 'unit' | 'integration' | 'e2e';
          input: string;
          expectedOutput?: string;
          description: string;
        }>;
        strategy: string;
      };
    }),
```

Add the import at top of baleybots.ts if not present:
```typescript
import { executeInternalBaleybot } from '@/lib/baleybot/internal-baleybots';
```

**Step 2:** Replace `handleGenerateTests` in page.tsx (lines 685-699):

```typescript
  const generateTestsMutation = trpc.baleybots.generateTests.useMutation();

  const handleGenerateTests = async () => {
    if (!savedBaleybotId) return;
    setIsGeneratingTests(true);

    try {
      const result = await generateTestsMutation.mutateAsync({
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({
          name: e.name,
          tools: e.tools,
          purpose: e.purpose || e.name,
        })),
      });

      const generated: TestCase[] = result.tests.map((test, i) => ({
        id: `test-${Date.now()}-${i}`,
        name: test.name,
        level: test.level,
        input: test.input,
        expectedOutput: test.expectedOutput,
        status: 'pending' as const,
      }));

      setTestCases(prev => [...prev, ...generated]);

      // Add assistant message with test plan metadata
      const testMessage: CreatorMessage = {
        id: `msg-${Date.now()}-tests`,
        role: 'assistant',
        content: `Generated ${generated.length} tests. Strategy: ${result.strategy}`,
        timestamp: new Date(),
        metadata: {
          testPlan: {
            tests: generated.map(t => ({
              id: t.id,
              name: t.name,
              level: t.level,
              status: t.status,
              input: t.input,
              expectedOutput: t.expectedOutput,
            })),
            summary: result.strategy,
          },
        },
      };
      setMessages(prev => [...prev, testMessage]);
    } catch (error) {
      console.error('Test generation failed:', error);
      const errorMsg: CreatorMessage = {
        id: `msg-${Date.now()}-testerr`,
        role: 'assistant',
        content: 'Failed to generate tests. Please try again.',
        timestamp: new Date(),
        metadata: {
          isError: true,
          diagnostic: {
            level: 'error',
            title: 'Test Generation Failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            suggestions: ['Make sure your bot has been saved first', 'Check that an AI provider is connected'],
          },
        },
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGeneratingTests(false);
    }
  };
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit:
```bash
git add 'apps/web/src/lib/trpc/routers/baleybots.ts' 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: wire test_generator BB for real AI test generation"
```

---

## Task 4: Wire onOptionSelect handler

The option selection callback flows through components but is never handled in page.tsx.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Add the handler function (after `handleAddTest`, around line 744):

```typescript
  const handleOptionSelect = (optionId: string) => {
    handleSendMessage(`I'd like to go with: ${optionId}`);
  };
```

**Step 2:** Pass it to LeftPanel. Find where LeftPanel is rendered and add `onOptionSelect={handleOptionSelect}`.

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit:
```bash
git add 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: wire onOptionSelect to send choice as creator message"
```

---

## Task 5: Enrich creator bot responses with rich metadata

After the creator bot responds, populate connectionStatus and diagnostic metadata fields on the assistant message.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx:381-391`

**Step 1:** Replace the assistant message construction (lines 381-391) with enriched version:

```typescript
      // Build rich metadata for the assistant message
      const metadata: CreatorMessage['metadata'] = {
        entities: entityMetadata,
        isInitialCreation,
      };

      // Add connection status if bot uses tools requiring connections
      const toolSummary = getConnectionSummary(visualEntities.flatMap(e => e.tools));
      if (toolSummary.required.length > 0) {
        const wsConns = workspaceConnections ?? [];
        metadata.connectionStatus = {
          connections: [
            {
              name: 'AI Provider',
              type: 'ai',
              status: wsConns.some(c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected')
                ? 'connected' : 'missing',
            },
            ...toolSummary.required.map(req => ({
              name: req.connectionType,
              type: req.connectionType,
              status: wsConns.some(c => c.type === req.connectionType && c.status === 'connected')
                ? 'connected' as const : 'missing' as const,
              requiredBy: req.tools,
            })),
          ],
        };
      }

      // Add diagnostic for initial creation with next steps
      if (isInitialCreation) {
        metadata.diagnostic = {
          level: 'success',
          title: 'Bot Created',
          details: `${visualEntities.length} ${visualEntities.length === 1 ? 'entity' : 'entities'} ready.`,
          suggestions: [
            'Switch to the Test tab to generate and run tests',
            toolSummary.required.length > 0 ? 'Check the Connections tab to verify required connections' : undefined,
            'Try editing the code in the Code tab',
          ].filter((s): s is string => !!s),
        };
      }

      const assistantMessage: CreatorMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: responseContent.trim(),
        timestamp: new Date(),
        thinking: result.thinking || undefined,
        metadata,
      };
      setMessages((prev) => [...prev, assistantMessage]);
```

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit:
```bash
git add 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: enrich creator responses with connection status and diagnostic metadata"
```

---

## Task 6: Wire connection_advisor BB on connections tab

When the user first views the connections tab, call connection_advisor to provide intelligent analysis.

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (add `analyzeConnections` mutation)
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Add `analyzeConnections` mutation to baleybots.ts:

```typescript
  analyzeConnections: protectedProcedure
    .input(z.object({
      baleybotId: z.string().uuid(),
      balCode: z.string(),
      entities: z.array(z.object({
        name: z.string(),
        tools: z.array(z.string()),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.baleybotId),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted(baleybots),
        ),
      });
      if (!baleybot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'BaleyBot not found' });
      }

      const contextStr = [
        `Bot: ${baleybot.name}`,
        `Entities: ${input.entities.map(e => `${e.name} (${e.tools.join(', ')})`).join('; ')}`,
        '',
        'BAL Code:',
        input.balCode,
      ].join('\n');

      const { output } = await executeInternalBaleybot(
        'connection_advisor',
        `Analyze connection requirements:\n${contextStr}`,
        {
          userWorkspaceId: ctx.workspace.id,
          triggeredBy: 'internal',
        }
      );

      return output as {
        analysis: {
          aiProvider: { needed: boolean; recommended?: string; reason: string };
          databases: Array<{ type: string; tools: string[]; configHints?: string }>;
          external: Array<{ service: string; reason: string }>;
        };
        recommendations: string[];
        warnings: string[];
      };
    }),
```

**Step 2:** In page.tsx, add a connection analysis effect that runs once when the connections tab is first opened and the bot has been saved:

```typescript
  const analyzeConnectionsMutation = trpc.baleybots.analyzeConnections.useMutation();
  const connectionAnalysisRunRef = useRef(false);

  useEffect(() => {
    if (viewMode !== 'connections' || !savedBaleybotId || connectionAnalysisRunRef.current) return;
    if (entities.length === 0 || !balCode) return;
    connectionAnalysisRunRef.current = true;

    analyzeConnectionsMutation.mutate(
      {
        baleybotId: savedBaleybotId,
        balCode,
        entities: entities.map(e => ({ name: e.name, tools: e.tools })),
      },
      {
        onSuccess: (result) => {
          const msg: CreatorMessage = {
            id: `msg-${Date.now()}-connadvice`,
            role: 'assistant',
            content: result.recommendations.join(' ') || 'Connection analysis complete.',
            timestamp: new Date(),
            metadata: {
              connectionStatus: {
                connections: [
                  {
                    name: 'AI Provider',
                    type: result.analysis.aiProvider.recommended || 'ai',
                    status: (workspaceConnections ?? []).some(c =>
                      ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
                    ) ? 'connected' : 'missing',
                  },
                  ...result.analysis.databases.map(db => ({
                    name: db.type,
                    type: db.type,
                    status: 'missing' as const,
                    requiredBy: db.tools,
                  })),
                ],
              },
              diagnostic: result.warnings.length > 0
                ? { level: 'warning' as const, title: 'Connection Warnings', suggestions: result.warnings }
                : undefined,
            },
          };
          setMessages(prev => [...prev, msg]);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, savedBaleybotId]);
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit:
```bash
git add 'apps/web/src/lib/trpc/routers/baleybots.ts' 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: wire connection_advisor BB for intelligent connection analysis"
```

---

## Task 7: Wire monitoring readiness from analytics

Replace the hardcoded `hasMonitoring: false` with real computation from analytics data.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Step 1:** Fetch analytics eagerly (not just when on analytics/monitor tab). Change lines 259-262:

```typescript
  // Fetch per-bot analytics (for readiness computation and display)
  const { data: analyticsData, isLoading: isLoadingAnalytics } = trpc.analytics.getBaleybotAnalytics.useQuery(
    { baleybotId: savedBaleybotId! },
    { enabled: !!savedBaleybotId },
  );
```

**Step 2:** Update the readiness computation to use analytics data. Replace `hasMonitoring: false` (line 676):

```typescript
      hasMonitoring: (analyticsData?.total ?? 0) >= 1,
```

Add `analyticsData` to the effect dependency array:

```typescript
  }, [balCode, entities, testCases, triggerConfig, workspaceConnections, analyticsData]);
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit:
```bash
git add 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "fix: wire monitoring readiness from actual analytics data"
```

---

## Task 8: Add test assertion logic

Currently tests pass if execution completes, regardless of output. Add actual expectedOutput comparison.

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx:701-734`

**Step 1:** Replace `handleRunTest` with assertion-aware version (lines 701-734):

```typescript
  const handleRunTest = async (testId: string) => {
    setTestCases(prev => prev.map(t =>
      t.id === testId ? { ...t, status: 'running' as const } : t
    ));

    try {
      const test = testCases.find(t => t.id === testId);
      if (!test || !savedBaleybotId) return;

      const execution = await executeMutation.mutateAsync({
        id: savedBaleybotId,
        input: test.input,
        triggeredBy: 'manual',
      });

      const actualOutput = execution.output != null
        ? (typeof execution.output === 'string' ? execution.output : JSON.stringify(execution.output, null, 2))
        : undefined;

      // Determine pass/fail
      let testPassed = execution.status === 'completed';

      // If there's an expected output, check if actual output contains it
      if (testPassed && test.expectedOutput && actualOutput) {
        const expected = test.expectedOutput.toLowerCase().trim();
        const actual = actualOutput.toLowerCase();
        testPassed = actual.includes(expected);
      }

      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? {
              ...t,
              status: testPassed ? 'passed' as const : 'failed' as const,
              actualOutput,
              error: execution.error || (!testPassed && test.expectedOutput
                ? `Output did not contain expected: "${test.expectedOutput}"`
                : undefined),
              durationMs: execution.durationMs ?? undefined,
            }
          : t
      ));
    } catch (error: unknown) {
      setTestCases(prev => prev.map(t =>
        t.id === testId
          ? { ...t, status: 'failed' as const, error: error instanceof Error ? error.message : 'Unknown error' }
          : t
      ));
    }
  };
```

**Step 2:** Run `pnpm type-check` — Expected: PASS

**Step 3:** Commit:
```bash
git add 'apps/web/src/app/dashboard/baleybots/[id]/page.tsx'
git commit -m "feat: add test assertion logic comparing expectedOutput to actualOutput"
```

---

## Task 9: Remove dead code and clean up

Remove unused code paths.

**Files:**
- Modify: `apps/web/src/components/creator/MonitorPanel.tsx`

**Step 1:** In `MonitorPanel.tsx`, remove the pause/resume props and UI since there's no backend for it.

Remove from interface: `isPaused?: boolean;` and `onPauseToggle?: () => void;`

Remove from function signature: `isPaused = false,` and `onPauseToggle,`

Remove the pause button JSX block (lines 102-107).

Remove unused imports: `Pause`, `Play`.

**Step 2:** Run `pnpm type-check && pnpm test && pnpm lint` — Expected: All PASS

**Step 3:** Commit:
```bash
git add apps/web/src/components/creator/MonitorPanel.tsx
git commit -m "chore: remove dead pause/resume code from MonitorPanel"
```

---

## Final Verification

```bash
pnpm type-check && pnpm test && pnpm lint && pnpm build
```

Expected: All pass. 0 TypeScript errors, 0 lint errors, all tests passing, build succeeds.

---

## What's NOT in this plan (intentionally)

- **Hub topology visual rendering** — `detectHubTopology` is tested and ready, but wiring it into the visual editor canvas is a separate visual design task.
- **deployment_advisor / integration_builder** — These are "phase 2" specialist BBs that make sense only after the core lifecycle works end-to-end. They can be wired as conversational commands via the chat once the option selection + metadata patterns are proven.
- **Trigger config persistence** — Triggers are already saved via the `saveFromSession` mutation's `triggerConfig` field. If the existing save flow doesn't persist it, that's a bug fix, not a lifecycle gap.
- **Schema builder bidirectional sync** — Editing the schema and auto-updating BAL code is a compiler feature, not a lifecycle feature.

## Critical Files Summary

| File | Tasks | Action |
|------|-------|--------|
| `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` | 1-8 | **Major modify** |
| `apps/web/src/lib/trpc/routers/baleybots.ts` | 2,3,6 | Modify (3 new mutations) |
| `packages/db/src/schema.ts` | 2 | Modify (1 new column) |
| `apps/web/src/components/creator/MonitorPanel.tsx` | 9 | Modify (remove dead code) |
