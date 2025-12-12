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
git clone https://github.com/yourusername/BaleyUI.git
cd BaleyUI

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
BaleyUI/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components
│   │   ├── blocks/             # Block editor components
│   │   ├── flows/              # Flow canvas components
│   │   └── decisions/          # Decision inspector components
│   ├── lib/
│   │   ├── db/                 # Database schema and queries
│   │   ├── baleybots/          # BaleyBots integration
│   │   └── trpc/               # tRPC routers
│   └── types/                  # TypeScript types
├── PLAN.md                     # Detailed project plan
└── README.md                   # This file
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React, Tailwind CSS, shadcn/ui
- **Flow Editor**: React Flow
- **Database**: PostgreSQL with Drizzle ORM
- **API**: tRPC
- **AI Runtime**: BaleyBots

## Documentation

- [Project Plan](./PLAN.md) - Comprehensive project documentation
- [Architecture](./PLAN.md#architecture) - System design
- [Database Schema](./PLAN.md#database-schema) - Data model
- [Feature Roadmap](./PLAN.md#feature-roadmap) - Implementation phases

## Development

```bash
# Run development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests
npm run test

# Database migrations
npm run db:generate    # Generate migration
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio
```

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting a PR.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [BaleyBots Framework](https://github.com/cbethin/baleybots)
- [Project Plan](./PLAN.md)
