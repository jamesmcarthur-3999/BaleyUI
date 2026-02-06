# BaleyUI Testing Guide

This guide explains how to set up a demo workspace and test all BaleyUI features.

## Quick Start

### 1. Prerequisites

- PostgreSQL running locally
- Node.js 18+ installed
- pnpm installed
- Clerk account (for authentication)
- OpenAI or Anthropic API key (for AI features)

### 2. Database Setup

```bash
# Create the database
psql -h localhost -d postgres -c "CREATE DATABASE baleyui"

# Push the schema
cd packages/db
echo "DATABASE_URL=postgresql://$(whoami)@localhost:5432/baleyui" > .env
npx dotenv -e .env -- npx drizzle-kit push
```

### 3. Environment Variables

Create `apps/web/.env.local`:

```env
# Database
DATABASE_URL=postgresql://username@localhost:5432/baleyui

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=<64-character-hex-string>

# AI Providers (at least one required for AI blocks)
# Add these in the UI under Settings > Connections
```

### 4. Seed Demo Data

```bash
# From project root
npx tsx scripts/run-seed.ts

# Or from packages/db
cd packages/db
npx dotenv -e .env -- npx tsx src/seed.ts
```

### 5. Start Development Server

```bash
pnpm dev
```

Visit `http://localhost:3000` and sign in with Clerk.

---

## Demo Workspace Contents

The seed script creates:

### Connections (3)
| Name | Type | Status |
|------|------|--------|
| OpenAI Production | openai | unconfigured |
| Anthropic Claude | anthropic | unconfigured |
| Local Ollama | ollama | unconfigured |

**Note:** Configure at least one AI connection in Settings > Connections before testing AI blocks.

### Tools (4)
| Name | Description |
|------|-------------|
| add | Add two numbers |
| multiply | Multiply two numbers |
| getCurrentWeather | Get weather for a location |
| searchDatabase | Search product database |

### Blocks (8)

**AI Blocks (5):**
| Name | Model | Tools |
|------|-------|-------|
| Sentiment Analyzer | gpt-4o-mini | - |
| Customer Support Bot | gpt-4o | - |
| Math Solver | gpt-4o-mini | add, multiply |
| Weather Assistant | gpt-4o-mini | getCurrentWeather |
| Product Recommender | gpt-4o | searchDatabase |

**Function Blocks (3):**
| Name | Purpose |
|------|---------|
| JSON Formatter | Pretty-print JSON |
| Data Validator | Validate required fields |
| Response Wrapper | Wrap in standard format |

### Flows (4)
| Name | Pattern | Description |
|------|---------|-------------|
| Simple Sentiment Analysis | Linear | Source → AI → Function → Sink |
| Customer Support Pipeline | Router | Routes by category |
| Math Problem Solver | Tool Calling | AI with calculator tools |
| Parallel Analysis Pipeline | Parallel | Multiple AI blocks in parallel |

### Historical Data
- ~100 flow executions
- ~300 block executions
- ~75 decisions (20% with feedback)
- 5 extracted patterns
- 3 API keys

---

## Test Scenarios Checklist

### Authentication & Workspace
- [ ] Sign in with Clerk
- [ ] Create workspace (first-time user)
- [ ] Access demo workspace
- [ ] Switch workspaces (if multiple)

### Connections
- [ ] View connections list
- [ ] Add new connection (OpenAI)
- [ ] Test connection
- [ ] Edit connection
- [ ] Delete connection
- [ ] See status indicators

### Blocks
- [ ] View blocks list with filters
- [ ] Create AI block
- [ ] Create function block
- [ ] Edit block configuration
- [ ] Test block with sample input
- [ ] View block analytics
- [ ] Delete block

### Flows
- [ ] View flows list
- [ ] Create new flow
- [ ] Open flow editor
- [ ] Add nodes (source, sink, AI, function, router, parallel, loop)
- [ ] Connect nodes with edges
- [ ] Configure node settings
- [ ] Save flow (auto-save)
- [ ] Enable/disable flow
- [ ] Test run flow
- [ ] View execution in real-time
- [ ] Delete flow

### Executions
- [ ] View executions list
- [ ] Filter by status/flow
- [ ] View execution detail
- [ ] See streaming timeline
- [ ] View tool calls
- [ ] Cancel running execution

### Decisions
- [ ] View decisions list
- [ ] Infinite scroll/pagination
- [ ] View decision detail
- [ ] Provide feedback (correct/incorrect)
- [ ] Add feedback notes
- [ ] Submit corrected output

### Analytics
- [ ] View analytics overview
- [ ] See cost breakdown
- [ ] View latency metrics
- [ ] Change date range
- [ ] Export training data

### Settings
- [ ] View settings page
- [ ] Edit workspace name
- [ ] Manage API keys
- [ ] Create new API key
- [ ] Copy API key
- [ ] Revoke API key

### API Testing
- [ ] Access Swagger UI (/api/docs)
- [ ] Execute flow via REST API
- [ ] Get execution status via API
- [ ] Stream execution via SSE
- [ ] Test with invalid API key

---

## API Testing Examples

### Execute a Flow

```bash
# Get your API key from Settings > API Keys
API_KEY="bui_live_xxx..."

# Execute the sentiment analysis flow
curl -X POST http://localhost:3000/api/v1/flows/eeeeeeee-0000-0000-0000-000000000001/execute \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "I love this product!"}'
```

### Get Execution Status

```bash
curl http://localhost:3000/api/v1/executions/$EXECUTION_ID \
  -H "Authorization: Bearer $API_KEY"
```

### Stream Execution

```bash
curl http://localhost:3000/api/v1/executions/$EXECUTION_ID/stream \
  -H "Authorization: Bearer $API_KEY" \
  -H "Accept: text/event-stream"
```

---

## Troubleshooting

### "Demo workspace already exists"

The seed script automatically cleans up existing demo data. If you want to manually reset:

```sql
DELETE FROM workspaces WHERE slug = 'demo';
```

### "Connection not configured"

AI blocks require a configured connection. Go to Settings > Connections and add your API key.

### "Failed to execute flow"

1. Check that the flow is enabled
2. Verify the connection is configured and working
3. Check the execution logs for specific errors

### Database connection issues

Verify your DATABASE_URL:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

---

## Re-seeding

To reset and re-seed the demo workspace:

```bash
npx tsx scripts/run-seed.ts
```

This will:
1. Delete the existing demo workspace (cascades to all related data)
2. Create fresh demo data
3. Generate new API keys (old keys will be invalid)
