# BaleyBot Tool Ecosystem - Execution Prompt

**Purpose:** Copy the prompt below into a new Claude Code session to implement the complete tool ecosystem.

**Plan Document:** `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`

---

## Prompt

```
You are implementing the complete BaleyBot Tool Ecosystem.

## Context

Working directory: /Users/jamesmcarthur/Documents/GitHub/BaleyUI/.worktrees/tool-ecosystem
Branch: feature/tool-ecosystem (work directly on this branch)
Plan: docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md

## Current State

The foundation is partially built. These exist but need completion:

**Implemented (functional):**
- Built-in tool schemas and metadata (tools/built-in/index.ts)
- Memory storage service (services/memory-storage.ts)
- Notification service (services/notification-service.ts)
- Schedule service (services/schedule-service.ts)
- PostgreSQL schema introspection (connection-derived/schema-introspection.ts)
- Database tables: baleybotMemory, notifications, scheduledTasks

**Implemented (placeholder only):**
- web_search - returns placeholder, needs Tavily integration
- spawn_baleybot - looks up BB but doesn't execute, needs full execution
- create_agent - placeholder, needs implementation
- create_tool - placeholder, needs implementation

**Not started:**
- Database connection UI forms (PostgreSQL, MySQL)
- Query execution layer
- Vercel Cron endpoint
- Webhook triggers
- Analytics system
- Visual editor
- Cost tracking
- Anomaly detection

## Your Mission

Implement ALL 35 tasks across 8 phases:

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 1.1-1.4 | Complete built-in tools (web_search, spawn_baleybot, create_agent, create_tool) |
| 2 | 2.1-2.6 | Database connection forms, query execution, NL→SQL |
| 3 | 3.1-3.4 | Vercel Cron, webhooks, BB completion triggers, UI |
| 4 | 4.1-4.3 | Pipeline execution, shared storage, customer DB |
| 5 | 5.1-5.4 | Analytics schema, metrics, dashboards, alerts |
| 6 | 6.1-6.3 | Visual editor (BAL→nodes, editing, bidirectional sync) |
| 7 | 7.1-7.4 | Usage tracking, anomaly detection, optimization, self-healing |
| 8 | 8.1-8.4 | Full dynamic tools, promotion flow, workspace tools UI |
| 9 | 9.1-9.3 | Creator Bot update, E2E tests, documentation |

## Key Technical Decisions

1. **Web Search:** Tavily API primary, AI model fallback if no API key
2. **Scheduling:** Vercel Cron at /api/cron/process-scheduled-tasks (every minute)
3. **Visual Editor:** React Flow for diagram rendering
4. **Analytics:** recharts for charts

## How to Execute

1. Start by reading the full plan: docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md
2. Use superpowers:executing-plans to work through tasks with review checkpoints
3. Commit after each completed task or logical group
4. Run tests frequently to catch issues early

## Success Criteria

- [ ] All 8 built-in tools fully functional
- [ ] Database connections generate working query tools
- [ ] Scheduled tasks execute via Vercel Cron
- [ ] Webhooks trigger BB execution
- [ ] Analytics tracked and visualized
- [ ] Visual editor renders and allows editing BAL
- [ ] Cost anomalies detected and reported
- [ ] Dynamic tools can be created and promoted to workspace
- [ ] All tests pass
```
