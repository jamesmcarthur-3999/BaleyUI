# Security Architecture

This document describes the security patterns and practices used in BaleyUI to protect user data and prevent common vulnerabilities.

## Table of Contents

1. [Credential Handling](#credential-handling)
2. [SQL Injection Prevention](#sql-injection-prevention)
3. [Input Validation](#input-validation)
4. [Workspace Policies](#workspace-policies)
5. [Tool Approval Flow](#tool-approval-flow)

---

## Credential Handling

### Overview

Sensitive credentials (API keys, database passwords, etc.) are encrypted at rest using AES-256-GCM encryption before being stored in the database.

### Implementation

The `CredentialVault` class in `apps/web/src/lib/connections/credential-vault.ts` provides:

- **Encryption**: AES-256-GCM with randomized IVs
- **Decryption**: With authentication tag validation
- **Masking**: For safe logging (`sk-****cdef` format)

### Usage

```typescript
import { CredentialVault, getCredentialVault } from '@/lib/connections/credential-vault';

// Get singleton instance (uses CREDENTIAL_ENCRYPTION_KEY env var)
const vault = getCredentialVault();

// Encrypt before storing
const encrypted = vault.encrypt(apiKey);
await db.insert(connections).values({ credentials: encrypted });

// Decrypt when needed
const apiKey = vault.decrypt(encrypted);

// Safe logging
console.log(`Using key: ${vault.mask(apiKey)}`); // "Using key: sk-****cdef"
```

### Configuration

Set `CREDENTIAL_ENCRYPTION_KEY` environment variable:

```bash
# Generate a secure key
openssl rand -hex 16

# Set in environment
CREDENTIAL_ENCRYPTION_KEY=your-32-char-key-here
```

### Security Properties

| Property | Guarantee |
|----------|-----------|
| Encryption | AES-256-GCM (authenticated encryption) |
| IV Randomization | Same plaintext produces different ciphertext |
| Tamper Detection | Auth tag validates ciphertext integrity |
| Key Requirements | 32 bytes (256 bits) |

---

## SQL Injection Prevention

### Overview

Database queries are protected against SQL injection attacks using pattern detection and parameterized queries.

### Implementation

The `validateSQLQuery` function in `apps/web/src/lib/baleybot/tools/connection-derived/database-executor.ts` provides:

- **Pattern Detection**: Blocks known injection patterns
- **Statement Limiting**: Only single SELECT statements allowed for raw queries
- **Parameterized Queries**: Safe parameter binding via `queryWithParams()`

### Blocked Patterns

```typescript
// Examples of blocked patterns
SQL_INJECTION_PATTERNS = [
  /;\s*drop\s+/i,           // DROP after semicolon
  /;\s*truncate\s+/i,       // TRUNCATE after semicolon
  /--/,                     // SQL comments
  /\/\*/,                   // Block comments
  /\bunion\s+select/i,      // UNION injection
  /\bsleep\s*\(/i,          // Time-based attacks
  // ... and more
];
```

### Safe Query Usage

```typescript
import { createPostgresExecutor, validateSQLQuery } from './database-executor';

// Raw queries (SELECT only, validated)
const results = await executor.query('SELECT * FROM users WHERE id = 1');

// Parameterized queries (recommended)
const results = await executor.queryWithParams(
  'SELECT * FROM users WHERE id = $1 AND status = $2',
  [userId, 'active']
);

// Validation check
const validation = validateSQLQuery(userInput, { allowOnlySelect: true });
if (!validation.safe) {
  throw new Error(validation.reason);
}
```

---

## Input Validation

### Overview

All user input is validated using Zod schemas before processing. This prevents malformed data from reaching business logic.

### Flow Schema Validation

The flows router (`apps/web/src/lib/trpc/routers/flows.ts`) uses strict schemas:

```typescript
// Node validation
export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['baleybot', 'trigger', 'condition', 'output', 'input']),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    baleybotId: z.string().uuid().optional(),
    label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  }).optional(),
});

// Edge validation
export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  // ... optional fields
});

// Trigger validation
export const flowTriggerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['manual', 'schedule', 'webhook', 'event']),
  nodeId: z.string().min(1),
});
```

### Best Practices

1. **Never use `z.any()`** - Always define explicit schemas
2. **Validate early** - Check input at API boundaries
3. **Use enums** - Restrict values to known valid options
4. **Set constraints** - Use `.min()`, `.max()`, `.uuid()`, etc.

---

## Workspace Policies

### Overview

Workspace policies control what tools BaleyBots can use and how they execute. Policies are enforced at spawn time and during execution.

### Policy Types

| Policy | Description |
|--------|-------------|
| `allowedTools` | Whitelist of permitted tools |
| `forbiddenTools` | Blacklist of blocked tools |
| `requiresApprovalTools` | Tools that need user approval |
| `maxSpawnDepth` | Maximum nesting level for spawn_baleybot |
| `maxAutoApproveAmount` | Maximum amount for auto-approved spending |

### Enforcement Points

1. **Spawn Time**: Before executing a spawned BaleyBot
2. **Tool Execution**: Before running any tool
3. **Approval Flow**: For sensitive operations

### Implementation

```typescript
// In spawn-executor.ts
const policies = await fetchWorkspacePolicies(ctx.workspaceId);

if (policies) {
  // Check forbidden tools
  const usedTools = extractToolsFromBAL(targetBB.balCode);
  const validation = validateToolsAgainstPolicies(usedTools, policies);

  if (!validation.valid) {
    throw new Error(`Cannot spawn: ${validation.reason}`);
  }
}
```

### Database Schema

```sql
CREATE TABLE workspace_policies (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  allowed_tools JSONB,        -- string[]
  forbidden_tools JSONB,      -- string[]
  requires_approval_tools JSONB,
  max_auto_approve_amount INTEGER,
  reapproval_interval_days INTEGER DEFAULT 90
);
```

---

## Tool Approval Flow

### Overview

Sensitive tools require user approval before execution. This prevents BaleyBots from performing dangerous operations without oversight.

### Tool Categories

| Category | Approval | Examples |
|----------|----------|----------|
| Safe | No | `web_search`, `fetch_url` |
| Moderate | Conditional | `database_query` (writes only) |
| Dangerous | Always | `schedule_task`, `create_agent` |

### Approval Process

1. **Tool Request**: BaleyBot requests to use a tool
2. **Policy Check**: System checks if approval is required
3. **Pending State**: Execution pauses, approval record created
4. **User Decision**: User approves or denies via UI
5. **Execution**: Tool runs if approved, error if denied

### Built-in Tool Approval Matrix

```typescript
const BUILT_IN_TOOLS_METADATA = {
  web_search: { requiresApproval: false },
  fetch_url: { requiresApproval: false },
  spawn_baleybot: { requiresApproval: false },
  send_notification: { requiresApproval: false },
  store_memory: { requiresApproval: false },
  schedule_task: { requiresApproval: true },  // Creates future executions
  create_agent: { requiresApproval: true },   // Can create persistent agents
  create_tool: { requiresApproval: true },    // Can create new tools
};
```

### Dynamic Approval

Tools can specify dynamic approval logic:

```typescript
const databaseTool = {
  name: 'database_query',
  needsApproval: (args) => {
    // Only require approval for write operations
    return detectQueryIntent(args.query) !== 'read';
  },
};
```

---

## Security Checklist

Before deploying, verify:

- [ ] `CREDENTIAL_ENCRYPTION_KEY` is set and secure
- [ ] Database credentials are encrypted
- [ ] SQL injection patterns are blocked
- [ ] Input validation schemas are in place
- [ ] Workspace policies are configured
- [ ] Tool approvals are working
- [ ] Error messages don't leak sensitive info

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create a public issue
2. Email security concerns to the maintainers
3. Include steps to reproduce
4. Allow time for a fix before disclosure
