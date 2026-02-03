# BaleyUI Improvement Tasks

**Generated:** January 30, 2026
**Reference:** See `AUDIT_REPORT.md` for full analysis

---

## Phase 1: Critical Fixes (P0)

### 1.1 Type Safety Remediation

- [ ] **Fix CompiledNode type mismatch**
  - File: `/apps/web/src/lib/execution/types.ts:189-195`
  - Change `incomingEdges: string[]` to `Array<{ sourceId: string; sourceHandle?: string }>`
  - Change `outgoingEdges: string[]` to `Array<{ targetId: string; targetHandle?: string }>`

- [ ] **Replace `any` types in blocks router**
  - File: `/apps/web/src/lib/trpc/routers/blocks.ts`
  - Line 56: `any[]` → `Array<typeof tools.$inferSelect>`
  - Line 258: `any` → `Partial<typeof blocks.$inferInsert>`

- [ ] **Replace `any` types in BlockEditor**
  - File: `/apps/web/src/components/blocks/BlockEditor.tsx`
  - Line 21: Type the block state properly
  - Line 106: Type the onChange handler

- [ ] **Replace `any` types in flow store**
  - File: `/apps/web/src/stores/flow.ts`
  - Line 24: `updateNode` data parameter needs proper typing

- [ ] **Add stricter ESLint rules**
  - Add `@typescript-eslint/no-explicit-any` rule
  - Add `@typescript-eslint/no-unsafe-assignment` rule

### 1.2 Security Hardening

- [ ] **Implement code sandboxing for function blocks**
  - File: `/apps/web/src/lib/execution/node-executors/ai-block.ts:64-117`
  - Replace `AsyncFunction` constructor with `vm2` or `isolated-vm`
  - Add resource limits (memory, CPU time)
  - Block access to `require`, `process`, `fs`

- [ ] **Add rate limiting to API endpoints**
  - Add rate limiting middleware to tRPC
  - Limit execution endpoints to prevent abuse
  - Consider using Upstash Redis rate limiter

### 1.3 Testing Foundation

- [ ] **Add tRPC router tests**
  - `/apps/web/src/lib/trpc/routers/blocks.ts`
  - `/apps/web/src/lib/trpc/routers/flows.ts`
  - `/apps/web/src/lib/trpc/routers/connections.ts`
  - `/apps/web/src/lib/trpc/routers/decisions.ts`

- [ ] **Add streaming hook tests**
  - `/apps/web/src/hooks/useBlockStream.ts`
  - `/apps/web/src/hooks/useExecutionStream.ts`
  - `/apps/web/src/hooks/useStreamState.ts`

- [ ] **Add execution engine tests**
  - `/apps/web/src/lib/execution/flow-executor.ts`
  - `/apps/web/src/lib/execution/node-executors/`

### 1.4 Documentation Essentials

- [ ] **Add LICENSE file**
  - Create `/LICENSE` with MIT license text
  - Author: James McArthur

- [ ] **Create CONTRIBUTING.md**
  - Development setup instructions
  - Code style guide reference
  - PR process
  - Issue reporting guidelines

- [ ] **Add GitHub templates**
  - `/.github/ISSUE_TEMPLATE/bug_report.md`
  - `/.github/ISSUE_TEMPLATE/feature_request.md`
  - `/.github/pull_request_template.md`

- [ ] **Fix SDK documentation**
  - Move `/packages/sdk/README.md` → `/docs/planned/SDK.md`
  - Move `/packages/python-sdk/README.md` → `/docs/planned/PYTHON_SDK.md`
  - Move `/packages/react/README.md` → `/docs/planned/REACT_SDK.md`
  - Add "PLANNED - Not Yet Implemented" headers

---

## Phase 2: UX Improvements (P1)

### 2.1 Accessibility

- [ ] **Add ARIA labels to flow editor**
  - File: `/apps/web/src/components/flow/FlowCanvas.tsx`
  - Add `aria-label` to all interactive elements
  - Add keyboard navigation for nodes

- [ ] **Add ARIA live regions to streaming**
  - File: `/apps/web/src/components/streaming/StreamingText.tsx`
  - Add `role="log"` and `aria-live="polite"`

- [ ] **Add keyboard shortcuts**
  - Delete key to remove selected node
  - Escape to deselect
  - Ctrl+S to save

- [ ] **Add prefers-reduced-motion support**
  - File: `/apps/web/src/app/globals.css`
  - Disable animations when user prefers reduced motion

### 2.2 Responsiveness

- [ ] **Make flow editor responsive**
  - File: `/apps/web/src/app/dashboard/flows/[id]/page.tsx`
  - Add collapsible sidebars with toggle buttons
  - Stack layout vertically on mobile
  - Test at 768px, 1024px, 1280px breakpoints

- [ ] **Add mobile navigation**
  - File: `/apps/web/src/app/dashboard/layout.tsx`
  - Add hamburger menu for mobile
  - Make nav links scrollable on small screens

### 2.3 User Safety

- [ ] **Add dirty state tracking**
  - Files: BlockEditor, Flow editor page
  - Track unsaved changes
  - Show confirmation dialog on navigation
  - Add "Unsaved changes" indicator

- [ ] **Implement undo/redo**
  - Add to block configuration
  - Add to flow editor
  - Use zustand middleware or custom implementation

### 2.4 Flow Editor Polish

- [ ] **Add drop zone visual feedback**
  - File: `/apps/web/src/components/flow/FlowCanvas.tsx`
  - Show green outline when dragging over valid area
  - Show cursor change on drag

- [ ] **Fix node position calculation**
  - File: `/apps/web/src/components/flow/FlowCanvas.tsx:73-76`
  - Replace magic numbers (-100, -50) with proper centering

- [ ] **Add empty state guidance**
  - Show "Drag blocks here to get started" message
  - Add quick-start tutorial option

---

## Phase 3: Quality & Performance (P2)

### 3.1 Error Handling

- [ ] **Add error boundaries**
  - Wrap streaming components
  - Wrap flow editor
  - Wrap block editor
  - Create reusable `<ErrorBoundary>` component

- [ ] **Fix silent database failures**
  - File: `/apps/web/src/lib/execution/event-emitter.ts:38-48`
  - Either throw errors or implement retry logic
  - Add event loss tracking metric

- [ ] **Add SSE buffer limits**
  - File: `/apps/web/src/hooks/useExecutionStream.ts:152`
  - Add maximum buffer size (e.g., 1MB)
  - Reset on overflow with error

### 3.2 Performance Optimization

- [ ] **Add virtualization to streaming output**
  - Use `react-window` or `@tanstack/react-virtual`
  - Virtualize for outputs > 1000 lines

- [ ] **Debounce auto-save**
  - File: `/apps/web/src/components/flow/FlowCanvas.tsx`
  - Add 500ms debounce to save calls
  - Show "Saving..." indicator

- [ ] **Optimize tool call state updates**
  - File: `/apps/web/src/hooks/useStreamState.ts:214-228`
  - Change `toolCalls` from `Array` to `Map` for O(1) lookups

- [ ] **Memoize node components**
  - Add `React.memo` to all node components in `/components/flow/nodes/`

### 3.3 Fix Race Conditions

- [ ] **Fix useBlockStream race condition**
  - File: `/apps/web/src/hooks/useBlockStream.ts:186-189`
  - Implement mutex or use atomic state pattern
  - Prevent duplicate executions

- [ ] **Fix useExecutionStream memory leak**
  - File: `/apps/web/src/hooks/useExecutionStream.ts:300-316`
  - Ensure proper EventSource cleanup
  - Use refs for stable callbacks

---

## Phase 4: Feature Completion (P3)

### 4.1 SDK Implementation

- [ ] **Build TypeScript SDK**
  - Create `/packages/sdk/src/client.ts`
  - Implement blocks, flows, executions APIs
  - Add streaming support
  - Add comprehensive types

- [ ] **Build Python SDK**
  - Create `/packages/python-sdk/baleyui/client.py`
  - Match TypeScript SDK API
  - Add streaming support with httpx
  - Add type hints

- [ ] **Build React component library**
  - Create `/packages/react/src/components/`
  - `<FlowRunner>` - embeddable flow executor
  - `<ChatWidget>` - chat interface
  - Add hooks for integration

### 4.2 Advanced Features

- [ ] **Visual JSON schema builder**
  - Replace raw JSON editing in block editor
  - Drag-and-drop field creation
  - Type selection (string, number, object, array)
  - Validation rule builder

- [ ] **Block templates library**
  - Pre-built templates for common tasks
  - "Customer Support Bot", "Data Extractor", etc.
  - One-click creation from template

- [ ] **Model capability display**
  - Show context window size
  - Show cost per 1K tokens
  - Show speed indicators
  - Recommend models based on task

---

## Quick Reference: File Locations

### Critical Files to Fix
```
/apps/web/src/lib/execution/types.ts          # CompiledNode type
/apps/web/src/lib/trpc/routers/blocks.ts      # any types
/apps/web/src/components/blocks/BlockEditor.tsx # any types
/apps/web/src/lib/execution/node-executors/ai-block.ts # sandboxing
/apps/web/src/hooks/useBlockStream.ts         # race condition
/apps/web/src/hooks/useExecutionStream.ts     # memory leak
```

### Test Files to Create
```
/apps/web/src/lib/trpc/routers/__tests__/blocks.test.ts
/apps/web/src/lib/trpc/routers/__tests__/flows.test.ts
/apps/web/src/hooks/__tests__/useBlockStream.test.ts
/apps/web/src/hooks/__tests__/useStreamState.test.ts
/apps/web/src/lib/execution/__tests__/flow-executor.test.ts
```

### Documentation Files to Create
```
/LICENSE
/CONTRIBUTING.md
/.github/ISSUE_TEMPLATE/bug_report.md
/.github/ISSUE_TEMPLATE/feature_request.md
/.github/pull_request_template.md
/docs/SETUP.md
```

---

## Starting a New Session

When starting a new Claude Code session to work on these tasks:

1. Reference this file: "I want to continue working on BaleyUI improvements. See IMPROVEMENT_TASKS.md and AUDIT_REPORT.md for context."

2. Pick a phase or specific task to focus on.

3. The audit identified these as the highest priority immediate actions:
   - Fix `CompiledNode` type mismatch (will cause runtime crashes)
   - Add LICENSE file (required for open source)
   - Add error boundaries to streaming components
   - Replace `any` types in critical paths

---

*Generated by Claude Code audit on January 30, 2026*
