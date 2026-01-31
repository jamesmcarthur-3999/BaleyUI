# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and documentation
- Comprehensive project plan (PLAN.md)
- README with project overview
- Package.json with dependencies
- Environment variable template
- **Resilience Architecture** (December 2024):
  - "Resilience by Design" core philosophy - executions are server-independent
  - Execution-first API with reconnection protocol
  - Execution state machine (pending → running → complete/failed/stale)
  - Server startup recovery for stale/orphaned executions
  - Data integrity layer with transactions, soft deletes, optimistic locking
  - Audit logging for all operations
  - AES-256-GCM encryption for API keys
  - New database tables: `executionEvents`, `auditLogs`, `backgroundJobs`
  - New Task 1.10: Data Integrity Layer

### Changed
- **Tech Stack Upgrade** (December 2024):
  - Upgraded from Next.js 14 to **Next.js 15.1** with Turbopack
  - Upgraded from React 18 to **React 19** with compiler support
  - Upgraded from reactflow to **@xyflow/react 12.3** (modern API)
  - Upgraded Zustand to **5.0** for React 19 compatibility
  - Added **Clerk** for authentication (replacing NextAuth consideration)
  - Added **Hono** for high-performance streaming endpoints
  - Added **@tanstack/react-virtual** for list virtualization
  - Added **Comlink** for Web Worker communication
  - Added **@upstash/redis** for caching and rate limiting
  - Added all four **BaleyBots packages** (@baleybots/core, chat, react, tools)

### Documentation
- Created **CODING_GUIDELINES.md** - React 19, Next.js 15 patterns and best practices
- Created **AGENTS.md** - Phase 1 task breakdown for AI agents
- Updated **.env.example** for Clerk authentication
- Resolved open questions in PLAN.md (Auth: Clerk, Multi-tenancy: Single DB)
- Updated **PLAN.md** with "Resilience by Design" philosophy (Core Philosophy §0)
- Updated **PLAN.md** with execution-first API and reconnection protocol
- Updated **PLAN.md** with resilience database tables and schema additions
- Updated **AGENTS.md** with Task 1.10: Data Integrity Layer
- Updated **AGENTS.md** Task 1.7 with server-independent execution requirements

### Planned
- Phase 1: Foundation (Block Editor, Connections, Testing)
- Phase 2: Composition (Flow Canvas, Triggers)
- Phase 3: Integration (Embeddable Components, Database Connectors)
- Phase 4: Evolution (Pattern Extraction, Code Generation)

## [0.0.1] - Initial Planning

### Added
- Project vision and philosophy
- BaleyBots integration strategy
- Database schema design
- Four-phase development plan
- Internal bots (dogfooding) architecture
