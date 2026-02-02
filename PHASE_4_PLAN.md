# Phase 4: Intelligence & Evolution

## Overview

Phase 4 enables the AI→Code evolution cycle. We extract patterns from AI decisions, generate deterministic code, and enable hybrid operation for massive cost/latency savings.

---

## 4.1 Pattern Extraction

### Goal
Analyze decision history to find repeatable rules that can be converted to code.

### Tasks

1. **Pattern Analyzer Service** (`lib/patterns/pattern-analyzer.ts`)
   - Analyze decisions grouped by output values
   - Detect input patterns that consistently lead to same outputs
   - Calculate confidence scores (support count, consistency %)
   - Identify edge cases that resist pattern detection

2. **Pattern Types**
   - Threshold patterns: `IF amount > X → action`
   - Set membership: `IF domain IN ['list', ...]  → action`
   - Compound conditions: `IF A AND B → action`
   - Numeric scoring: `IF condition → +N points`

3. **Pattern UI Components**
   - `PatternAnalyzerPanel.tsx` - Main analysis view
   - `PatternCard.tsx` - Individual pattern display with samples
   - `PatternDistributionChart.tsx` - Output distribution visualization
   - `PatternSampleViewer.tsx` - View decision samples for pattern

### Files to Create
```
apps/web/src/lib/patterns/
├── pattern-analyzer.ts      # Core analysis logic
├── pattern-detector.ts      # Pattern detection algorithms
├── confidence-scorer.ts     # Confidence calculation
└── types.ts                 # Pattern type definitions

apps/web/src/components/patterns/
├── PatternAnalyzerPanel.tsx
├── PatternCard.tsx
├── PatternDistributionChart.tsx
└── PatternSampleViewer.tsx

apps/web/src/app/dashboard/blocks/[id]/patterns/page.tsx
```

---

## 4.2 Code Generation

### Goal
Convert detected patterns into TypeScript Deterministic blocks.

### Tasks

1. **Code Generator Service** (`lib/codegen/code-generator.ts`)
   - Convert patterns to TypeScript code
   - Generate proper Zod schema from output structure
   - Handle multiple pattern types (threshold, set, compound)
   - Include confidence comments in generated code

2. **Historical Testing**
   - Run generated code against past decisions
   - Calculate accuracy percentage
   - Identify mismatches for review

3. **Code Preview UI**
   - `CodePreview.tsx` - Syntax-highlighted code display
   - `CodeEditor.tsx` - Editable code with validation
   - `AccuracyReport.tsx` - Historical test results

### Files to Create
```
apps/web/src/lib/codegen/
├── code-generator.ts        # Pattern → TypeScript
├── template-builder.ts      # Code template generation
├── historical-tester.ts     # Test against past decisions
└── types.ts

apps/web/src/components/codegen/
├── CodePreview.tsx
├── CodeEditor.tsx
├── AccuracyReport.tsx
└── GenerateCodeDialog.tsx

apps/web/src/lib/trpc/routers/codegen.ts
```

---

## 4.3 Hybrid Mode

### Goal
Enable blocks to run in different execution modes: AI only, Code only, Hybrid, or A/B test.

### Tasks

1. **Execution Mode System**
   - Add `executionMode` field to blocks schema
   - Modes: `ai_only`, `code_only`, `hybrid`, `ab_test`
   - Store generated code in `generatedCode` field
   - Track fallback occurrences

2. **Hybrid Execution Logic**
   - Pattern matcher determines if code can handle input
   - Route to code or AI based on confidence
   - Log all fallback decisions for analysis

3. **Mode Selector UI**
   - `ExecutionModeSelector.tsx` - Mode picker with descriptions
   - `HybridSettings.tsx` - Confidence threshold, fallback triggers
   - `FallbackLog.tsx` - View when AI fallback occurred

### Schema Updates
```typescript
// blocks table additions
executionMode: varchar('execution_mode', { length: 50 }).default('ai_only'),
generatedCode: text('generated_code'),
codeGeneratedAt: timestamp('code_generated_at'),
codeAccuracy: decimal('code_accuracy', { precision: 5, scale: 2 }),
```

### Files to Create
```
apps/web/src/lib/execution/
├── mode-router.ts           # Route based on execution mode
├── pattern-matcher.ts       # Check if code can handle input
└── fallback-tracker.ts      # Track AI fallbacks

apps/web/src/components/blocks/
├── ExecutionModeSelector.tsx
├── HybridSettings.tsx
└── FallbackLog.tsx
```

---

## 4.4 Analytics Dashboard

### Goal
Provide visibility into costs, latency, and enable training data export.

### Tasks

1. **Cost Analytics**
   - Per-block cost breakdown
   - Per-model cost comparison
   - Projected savings from hybrid mode
   - Historical cost trends

2. **Latency Analytics**
   - P50, P95, P99 latency metrics
   - Latency by model comparison
   - Code vs AI latency comparison

3. **Training Export**
   - Export decisions as JSONL for fine-tuning
   - Filter by block, date range, feedback status
   - Include input/output pairs with metadata

### Files to Create
```
apps/web/src/app/dashboard/analytics/
├── page.tsx                 # Analytics overview
├── costs/page.tsx           # Cost breakdown
├── latency/page.tsx         # Latency metrics
└── export/page.tsx          # Training data export

apps/web/src/components/analytics/
├── CostDashboard.tsx
├── CostBreakdownChart.tsx
├── LatencyDashboard.tsx
├── LatencyPercentileChart.tsx
├── ExportPanel.tsx
└── SavingsProjection.tsx

apps/web/src/lib/trpc/routers/analytics.ts
```

---

## Implementation Order

| Task | Priority | Agent Assignment |
|------|----------|------------------|
| 4.1 Pattern Extraction | P0 | Agent 1 |
| 4.2 Code Generation | P0 | Agent 2 |
| 4.3 Hybrid Mode | P1 | Agent 3 |
| 4.4 Analytics Dashboard | P1 | Agent 4 |

---

## Success Criteria

- [ ] Can analyze decisions and see extracted patterns with confidence scores
- [ ] Can generate Function block code from patterns
- [ ] Generated code achieves 80%+ accuracy on historical data
- [ ] Can run in Hybrid mode (code + AI fallback)
- [ ] Can swap AI block for Function block without breaking flow
- [ ] Can A/B test AI vs Code with live metrics
- [ ] Can export training data in JSONL format
- [ ] Cost savings visible in analytics dashboard
