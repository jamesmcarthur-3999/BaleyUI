# BaleyUI - Agent Task Guide

> Context and instructions for AI agents working on BaleyUI.

**Current Phase**: Phase 4 - Tool Ecosystem
**Status**: In Progress (Audit Remediation complete — 4 sprints)
**Active Plan**: `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`

---

## Quick Start for New Sessions

For new Claude Code sessions:

1. **Read the execution prompt**: `docs/plans/execution-prompt.md`
2. **Follow the implementation plan**: `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`
3. **Check coding guidelines**: `CODING_GUIDELINES.md`
4. **Review CLAUDE.md** for key patterns and file locations

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Foundation (database, auth, tRPC, connections) |
| Phase 2 | ✅ Complete | Composition (flows, triggers, streaming) |
| Phase 3 | ✅ Complete | Testing & Observability |
| Audit (Sprints 1-4) | ✅ Complete | Security, performance, React 19, lint remediation |
| **Phase 4** | 🚧 **In Progress** | Tool Ecosystem (35 tasks across 8 sub-phases) |
| BB Launch Prep | 📋 Planned | BaleyBot launch prep & live experience |
| MCP Foundation | 📋 Planned | MCP cluster implementation |
| UX Consolidation | 📋 Planned | UX consolidation & polish |

See `docs/plans/README.md` for the full list of implementation plans and their status.

---

## Environment Setup

```
Prerequisites:
[x] PostgreSQL database running
[x] Clerk authentication configured
[x] Node.js 20+ installed
[x] pnpm 9+ installed

Environment variables (apps/web/.env.local):
- DATABASE_URL           → PostgreSQL connection string
- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
- CLERK_SECRET_KEY
- ENCRYPTION_KEY         → 64 hex chars (openssl rand -hex 32)
- TAVILY_API_KEY         → Optional, for web search tool
```

---

## Current Work: Tool Ecosystem

The active implementation plan covers 35 tasks across 8 sub-phases:

| Sub-Phase | Tasks | Focus |
|-----------|-------|-------|
| 1 | 1.1-1.4 | Built-in tools (web_search, spawn_baleybot, create_agent, create_tool) |
| 2 | 2.1-2.6 | Database connections, query execution, NL→SQL |
| 3 | 3.1-3.4 | Triggers (Vercel Cron, webhooks, BB completion) |
| 4 | 4.1-4.3 | Data flow (pipelines, shared storage) |
| 5 | 5.1-5.4 | Analytics (metrics, dashboards, alerts) |
| 6 | 6.1-6.3 | Visual editor (BAL↔nodes bidirectional sync) |
| 7 | 7.1-7.4 | Cost control (tracking, anomaly detection) |
| 8 | 8.1-8.4 | Dynamic tools (creation, promotion) |

### Key Technical Decisions

- **Web Search**: Tavily API primary, AI model fallback if no key
- **Scheduling**: Vercel Cron at `/api/cron/process-scheduled-tasks`
- **Visual Editor**: React Flow for diagram rendering
- **Analytics**: recharts for charts

---

## Key File Locations

| Area | Path |
|------|------|
| Database Schema | `packages/db/src/schema.ts` |
| tRPC Routers | `apps/web/src/lib/trpc/routers/` |
| BaleyBot Executor | `apps/web/src/lib/baleybot/executor.ts` |
| Built-in Tools | `apps/web/src/lib/baleybot/tools/built-in/` |
| Tool Catalog | `apps/web/src/lib/baleybot/tools/catalog-service.ts` |
| Connection Tools | `apps/web/src/lib/baleybot/tools/connection-derived/` |
| Services | `apps/web/src/lib/baleybot/services/` |
| Stream Events | `apps/web/src/lib/streaming/types/events.ts` |
| Testing Guide | `docs/guides/TESTING.md` |
| Developer Guide | `docs/guides/DEVELOPER_GUIDE.md` |

---

## Commands

```bash
pnpm dev          # Start development server
pnpm test         # Run tests
pnpm type-check   # TypeScript checking
pnpm lint         # ESLint
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
```

---

## Resources

- [PLAN.md](./PLAN.md) - Full project vision and architecture
- [CODING_GUIDELINES.md](./CODING_GUIDELINES.md) - React 19, Next.js 15 patterns
- [CLAUDE.md](./CLAUDE.md) - AI development context
- [docs/plans/](./docs/plans/) - Implementation plans
- [docs/architecture/](./docs/architecture/) - Technical documentation
- [docs/reference/](./docs/reference/) - BAL language, type system, builder events, streaming events
- [docs/guides/](./docs/guides/) - Developer guide, testing

---

## Archived Documentation

Historical task details for completed phases are in `docs/archive/`:
- `docs/archive/completed-phases/` - Phase plans and verifications
- `docs/archive/implementation/` - Task summaries and audits
