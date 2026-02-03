# BaleyUI

> Visual platform for building, composing, and evolving AI-powered workflows

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

BaleyUI is a visual development platform built on top of the [BaleyBots](https://github.com/cbethin/baleybots) framework. It enables users to:

- **Create BaleyBots** - Define AI-powered workflows with natural language goals
- **Connect Data Sources** - Link databases, APIs, and services to power your BBs
- **Compose Workflows** - Chain BBs together into complex, automated pipelines
- **Schedule & Trigger** - Run BBs on schedules, webhooks, or BB completion events
- **Observe & Analyze** - View every execution with full context and analytics

## Current Development Status

**Active Branch:** `feature/tool-ecosystem`

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1-3 | Complete | Core BaleyBot execution, streaming, connections |
| Phase 4 | In Progress | Tool ecosystem (built-in tools, triggers, analytics) |

See [docs/plans/](./docs/plans/) for detailed implementation plans.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/jamesmcarthur-3999/BaleyUI.git
cd BaleyUI

# Install dependencies (requires pnpm)
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Run database migrations
pnpm db:push

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 15.1+ |
| UI Library | React | 19.0+ |
| Language | TypeScript | 5.7+ |
| Styling | Tailwind CSS | 3.4+ |
| Components | shadcn/ui + Radix | Latest |
| Flow Editor | @xyflow/react | 12.3+ |
| State | Zustand | 5.0+ |
| Server State | TanStack Query | 5.62+ |
| API | tRPC | 11.0+ |
| Database | PostgreSQL + Drizzle | 0.38+ |
| Auth | Clerk | 6.9+ |
| AI Runtime | BaleyBots | Latest |

## Project Structure

```
BaleyUI/
├── apps/
│   └── web/                      # Next.js 15 dashboard
│       ├── src/
│       │   ├── app/              # App Router pages & API routes
│       │   ├── components/       # React components
│       │   ├── lib/              # Utilities and services
│       │   │   ├── baleybot/     # BaleyBot execution engine
│       │   │   ├── trpc/         # tRPC routers
│       │   │   └── connections/  # Connection management
│       │   └── hooks/            # Custom React hooks
│       └── package.json
├── packages/
│   ├── db/                       # @baleyui/db - Database schema & types
│   ├── sdk/                      # @baleyui/sdk - JavaScript/TypeScript SDK
│   ├── react/                    # @baleyui/react - React components
│   └── python-sdk/               # Python SDK
├── docs/
│   ├── plans/                    # Implementation plans (dated)
│   ├── architecture/             # Architecture documentation
│   └── archive/                  # Completed phase documentation
├── PLAN.md                       # Project vision & architecture
├── CODING_GUIDELINES.md          # Development standards
├── AGENTS.md                     # Task assignments
└── CLAUDE.md                     # AI development context
```

## Documentation

| Document | Description |
|----------|-------------|
| [Project Plan](./PLAN.md) | Vision, architecture, database schema |
| [Coding Guidelines](./CODING_GUIDELINES.md) | React 19, Next.js 15 patterns |
| [CLAUDE.md](./CLAUDE.md) | AI development context and skills |
| [docs/plans/](./docs/plans/) | Implementation plans by date |
| [docs/architecture/](./docs/architecture/) | Technical architecture docs |

## Development

```bash
# Run development server (with Turbopack)
pnpm dev

# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run tests
pnpm test

# Database commands
pnpm db:generate    # Generate migration from schema changes
pnpm db:push        # Push schema to database (dev)
pnpm db:migrate     # Apply migrations (prod)
pnpm db:studio      # Open Drizzle Studio
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
# Required
DATABASE_URL=           # PostgreSQL connection string
CLERK_SECRET_KEY=       # Clerk secret key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # Clerk publishable key
ENCRYPTION_KEY=         # 64 hex chars for encrypting API keys

# Optional
UPSTASH_REDIS_REST_URL= # Redis for caching
TAVILY_API_KEY=         # For web search tool
```

## Key Concepts

### BaleyBots (BBs)

BaleyBots are AI-powered workflow units defined in BAL (Baleybots Assembly Language):

```bal
assistant {
  "goal": "Help users answer questions about our product",
  "tools": ["web_search", "fetch_url"],
  "model": "anthropic:claude-sonnet-4-20250514"
}
```

### Tools

BBs can use built-in tools (`web_search`, `spawn_baleybot`, `store_memory`) and connection-derived tools (database queries, API calls).

### Triggers

BBs can be triggered manually, on a schedule, via webhook, or when another BB completes.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [BaleyBots Framework](https://github.com/cbethin/baleybots)
- [Project Plan](./PLAN.md)
- [Coding Guidelines](./CODING_GUIDELINES.md)
