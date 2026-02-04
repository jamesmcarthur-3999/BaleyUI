# Gap Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address critical security vulnerabilities, replace stub tests with real tests, complete missing implementations, and improve error handling across the BaleyUI codebase.

**Architecture:** Security-first approach - fix vulnerabilities before features. Each fix includes tests. Prioritize by risk: SQL injection > credentials > input validation > feature completion > test coverage.

**Tech Stack:** TypeScript, Drizzle ORM, postgres.js, Zod, Vitest, tRPC

---

## Phase 1: Critical Security Fixes (Priority: CRITICAL)

### Task 1: Fix SQL Injection in Database Executor

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/connection-derived/database-executor.ts:125-165`
- Test: `apps/web/src/lib/baleybot/tools/connection-derived/__tests__/database-executor.test.ts`

**Context:** The current implementation uses `sql.unsafe()` which bypasses parameterized query safety. While there's validation in `database.ts`, sophisticated attacks could slip through.

**Step 1: Write the failing test**

Create test file:
```typescript
// apps/web/src/lib/baleybot/tools/connection-derived/__tests__/database-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('PostgresExecutor', () => {
  describe('query safety', () => {
    it('should reject queries with SQL injection patterns', async () => {
      const maliciousQueries = [
        "SELECT * FROM users; DROP TABLE users;--",
        "SELECT * FROM users WHERE id = '1' OR '1'='1'",
        "SELECT * FROM users WHERE name = '' UNION SELECT password FROM credentials--",
        "SELECT * FROM users WHERE id = 1; UPDATE users SET admin = true;--",
      ];

      for (const query of maliciousQueries) {
        // Should throw or sanitize, not execute
        await expect(
          executor.query(query)
        ).rejects.toThrow(/injection|unsafe|forbidden/i);
      }
    });

    it('should use parameterized queries for user input', async () => {
      // This test verifies the implementation uses parameters, not string concat
      const spy = vi.spyOn(sql, 'unsafe');

      await executor.queryWithParams(
        'SELECT * FROM users WHERE id = $1',
        ['user-123']
      );

      // sql.unsafe should NOT be called - we should use template literals
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/src/lib/baleybot/tools/connection-derived/__tests__/database-executor.test.ts`
Expected: FAIL - injection patterns currently execute

**Step 3: Implement SQL injection protection**

Modify `database-executor.ts`:
```typescript
// Add to imports
import { SQL_INJECTION_PATTERNS } from './database';

// Replace the unsafe query method
async query<T = Record<string, unknown>>(sqlQuery: string): Promise<T[]> {
  // Check for injection patterns BEFORE execution
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(sqlQuery)) {
      throw new Error(
        `Potentially unsafe SQL detected. Query contains forbidden pattern. ` +
        `Use parameterized queries instead.`
      );
    }
  }

  // Only allow single SELECT statements for raw queries
  const normalized = sqlQuery.trim().toLowerCase();
  if (!normalized.startsWith('select')) {
    throw new Error(
      'Raw queries only support SELECT statements. ' +
      'Use queryWithParams() for other operations.'
    );
  }

  // Check for multiple statements
  const statementCount = sqlQuery.split(';').filter(s => s.trim()).length;
  if (statementCount > 1) {
    throw new Error('Multiple SQL statements are not allowed in a single query.');
  }

  const queryPromise = this.sql.unsafe(sqlQuery) as Promise<T[]>;
  return this.executeWithTimeout(queryPromise);
}

// Add new safe parameterized query method
async queryWithParams<T = Record<string, unknown>>(
  template: string,
  params: unknown[]
): Promise<T[]> {
  // Use postgres.js tagged template for safety
  // This properly escapes all parameters
  const queryPromise = this.sql.unsafe(template, params as postgres.ParameterOrJSON<string>[]) as Promise<T[]>;
  return this.executeWithTimeout(queryPromise);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/src/lib/baleybot/tools/connection-derived/__tests__/database-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/tools/connection-derived/
git commit -m "security: add SQL injection protection to database executor"
```

---

### Task 2: Add Strict Input Validation for Flow Schemas

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/flows.ts:18-30`
- Test: `apps/web/src/lib/trpc/routers/__tests__/flows-validation.test.ts`

**Context:** Current schemas use `z.any()` which allows arbitrary data, creating attack surface.

**Step 1: Write the failing test**

```typescript
// apps/web/src/lib/trpc/routers/__tests__/flows-validation.test.ts
import { describe, it, expect } from 'vitest';
import { flowNodeSchema, flowEdgeSchema, flowTriggerSchema } from '../flows';

describe('Flow validation schemas', () => {
  describe('flowNodeSchema', () => {
    it('should reject nodes without required fields', () => {
      const invalidNodes = [
        {}, // missing everything
        { id: 'test' }, // missing type, position
        { id: 'test', type: 'baleybot' }, // missing position
        { id: 'test', type: 'invalid-type', position: { x: 0, y: 0 } }, // invalid type
      ];

      for (const node of invalidNodes) {
        expect(() => flowNodeSchema.parse(node)).toThrow();
      }
    });

    it('should accept valid node structures', () => {
      const validNode = {
        id: 'node-1',
        type: 'baleybot',
        position: { x: 100, y: 200 },
        data: { baleybotId: 'bb-123', label: 'My Bot' },
      };

      expect(() => flowNodeSchema.parse(validNode)).not.toThrow();
    });
  });

  describe('flowEdgeSchema', () => {
    it('should reject edges without required connections', () => {
      const invalidEdges = [
        {}, // missing everything
        { id: 'e1' }, // missing source/target
        { id: 'e1', source: 'n1' }, // missing target
      ];

      for (const edge of invalidEdges) {
        expect(() => flowEdgeSchema.parse(edge)).toThrow();
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/src/lib/trpc/routers/__tests__/flows-validation.test.ts`
Expected: FAIL - current z.any() accepts everything

**Step 3: Implement strict validation schemas**

Replace in `flows.ts`:
```typescript
// Node position schema
const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// Node types enum
const nodeTypeSchema = z.enum([
  'baleybot',
  'trigger',
  'condition',
  'output',
  'input',
]);

// Flow node schema with strict validation
export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: nodeTypeSchema,
  position: positionSchema,
  data: z.object({
    baleybotId: z.string().uuid().optional(),
    label: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  }).optional(),
  // React Flow specific fields
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
});

// Flow edge schema
export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
  label: z.string().optional(),
});

// Trigger types
const triggerTypeSchema = z.enum(['manual', 'schedule', 'webhook', 'event']);

export const flowTriggerSchema = z.object({
  id: z.string().min(1),
  type: triggerTypeSchema,
  nodeId: z.string().min(1),
  config: z.object({
    schedule: z.string().optional(), // cron expression
    webhookPath: z.string().optional(),
    eventName: z.string().optional(),
  }).optional(),
});

// Update the input schemas to use these
const flowNodesInput = z.array(flowNodeSchema).optional();
const flowEdgesInput = z.array(flowEdgeSchema).optional();
const flowTriggersInput = z.array(flowTriggerSchema).optional();
```

**Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/src/lib/trpc/routers/__tests__/flows-validation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/trpc/routers/flows.ts apps/web/src/lib/trpc/routers/__tests__/flows-validation.test.ts
git commit -m "security: add strict Zod validation for flow schemas"
```

---

### Task 3: Secure Credential Handling

**Files:**
- Create: `apps/web/src/lib/connections/credential-vault.ts`
- Modify: `apps/web/src/lib/connections/providers.ts`
- Test: `apps/web/src/lib/connections/__tests__/credential-vault.test.ts`

**Context:** Credentials are stored and passed as plain text. We need encryption at rest.

**Step 1: Write the failing test**

```typescript
// apps/web/src/lib/connections/__tests__/credential-vault.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CredentialVault } from '../credential-vault';

describe('CredentialVault', () => {
  let vault: CredentialVault;

  beforeEach(() => {
    vault = new CredentialVault(process.env.ENCRYPTION_KEY || 'test-key-32-chars-long-exactly!!');
  });

  it('should encrypt credentials before storage', () => {
    const plainCredential = 'super-secret-api-key';
    const encrypted = vault.encrypt(plainCredential);

    expect(encrypted).not.toBe(plainCredential);
    expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+$/); // iv:ciphertext format
  });

  it('should decrypt credentials correctly', () => {
    const plainCredential = 'super-secret-api-key';
    const encrypted = vault.encrypt(plainCredential);
    const decrypted = vault.decrypt(encrypted);

    expect(decrypted).toBe(plainCredential);
  });

  it('should produce different ciphertext for same input (IV randomization)', () => {
    const credential = 'same-credential';
    const encrypted1 = vault.encrypt(credential);
    const encrypted2 = vault.encrypt(credential);

    expect(encrypted1).not.toBe(encrypted2);
    // But both should decrypt to same value
    expect(vault.decrypt(encrypted1)).toBe(credential);
    expect(vault.decrypt(encrypted2)).toBe(credential);
  });

  it('should mask credentials in logs', () => {
    const apiKey = 'sk-1234567890abcdef';
    const masked = vault.mask(apiKey);

    expect(masked).toBe('sk-****cdef');
    expect(masked).not.toContain('1234567890');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/src/lib/connections/__tests__/credential-vault.test.ts`
Expected: FAIL - CredentialVault doesn't exist

**Step 3: Implement CredentialVault**

```typescript
// apps/web/src/lib/connections/credential-vault.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class CredentialVault {
  private key: Buffer;

  constructor(encryptionKey: string) {
    // Ensure key is exactly 32 bytes for AES-256
    this.key = Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32));
  }

  /**
   * Encrypt a credential for storage
   * Returns: iv:authTag:ciphertext (hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a credential from storage
   */
  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted credential format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Mask a credential for logging (show first 3 and last 4 chars)
   */
  mask(credential: string): string {
    if (credential.length <= 8) {
      return '****';
    }
    return `${credential.slice(0, 3)}****${credential.slice(-4)}`;
  }

  /**
   * Check if a string appears to be encrypted
   */
  isEncrypted(value: string): boolean {
    return /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/.test(value);
  }
}

// Singleton instance using environment key
let vaultInstance: CredentialVault | null = null;

export function getCredentialVault(): CredentialVault {
  if (!vaultInstance) {
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY environment variable is required. ' +
        'Generate one with: openssl rand -hex 16'
      );
    }
    vaultInstance = new CredentialVault(key);
  }
  return vaultInstance;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/src/lib/connections/__tests__/credential-vault.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/connections/credential-vault.ts apps/web/src/lib/connections/__tests__/credential-vault.test.ts
git commit -m "security: add credential encryption vault"
```

---

## Phase 2: Complete Missing Implementations (Priority: HIGH)

### Task 4: Implement Workspace Policies Enforcement

**Files:**
- Modify: `apps/web/src/lib/baleybot/services/spawn-executor.ts:210-215`
- Modify: `apps/web/src/lib/baleybot/executor.ts`
- Test: `apps/web/src/lib/baleybot/services/__tests__/spawn-executor.test.ts`

**Context:** The TODO at line 212 says "Fetch workspace policies" but it's never done. Tool approvals, spending limits, and quotas are not validated.

**Step 1: Write the failing test**

```typescript
// apps/web/src/lib/baleybot/services/__tests__/spawn-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSpawnBaleybotExecutor } from '../spawn-executor';

describe('SpawnBaleybotExecutor', () => {
  describe('workspace policies', () => {
    it('should reject spawn if target BB uses forbidden tools', async () => {
      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          forbiddenTools: ['database_query'],
          maxSpawnDepth: 3,
        }),
      });

      // Mock a BB that uses forbidden tool
      vi.mock('@baleyui/db', () => ({
        db: {
          query: {
            baleybots: {
              findFirst: vi.fn().mockResolvedValue({
                id: 'bb-1',
                name: 'data-bot',
                balCode: 'bot { "tools": ["database_query"] }',
              }),
            },
          },
        },
      }));

      const ctx = { workspaceId: 'ws-1', baleybotId: 'parent', executionId: 'exec-1', userId: 'user-1' };

      await expect(
        executor('data-bot', {}, ctx)
      ).rejects.toThrow(/forbidden.*database_query/i);
    });

    it('should enforce execution time limits from policies', async () => {
      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          maxExecutionTimeMs: 100, // Very short timeout
        }),
      });

      // This should timeout
      await expect(
        executor('slow-bot', {}, ctx)
      ).rejects.toThrow(/timeout|exceeded/i);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/src/lib/baleybot/services/__tests__/spawn-executor.test.ts`
Expected: FAIL - policies not fetched or enforced

**Step 3: Implement policy fetching and enforcement**

Add to `spawn-executor.ts`:
```typescript
// Add type for policy provider
type PolicyProvider = (workspaceId: string) => Promise<WorkspacePolicies | null>;

// Add to createSpawnBaleybotExecutor options
export function createSpawnBaleybotExecutor(options?: {
  maxSpawnDepth?: number;
  getTools?: (ctx: BuiltInToolContext) => Map<string, RuntimeToolDefinition>;
  getPolicies?: PolicyProvider;
}): SpawnBaleybotExecutor {
  const maxDepth = options?.maxSpawnDepth ?? DEFAULT_MAX_SPAWN_DEPTH;
  const getTools = options?.getTools ?? getBuiltInRuntimeTools;
  const getPolicies = options?.getPolicies ?? fetchWorkspacePolicies;

  async function spawnBaleybot(/* ... */): Promise<SpawnBaleybotResult> {
    // ... existing depth check ...

    // Fetch and enforce workspace policies
    const policies = await getPolicies(ctx.workspaceId);

    if (policies) {
      // Check spawn depth against policy
      const policyMaxDepth = policies.maxSpawnDepth ?? maxDepth;
      if (currentDepth >= policyMaxDepth) {
        throw new Error(
          `Workspace policy limits spawn depth to ${policyMaxDepth}. ` +
          `Current depth: ${currentDepth}`
        );
      }

      // Check if target BB uses forbidden tools
      if (policies.forbiddenTools?.length && targetBB.balCode) {
        const usedTools = extractToolsFromBAL(targetBB.balCode);
        const forbidden = usedTools.filter(t => policies.forbiddenTools!.includes(t));
        if (forbidden.length > 0) {
          throw new Error(
            `Cannot spawn "${targetBB.name}": uses forbidden tools: ${forbidden.join(', ')}`
          );
        }
      }
    }

    // ... rest of implementation ...
  }

  return spawnBaleybot;
}

// Helper to fetch policies from DB
async function fetchWorkspacePolicies(workspaceId: string): Promise<WorkspacePolicies | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { policies: true },
  });
  return workspace?.policies ?? null;
}

// Helper to extract tools from BAL code
function extractToolsFromBAL(balCode: string): string[] {
  const toolsMatch = balCode.match(/"tools"\s*:\s*\[(.*?)\]/s);
  if (!toolsMatch) return [];

  const toolsStr = toolsMatch[1];
  const tools = toolsStr.match(/"([^"]+)"/g) || [];
  return tools.map(t => t.replace(/"/g, ''));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/src/lib/baleybot/services/__tests__/spawn-executor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/baleybot/services/spawn-executor.ts apps/web/src/lib/baleybot/services/__tests__/spawn-executor.test.ts
git commit -m "feat: implement workspace policies enforcement in spawn executor"
```

---

### Task 5: Remove or Implement MySQL Support

**Files:**
- Modify: `apps/web/src/lib/baleybot/tools/connection-derived/database-executor.ts:200-220`
- Modify: `apps/web/src/lib/connections/providers.ts` (if removing)

**Context:** MySQL support is advertised but throws "not implemented" error. Either implement it or remove it cleanly.

**Decision Required:** Implement MySQL or remove it?

**Option A: Remove MySQL (recommended if not needed soon)**

**Step 1: Remove MySQL references**

```typescript
// In database-executor.ts, replace MySQL class with clear error
export function createDatabaseExecutor(
  type: 'postgres' | 'mysql',
  config: DatabaseConnectionConfig
): DatabaseExecutor {
  if (type === 'mysql') {
    throw new Error(
      'MySQL connections are not yet supported. ' +
      'Please use PostgreSQL, or contact support if MySQL is required for your use case.'
    );
  }

  return new PostgresExecutor(config);
}
```

**Step 2: Update UI to hide MySQL option**

In any connection type selector UI, filter out MySQL until implemented.

**Step 3: Commit**

```bash
git add apps/web/src/lib/baleybot/tools/connection-derived/database-executor.ts
git commit -m "chore: clarify MySQL support not yet available"
```

**Option B: Implement MySQL**

This requires mysql2 package installation and a parallel implementation to PostgresExecutor. Estimate: 2-3 hours additional work. Skip for now unless required.

---

### Task 6: Add Error Context and Structured Logging

**Files:**
- Create: `apps/web/src/lib/errors/execution-error.ts`
- Modify: `apps/web/src/lib/baleybot/executor.ts:190-200`
- Test: `apps/web/src/lib/errors/__tests__/execution-error.test.ts`

**Context:** Current error handling loses context. We need structured errors with codes, context, and recovery hints.

**Step 1: Write the failing test**

```typescript
// apps/web/src/lib/errors/__tests__/execution-error.test.ts
import { describe, it, expect } from 'vitest';
import { ExecutionError, ErrorCode } from '../execution-error';

describe('ExecutionError', () => {
  it('should preserve error context', () => {
    const cause = new Error('Database connection failed');
    const error = new ExecutionError({
      code: ErrorCode.TOOL_EXECUTION_FAILED,
      message: 'Failed to execute database_query tool',
      context: {
        toolName: 'database_query',
        baleybotId: 'bb-123',
        executionId: 'exec-456',
      },
      cause,
    });

    expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
    expect(error.context.toolName).toBe('database_query');
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toMatchObject({
      code: 'TOOL_EXECUTION_FAILED',
      message: 'Failed to execute database_query tool',
      context: { toolName: 'database_query' },
    });
  });

  it('should provide recovery hints', () => {
    const error = new ExecutionError({
      code: ErrorCode.APPROVAL_TIMEOUT,
      message: 'Tool approval request timed out',
      recoveryHint: 'Check the Approvals page to manually approve pending requests.',
    });

    expect(error.recoveryHint).toContain('Approvals page');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test apps/web/src/lib/errors/__tests__/execution-error.test.ts`
Expected: FAIL - ExecutionError doesn't exist

**Step 3: Implement ExecutionError**

```typescript
// apps/web/src/lib/errors/execution-error.ts

export enum ErrorCode {
  // Execution errors
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED = 'EXECUTION_CANCELLED',

  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_FORBIDDEN = 'TOOL_FORBIDDEN',

  // Approval errors
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',
  APPROVAL_TIMEOUT = 'APPROVAL_TIMEOUT',

  // Policy errors
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  SPAWN_DEPTH_EXCEEDED = 'SPAWN_DEPTH_EXCEEDED',

  // Resource errors
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface ExecutionErrorOptions {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
  cause?: Error;
  recoveryHint?: string;
}

export class ExecutionError extends Error {
  public readonly code: ErrorCode;
  public readonly context: Record<string, unknown>;
  public readonly cause?: Error;
  public readonly recoveryHint?: string;
  public readonly timestamp: Date;

  constructor(options: ExecutionErrorOptions) {
    super(options.message);
    this.name = 'ExecutionError';
    this.code = options.code;
    this.context = options.context ?? {};
    this.cause = options.cause;
    this.recoveryHint = options.recoveryHint;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExecutionError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoveryHint: this.recoveryHint,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
    };
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    let msg = this.message;
    if (this.recoveryHint) {
      msg += `\n\nSuggestion: ${this.recoveryHint}`;
    }
    return msg;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test apps/web/src/lib/errors/__tests__/execution-error.test.ts`
Expected: PASS

**Step 5: Integrate into executor**

Update `executor.ts` catch block:
```typescript
catch (err) {
  status = 'failed';

  if (err instanceof ExecutionError) {
    error = err.toUserMessage();
    // Log full context for debugging
    console.error('[executor] Execution failed:', err.toJSON());
  } else {
    const execError = new ExecutionError({
      code: ErrorCode.EXECUTION_FAILED,
      message: err instanceof Error ? err.message : 'Unknown error during execution',
      context: {
        baleybotId: context.baleybotId,
        executionId: context.executionId,
      },
      cause: err instanceof Error ? err : undefined,
    });
    error = execError.toUserMessage();
    console.error('[executor] Execution failed:', execError.toJSON());
  }
}
```

**Step 6: Commit**

```bash
git add apps/web/src/lib/errors/ apps/web/src/lib/baleybot/executor.ts
git commit -m "feat: add structured execution errors with context"
```

---

## Phase 3: Test Coverage Improvements (Priority: MEDIUM)

### Task 7: Add Integration Tests for Database Operations

**Files:**
- Create: `apps/web/src/lib/trpc/routers/__tests__/flows.integration.test.ts`
- Modify: `vitest.config.ts` (add integration test config)

**Context:** Current tests use mock database. Need real database integration tests.

**Step 1: Create test database setup**

```typescript
// apps/web/src/lib/trpc/routers/__tests__/flows.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db, flows, eq } from '@baleyui/db';
import { createCaller } from '../../trpc';
import { createTestContext } from './test-utils';

// Skip if no test database configured
const SKIP_INTEGRATION = !process.env.TEST_DATABASE_URL;

describe.skipIf(SKIP_INTEGRATION)('flows router integration', () => {
  let caller: ReturnType<typeof createCaller>;
  let testWorkspaceId: string;

  beforeAll(async () => {
    // Create test workspace
    testWorkspaceId = 'test-workspace-' + Date.now();
    const ctx = await createTestContext({ workspaceId: testWorkspaceId });
    caller = createCaller(ctx);
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(flows).where(eq(flows.workspaceId, testWorkspaceId));
  });

  beforeEach(async () => {
    // Clean flows before each test
    await db.delete(flows).where(eq(flows.workspaceId, testWorkspaceId));
  });

  it('should create and retrieve a flow', async () => {
    const created = await caller.flows.create({
      name: 'Test Flow',
      description: 'Integration test',
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Test Flow');

    const retrieved = await caller.flows.get({ id: created.id });
    expect(retrieved.id).toBe(created.id);
  });

  it('should handle optimistic locking on concurrent updates', async () => {
    const flow = await caller.flows.create({ name: 'Concurrent Test' });

    // Simulate concurrent updates with same version
    const update1 = caller.flows.update({
      id: flow.id,
      version: flow.version,
      name: 'Update 1',
    });

    const update2 = caller.flows.update({
      id: flow.id,
      version: flow.version, // Same version - should conflict
      name: 'Update 2',
    });

    // One should succeed, one should fail
    const results = await Promise.allSettled([update1, update2]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });
});
```

**Step 2: Run test**

Run: `TEST_DATABASE_URL=postgres://... pnpm test apps/web/src/lib/trpc/routers/__tests__/flows.integration.test.ts`

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/__tests__/flows.integration.test.ts
git commit -m "test: add integration tests for flows router"
```

---

### Task 8: Add Tests for Critical Services

**Files:**
- Create: `apps/web/src/lib/baleybot/services/__tests__/memory-storage.test.ts`
- Create: `apps/web/src/lib/baleybot/services/__tests__/schedule-service.test.ts`
- Create: `apps/web/src/lib/baleybot/services/__tests__/notification-service.test.ts`

**Context:** These services have no tests but handle critical functionality.

**Step 1: Write memory storage tests**

```typescript
// apps/web/src/lib/baleybot/services/__tests__/memory-storage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryStorageService } from '../memory-storage';

// Mock the database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybotMemory: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: '1' }]) })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn() })),
  },
  baleybotMemory: { id: 'id', workspaceId: 'workspaceId', baleybotId: 'baleybotId', key: 'key' },
  eq: vi.fn(),
  and: vi.fn(),
}));

describe('MemoryStorageService', () => {
  const service = createMemoryStorageService();
  const ctx = {
    workspaceId: 'ws-1',
    baleybotId: 'bb-1',
    executionId: 'exec-1',
    userId: 'user-1',
  };

  it('should get a stored value', async () => {
    const { db } = await import('@baleyui/db');
    vi.mocked(db.query.baleybotMemory.findFirst).mockResolvedValue({
      id: '1',
      key: 'test-key',
      value: { data: 'test-value' },
    });

    const result = await service.get('test-key', ctx);
    expect(result).toEqual({ data: 'test-value' });
  });

  it('should return null for non-existent key', async () => {
    const { db } = await import('@baleyui/db');
    vi.mocked(db.query.baleybotMemory.findFirst).mockResolvedValue(null);

    const result = await service.get('missing-key', ctx);
    expect(result).toBeNull();
  });

  it('should list all keys for a baleybot', async () => {
    const { db } = await import('@baleyui/db');
    vi.mocked(db.query.baleybotMemory.findMany).mockResolvedValue([
      { key: 'key1' },
      { key: 'key2' },
      { key: 'key3' },
    ]);

    const keys = await service.list(ctx);
    expect(keys).toEqual(['key1', 'key2', 'key3']);
  });
});
```

**Step 2: Run tests**

Run: `pnpm test apps/web/src/lib/baleybot/services/__tests__/`

**Step 3: Commit**

```bash
git add apps/web/src/lib/baleybot/services/__tests__/
git commit -m "test: add unit tests for baleybot services"
```

---

## Phase 4: Documentation and Cleanup (Priority: LOW)

### Task 9: Document Security Patterns

**Files:**
- Create: `docs/architecture/security.md`

**Content should cover:**
- Credential handling with CredentialVault
- SQL injection prevention
- Input validation with Zod
- Workspace policies
- Tool approval flow

### Task 10: Remove Dead Code and TODO Comments

**Files:**
- Audit all TODO comments
- Remove unused exports
- Clean up commented-out code

---

## Summary

| Phase | Tasks | Priority | Estimated Effort |
|-------|-------|----------|------------------|
| 1: Security | 3 tasks | CRITICAL | 4-6 hours |
| 2: Implementation | 3 tasks | HIGH | 3-4 hours |
| 3: Test Coverage | 2 tasks | MEDIUM | 2-3 hours |
| 4: Documentation | 2 tasks | LOW | 1-2 hours |

**Total: 10 tasks, ~10-15 hours**

**Recommended execution order:**
1. Task 1 (SQL injection) - highest risk
2. Task 2 (Input validation) - high risk
3. Task 3 (Credentials) - high risk
4. Task 6 (Error handling) - improves debugging
5. Task 4 (Workspace policies) - completes feature
6. Task 5 (MySQL decision) - removes technical debt
7. Tasks 7-8 (Tests) - increases confidence
8. Tasks 9-10 (Docs/cleanup) - maintenance
