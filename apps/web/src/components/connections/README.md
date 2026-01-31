# Connections Module

The Connections module provides a complete solution for managing AI provider connections in BaleyUI.

## Features

- Support for multiple AI providers (OpenAI, Anthropic, Ollama)
- Encrypted storage of API keys
- Connection testing and status tracking
- Default connection per provider type
- Ollama local model discovery
- Soft delete support
- Type-safe tRPC API

## Architecture

### Backend (tRPC)

**Router**: `/apps/web/src/lib/trpc/routers/connections.ts`

Endpoints:
- `list` - Get all connections for workspace
- `get` - Get single connection by ID
- `create` - Create new connection (encrypts API keys)
- `update` - Update connection
- `delete` - Soft delete connection
- `test` - Test connection (calls provider API)
- `setDefault` - Set as default connection for provider type
- `refreshOllamaModels` - Refresh local Ollama models

### Utilities

**Encryption**: `/apps/web/src/lib/encryption/index.ts`
- AES-256-GCM encryption for API keys
- Uses `ENCRYPTION_KEY` from environment (64 hex characters)
- Automatic encryption/decryption of sensitive fields
- Format: `iv:authTag:encrypted` (all hex encoded)

**Provider Definitions**: `/apps/web/src/lib/connections/providers.ts`
- Provider metadata and configuration schema
- Type definitions for connection configs

**Connection Testing**: `/apps/web/src/lib/connections/test.ts`
- Provider-specific test functions
- OpenAI: Fetches models list
- Anthropic: Makes minimal API call
- Ollama: Lists local models

**Ollama Utilities**: `/apps/web/src/lib/connections/ollama.ts`
- List models
- Pull models (streaming)
- Delete models
- Get model info

### Frontend Components

**ConnectionsList** - Main list view with cards
**ConnectionCard** - Individual connection card with actions
**AddConnectionDialog** - Dialog to create new connection
**TestConnectionButton** - Reusable test button with status
**OpenAIForm** - OpenAI-specific configuration form
**AnthropicForm** - Anthropic-specific configuration form
**OllamaForm** - Ollama-specific form with model browser

### Pages

- `/settings` - Settings overview
- `/settings/connections` - Connections management page

## Setup

### 1. Environment Variables

Add to `.env.local`:

```bash
# Generate a random 32-byte encryption key (64 hex characters)
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 2. Database Migration

The `connections` table should already exist from the schema. If not, run:

```bash
pnpm db:push
```

### 3. Usage

Navigate to `/settings/connections` to add your first connection.

## Provider-Specific Setup

### OpenAI

1. Get API key from https://platform.openai.com/api-keys
2. Add connection with API key
3. Optional: Add organization ID for multi-org accounts

### Anthropic

1. Get API key from https://console.anthropic.com/settings/keys
2. Add connection with API key

### Ollama

1. Install Ollama from https://ollama.ai
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull llama2`
4. Add connection with base URL (default: http://localhost:11434)

## Security

- API keys are encrypted using AES-256-GCM before storage
- Encryption key must be set via `ENCRYPTION_SECRET` environment variable
- Keys are never logged or exposed in API responses (masked for display)
- Soft delete prevents accidental data loss

## Status Tracking

Connections have three statuses:
- **unconfigured** - Initial state, not tested yet
- **connected** - Successfully tested
- **error** - Test failed

Status is automatically updated when testing a connection.

## Default Connections

Each provider type can have one default connection. This is used when creating blocks that don't specify a connection explicitly.

## Example Usage in Code

```typescript
import { trpc } from '@/lib/trpc/client';

// List all connections
const { data: connections } = trpc.connections.list.useQuery();

// Create new connection
const createMutation = trpc.connections.create.useMutation();
createMutation.mutate({
  type: 'openai',
  name: 'My OpenAI',
  config: {
    apiKey: 'sk-...',
    baseUrl: 'https://api.openai.com/v1'
  }
});

// Test connection
const testMutation = trpc.connections.test.useMutation();
testMutation.mutate({ id: connectionId });
```
