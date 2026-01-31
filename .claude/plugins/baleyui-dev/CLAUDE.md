# BaleyUI Development Guide

Quick reference for common patterns. Use skills for detailed guidance.

## Critical Reminders

### BaleyBots Streaming Events
Use exact field names:
- `text_delta`: use `content` (NOT `delta`)
- Tool events: use `id` (NOT `toolCallId`)
- `done` event: use `reason` (NOT `result`)

### React 19
NO manual memoization - the compiler handles it:
- Don't use `useMemo`, `useCallback`, `React.memo`

### Database
Always use these helpers:
- `notDeleted(table)` in all queries
- `updateWithLock(table, id, version, data)` for updates
- `withTransaction(async (tx) => {...})` for multi-table ops

### Streaming UI
- Use RAF batching + direct DOM manipulation
- Don't update React state per token
- Use CSS animations, not Framer Motion

## Key Locations

| Area | Path |
|------|------|
| Schema | `/packages/db/src/schema.ts` |
| tRPC Routers | `/apps/web/src/lib/trpc/routers/` |
| Stream Events | `/apps/web/src/lib/streaming/types/events.ts` |
| Node Executors | `/apps/web/src/lib/execution/node-executors/` |
