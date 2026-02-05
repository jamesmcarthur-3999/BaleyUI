# BaleyUI MCP Server Design

**Status:** Exploratory - Paused
**Date:** 2026-02-03
**Resume from:** Defining specific Tools and Resources

---

## Vision

Build an MCP server that exposes BaleyUI's capabilities to external AI systems (Claude Code, other agents, CI pipelines). This turns BaleyUI into:

1. **A central dashboard** for managing AI agents across projects
2. **A research platform** for running AI experiments with rich tracking/analytics
3. **An easy onramp** for "vibe coders" who want AI without the complexity

### Primary Use Case

> "I'm working in Claude Code and want to implement AI. BaleyUI provides an MCP and corresponding skills so I can set up AI agents with ease, manage them dynamically, and have everything recorded/logged in one place."

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Target audience** | All: developers, AI agents, CI systems | Broad utility, valuable as experimentation platform |
| **MVP scope** | Execute + Create | Covers core use case without dangerous ops (delete, config) |
| **Authentication** | API key per workspace | Simple, familiar pattern, works everywhere |
| **User auth** | Google OAuth via Clerk | Already have Clerk set up, just enable Google provider |
| **Deployment** | Embedded in BaleyUI (`apps/web`) | Reuse existing infra, no new services to deploy |
| **MCP primitives** | Tools + Resources | Resources enable tracking/observability - the differentiator |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     External AI Systems                      │
│         (Claude Code, Other Agents, CI Pipelines)           │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol (stdio or HTTP/SSE)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  BaleyUI MCP Server                          │
│                  (apps/web/src/mcp/)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Tools     │  │  Resources  │  │   Auth Middleware   │  │
│  │ - create    │  │ - bots      │  │   (API Key check)   │  │
│  │ - execute   │  │ - executions│  │                     │  │
│  │ - get_result│  │ - tools     │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Existing BaleyUI                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ tRPC Router │  │  Executor   │  │  Internal BaleyBots │  │
│  │ (baleybots) │  │             │  │   (creator_bot)     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼───────────────────┼──────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│     baleybots │ baleybotExecutions │ workspaces │ etc.      │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed MCP Inventory

### Tools (Actions)

| Tool | Purpose | Inputs |
|------|---------|--------|
| `create_baleybot` | Create a new BB from description (uses `creator_bot`) or raw BAL | `{ description?: string, balCode?: string, name?: string }` |
| `execute_baleybot` | Run a BB with input, returns execution ID | `{ baleybotId: string, input: unknown }` |
| `get_execution_result` | Get result/status of an execution | `{ executionId: string }` |

### Resources (Reads)

| Resource URI | Purpose |
|--------------|---------|
| `baleybot://bots` | List all BaleyBots in workspace |
| `baleybot://bots/{id}` | Get single BB details + recent executions |
| `baleybot://executions` | List recent executions across all BBs |
| `baleybot://executions/{id}` | Get execution details with segments for replay |
| `baleybot://tools` | List available tools in workspace |

---

## Open Questions (Resume Here)

1. **Streaming vs polling**: Should `execute_baleybot` stream results in real-time, or return an execution ID for polling via `get_execution_result`?

2. **Analytics resources**: Should we expose aggregation endpoints like `baleybot://stats` for experiment analysis?

3. **Tool parameters**: What exact input schemas should each tool have?

4. **Resource pagination**: How should list resources handle large datasets?

5. **Error handling**: How should MCP errors map to BaleyUI errors?

6. **Rate limiting**: Should MCP endpoints have different limits than the web UI?

---

## Implementation Phases (Draft)

### Phase 1: Foundation
- [ ] Add API key generation to workspace settings
- [ ] Create MCP server skeleton in `apps/web/src/mcp/`
- [ ] Implement auth middleware for API key validation

### Phase 2: Core Tools
- [ ] Implement `create_baleybot` tool (wrapping `creator_bot`)
- [ ] Implement `execute_baleybot` tool (wrapping executor)
- [ ] Implement `get_execution_result` tool

### Phase 3: Resources
- [ ] Implement `baleybot://bots` resource
- [ ] Implement `baleybot://executions` resource
- [ ] Implement `baleybot://tools` resource

### Phase 4: Distribution
- [ ] Create Claude Code skill/plugin for easy setup
- [ ] Documentation and examples
- [ ] npm package for local MCP server mode (optional)

---

## Relevant Code Locations

| Component | Path |
|-----------|------|
| tRPC Router | `apps/web/src/lib/trpc/routers/baleybots.ts` |
| Executor | `apps/web/src/lib/baleybot/executor.ts` |
| Internal BaleyBots | `apps/web/src/lib/baleybot/internal-baleybots.ts` |
| Streaming API | `apps/web/src/app/api/baleybots/[id]/execute-stream/route.ts` |
| Database Schema | `packages/db/src/schema.ts` |
| Existing MCP Client | `packages/baleybots/typescript/packages/mcp/` |

---

## Related Docs

- `PLAN.md` - Overall architecture
- `docs/architecture/` - Technical deep-dives
- `@baleybots/mcp` package - Reference for MCP patterns

---

*Last updated: 2026-02-03*
