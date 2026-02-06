# Getting Started with BaleyUI

Get from zero to your first BaleyBot in under 10 minutes.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | [Download](https://nodejs.org/) |
| pnpm | 9+ | `npm install -g pnpm` |
| PostgreSQL | 14+ | Local, [Neon](https://neon.tech), or [Supabase](https://supabase.com) |
| Clerk account | — | [Sign up](https://dashboard.clerk.com) (free tier works) |

## 1. Clone & Install

```bash
git clone https://github.com/jamesmcarthur-3999/BaleyUI.git
cd BaleyUI
pnpm install
```

## 2. Configure Environment

```bash
cp .env.example apps/web/.env.local
```

Open `apps/web/.env.local` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | From [Clerk Dashboard](https://dashboard.clerk.com) |
| `CLERK_SECRET_KEY` | Yes | From Clerk Dashboard |
| `ENCRYPTION_KEY` | Yes | Generate with `openssl rand -base64 32` — encrypts stored API keys |
| `UPSTASH_REDIS_REST_URL` | No | For caching and rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Paired with Redis URL |
| `TAVILY_API_KEY` | No | Enables the `web_search` built-in tool |
| `NEXT_PUBLIC_APP_URL` | No | Defaults to `http://localhost:3000` |

## 3. Set Up the Database

```bash
pnpm db:push
```

This creates all tables in your PostgreSQL database. For production, use `pnpm db:generate && pnpm db:migrate` instead.

## 4. Start the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Clerk — a workspace is created automatically on first login.

## 5. Create Your First BaleyBot

1. Click **"New BaleyBot"** from the dashboard
2. Describe what you want your bot to do in natural language — the Creator Bot will generate BAL code for you
3. Review the generated BAL, tweak if needed
4. Click **Test** to run it in the chat interface

Here's what a simple BaleyBot looks like in BAL:

```bal
assistant {
  "goal": "Help users find information about any topic",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["web_search", "fetch_url"]
}
```

## 6. Add a Connection (Optional)

BaleyBots can connect to external services:

1. Go to **Settings > Connections**
2. Add an AI provider (OpenAI, Anthropic, or Ollama) or a database (PostgreSQL, MySQL)
3. Your BaleyBots can now use connection-derived tools

## What's Next?

| Topic | Link |
|-------|------|
| BAL language syntax | [BAL Language Reference](./reference/BAL_LANGUAGE_REFERENCE.md) |
| BAL type system | [BAL Type System](./reference/BAL_TYPE_SYSTEM.md) |
| Built-in tools | [CLAUDE.md — Built-in Tools Reference](../CLAUDE.md) |
| Developer guide | [Developer Guide](./guides/DEVELOPER_GUIDE.md) |
| Testing | [Testing Guide](./guides/TESTING.md) |
| Streaming architecture | [Streaming UI Architecture](./architecture/STREAMING_UI_ARCHITECTURE.md) |
| Integration examples | [Integration Templates](./integration-templates/) |

## Common Commands

```bash
pnpm dev          # Start dev server with Turbopack
pnpm test         # Run test suite
pnpm type-check   # TypeScript type checking
pnpm lint         # ESLint
pnpm db:push      # Push schema changes (dev)
pnpm db:studio    # Open Drizzle Studio (database GUI)
```
