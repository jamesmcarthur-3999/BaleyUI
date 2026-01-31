# BaleyUI

> Visual platform for building, composing, and evolving AI-powered workflows

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

BaleyUI is a visual development platform built on top of the [BaleyBots](https://github.com/cbethin/baleybots) framework. It enables users to:

- **Create AI Blocks** - Define AI-powered decision makers with natural language goals
- **Create Function Blocks** - Write coded logic that shares the same interface as AI
- **Compose Flows** - Visually connect blocks into complex workflows
- **Observe Decisions** - View every AI decision with full context
- **Evolve to Code** - Extract patterns from AI decisions and generate code

## The Core Insight

The power of BaleyUI comes from BaleyBots' `Processable` interface. Every block - whether AI-powered or coded - implements the same contract:

```typescript
interface Processable<TInput, TOutput> {
  process(input: TInput): Promise<TOutput>;
}
```

This means you can:
1. **Prototype with AI** - Use natural language to define logic
2. **Observe behavior** - See exactly what the AI decides and why
3. **Extract patterns** - Identify rules from repeated decisions
4. **Codify logic** - Generate code that handles known cases
5. **Hybrid operation** - Code handles 90%, AI handles edge cases

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
│       │   ├── app/              # App Router pages
│       │   │   ├── (dashboard)/  # Protected routes (blocks, flows)
│       │   │   ├── (auth)/       # Auth routes (sign-in, sign-up)
│       │   │   └── api/          # API routes (tRPC, streaming)
│       │   ├── components/       # React components
│       │   │   ├── ui/           # shadcn/ui primitives
│       │   │   ├── blocks/       # Block editor components
│       │   │   ├── streaming/    # Streaming UI components
│       │   │   └── connections/  # LLM connection components
│       │   ├── lib/              # Utilities and services
│       │   └── hooks/            # Custom React hooks
│       ├── next.config.ts
│       └── package.json
├── packages/
│   ├── db/                       # @baleyui/db - Database schema
│   │   ├── src/
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   └── types.ts          # Inferred types
│   │   └── package.json
│   ├── ui/                       # @baleyui/ui - Shared components
│   └── core/                     # @baleyui/core - Core utilities
├── pnpm-workspace.yaml           # Workspace configuration
├── turbo.json                    # Turborepo config (optional)
├── PLAN.md                       # Detailed project plan
├── CODING_GUIDELINES.md          # Development standards
├── AGENTS.md                     # AI agent task assignments
└── README.md                     # This file
```

## Documentation

| Document | Description |
|----------|-------------|
| [Project Plan](./PLAN.md) | Vision, architecture, phases, database schema |
| [Coding Guidelines](./CODING_GUIDELINES.md) | React 19, Next.js 15 patterns, best practices |
| [Agent Tasks](./AGENTS.md) | Phase 1 task breakdown for AI agents |

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

# Optional
UPSTASH_REDIS_REST_URL= # Redis for caching (optional)
ENCRYPTION_KEY=         # For encrypting stored API keys
```

## Contributing

See [AGENTS.md](./AGENTS.md) for the current task breakdown and how to contribute.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [BaleyBots Framework](https://github.com/cbethin/baleybots)
- [Project Plan](./PLAN.md)
- [Coding Guidelines](./CODING_GUIDELINES.md)
