# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 4: Tool Ecosystem (In Progress)

**Current Branch:** `feature/tool-ecosystem`

Implementation of the complete BaleyBot tool ecosystem:
- 35 tasks across 8 sub-phases
- Built-in tools with full implementations
- Database connection-derived tools
- Trigger system (cron, webhooks, BB completion)
- Analytics and cost tracking
- Visual BAL editor
- Dynamic tool creation

See: `docs/plans/2026-02-03-tool-ecosystem-complete-implementation.md`

### Added (Phase 4 - Partial)
- Web search service with Tavily integration and AI fallback
- Ephemeral agent service (`create_agent` tool implementation)
- Ephemeral tool service (`create_tool` tool implementation)
- Tool ecosystem implementation plan (35 tasks)

---

## [0.4.0] - 2026-02-02 - Phase 3 Complete

### Added
- **Conversational Creation**: Creator Bot for natural language BB building
- **BAL-First Architecture**: BaleyBots Assembly Language as source of truth
- **Testing Interface**: Live chat testing for blocks
- **Streaming Infrastructure**: Server-independent execution with reconnection
- **Execution Observability**: Full event logging and replay

### Changed
- Unified BB representation via BAL
- Refactored executor for streaming support
- Enhanced connection management UI

---

## [0.3.0] - 2026-01-31 - Phase 2 Complete

### Added
- **Flow Canvas**: React Flow-based visual editor
- **Composition Patterns**: Pipeline, router, parallel, loop nodes
- **Trigger System**: Schedule, webhook, BB completion triggers
- **Streaming UI**: Real-time token streaming with 60fps performance
- **Tool Calling**: Visual tool execution display

### Changed
- Upgraded streaming to RAF-batched DOM updates
- Added virtualization for large execution lists

---

## [0.2.0] - 2026-01-28 - Phase 1 Complete

### Added
- **Foundation Infrastructure**:
  - Next.js 15.1 with Turbopack
  - React 19 with compiler support
  - PostgreSQL + Drizzle ORM
  - tRPC API layer
  - Clerk authentication

- **Data Integrity Layer**:
  - Transaction helpers (`withTransaction`)
  - Optimistic locking (`updateWithLock`)
  - Soft deletes with audit trail
  - AES-256-GCM encryption for API keys

- **Database Schema**:
  - `workspaces`, `connections`, `tools`, `baleybots`
  - `flows`, `flowExecutions`, `baleybotExecutions`
  - `executionEvents`, `auditLogs`, `notifications`
  - `scheduledTasks`, `baleybotMemory`

- **Connections Module**:
  - OpenAI, Anthropic, Ollama provider support
  - PostgreSQL, MySQL database connections
  - Connection testing and validation
  - Encrypted credential storage

- **BaleyBot Execution**:
  - BAL parsing and compilation
  - Runtime tool injection
  - Streaming event system

### Technical Stack
- Next.js 15.1+ with Turbopack
- React 19.0+ with compiler
- TypeScript 5.7+
- Tailwind CSS 3.4+
- @xyflow/react 12.3+
- Zustand 5.0+
- TanStack Query 5.62+
- tRPC 11.0+
- Drizzle ORM 0.38+
- Clerk 6.9+

---

## [0.1.0] - 2026-01-25 - Initial Planning

### Added
- Project vision and philosophy
- BaleyBots integration strategy
- Database schema design
- Four-phase development plan
- PLAN.md with architecture documentation
- CODING_GUIDELINES.md with React 19 patterns
- AGENTS.md with task breakdowns

---

## Version History

| Version | Date | Phase | Status |
|---------|------|-------|--------|
| 0.4.0 | 2026-02-02 | Phase 3 | ✅ Complete |
| 0.3.0 | 2026-01-31 | Phase 2 | ✅ Complete |
| 0.2.0 | 2026-01-28 | Phase 1 | ✅ Complete |
| 0.1.0 | 2026-01-25 | Planning | ✅ Complete |
