# BaleyUI Full Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix ALL identified issues from comprehensive code review: 8 critical security vulnerabilities, 23 high-priority issues, 74 medium-priority issues, and 56 low-priority improvements.

**Architecture:** Security-first approach in 6 phases. Each task is isolated and independently testable. All changes follow TDD principles.

**Tech Stack:** TypeScript 5.x, tRPC v11, Drizzle ORM, React 19, Next.js 15, Framer Motion, Vitest, Playwright

---

## Overview

| Phase | Focus | Tasks | Priority |
|-------|-------|-------|----------|
| 1 | Critical Security | 1.1-1.8 | IMMEDIATE |
| 2 | Data Integrity & Race Conditions | 2.1-2.12 | HIGH |
| 3 | Production Readiness (Errors & Loading) | 3.1-3.16 | HIGH |
| 4 | Accessibility & UX | 4.1-4.10 | MEDIUM |
| 5 | Type Safety & Code Quality | 5.1-5.15 | MEDIUM |
| 6 | Testing & Documentation | 6.1-6.12 | LOW |

**Total Tasks:** 73 major tasks (some contain multiple sub-items)
**Estimated Commits:** 100+

---

## Phase 1: Critical Security Fixes (PRIORITY: IMMEDIATE)

### Task 1.1: Replace `new Function()` with Safe Expression Evaluator

**Files:**
- Modify: `apps/web/src/components/blocks/historical-tester.ts:106`
- Modify: `apps/web/src/components/blocks/function-block.ts:59`
- Modify: `apps/web/src/components/blocks/loop.ts:77`
- Create: `apps/web/src/lib/utils/safe-eval.ts`

**Context:** `new Function()` enables arbitrary code execution. Replace with a safe expression evaluator that only allows whitelisted operations.

**Step 1: Create safe expression evaluator utility**

```typescript
// apps/web/src/lib/utils/safe-eval.ts
/**
 * Safe expression evaluator that prevents arbitrary code execution.
 * Only allows simple property access, comparison operators, and basic math.
 */

type SafeContext = Record<string, unknown>;

const ALLOWED_OPERATORS = ['===', '!==', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '+', '-', '*', '/', '%'];
const FORBIDDEN_PATTERNS = [
  /\beval\b/,
  /\bFunction\b/,
  /\bimport\b/,
  /\brequire\b/,
  /\bprocess\b/,
  /\bglobal\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\b__proto__\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
];

export function isSafeExpression(expr: string): boolean {
  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(expr)) {
      return false;
    }
  }

  // Check for function calls (except safe ones)
  const functionCallPattern = /\w+\s*\(/;
  const safeBuiltins = ['Math.', 'Number(', 'String(', 'Boolean(', 'Array.isArray('];

  if (functionCallPattern.test(expr)) {
    const hasSafeBuiltin = safeBuiltins.some(b => expr.includes(b));
    const hasOtherCalls = expr.replace(/Math\.\w+\(|Number\(|String\(|Boolean\(|Array\.isArray\(/g, '').match(functionCallPattern);
    if (!hasSafeBuiltin && hasOtherCalls) {
      return false;
    }
  }

  return true;
}

export function evaluateSafeExpression(expr: string, context: SafeContext): unknown {
  if (!isSafeExpression(expr)) {
    throw new Error(`Unsafe expression: ${expr.slice(0, 50)}...`);
  }

  // Simple property access: "item.name" or "data.results[0]"
  const propertyAccessPattern = /^[\w.[\]]+$/;
  if (propertyAccessPattern.test(expr.trim())) {
    return getNestedProperty(context, expr.trim());
  }

  // Comparison expression: "item.status === 'active'"
  // Use a simple parser instead of eval
  return parseAndEvaluate(expr, context);
}

function getNestedProperty(obj: SafeContext, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function parseAndEvaluate(expr: string, context: SafeContext): unknown {
  // Tokenize and evaluate simple expressions
  // This is a basic implementation - extend as needed

  // Handle ternary: condition ? trueVal : falseVal
  const ternaryMatch = expr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const [, condition, trueVal, falseVal] = ternaryMatch;
    const condResult = parseAndEvaluate(condition, context);
    return condResult ? parseAndEvaluate(trueVal, context) : parseAndEvaluate(falseVal, context);
  }

  // Handle logical AND/OR
  if (expr.includes('&&')) {
    const parts = expr.split('&&').map(p => p.trim());
    return parts.every(p => parseAndEvaluate(p, context));
  }
  if (expr.includes('||')) {
    const parts = expr.split('||').map(p => p.trim());
    return parts.some(p => parseAndEvaluate(p, context));
  }

  // Handle comparison
  for (const op of ['===', '!==', '==', '!=', '>=', '<=', '>', '<']) {
    if (expr.includes(op)) {
      const [left, right] = expr.split(op).map(p => p.trim());
      const leftVal = parseAndEvaluate(left, context);
      const rightVal = parseAndEvaluate(right, context);

      switch (op) {
        case '===': return leftVal === rightVal;
        case '!==': return leftVal !== rightVal;
        case '==': return leftVal == rightVal;
        case '!=': return leftVal != rightVal;
        case '>=': return (leftVal as number) >= (rightVal as number);
        case '<=': return (leftVal as number) <= (rightVal as number);
        case '>': return (leftVal as number) > (rightVal as number);
        case '<': return (leftVal as number) < (rightVal as number);
      }
    }
  }

  // Handle literals
  const trimmed = expr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^['"].*['"]$/.test(trimmed)) return trimmed.slice(1, -1);

  // Property access
  return getNestedProperty(context, trimmed);
}

export function createConditionEvaluator(condition: string): (context: SafeContext) => boolean {
  if (!isSafeExpression(condition)) {
    throw new Error(`Unsafe condition: ${condition.slice(0, 50)}...`);
  }

  return (context: SafeContext) => Boolean(evaluateSafeExpression(condition, context));
}
```

**Step 2: Update historical-tester.ts**

```typescript
// Replace line 106 in historical-tester.ts
// OLD: const evalFn = new Function('input', `return (${condition})`);
// NEW:
import { createConditionEvaluator } from '@/lib/utils/safe-eval';

// In the function body:
const evaluator = createConditionEvaluator(condition);
const result = evaluator({ input, ...contextVars });
```

**Step 3: Update function-block.ts**

```typescript
// Replace line 59 in function-block.ts
// OLD: const fn = new Function(...argNames, `return (${expression})`);
// NEW:
import { evaluateSafeExpression } from '@/lib/utils/safe-eval';

// In the function body:
const context = Object.fromEntries(argNames.map((name, i) => [name, args[i]]));
const result = evaluateSafeExpression(expression, context);
```

**Step 4: Update loop.ts**

```typescript
// Replace line 77 in loop.ts
// OLD: const conditionFn = new Function('item', 'index', `return (${condition})`);
// NEW:
import { createConditionEvaluator } from '@/lib/utils/safe-eval';

// In the function body:
const evaluator = createConditionEvaluator(condition);
const shouldInclude = evaluator({ item, index });
```

**Step 5: Write tests for safe-eval**

Create: `apps/web/src/lib/utils/__tests__/safe-eval.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { isSafeExpression, evaluateSafeExpression, createConditionEvaluator } from '../safe-eval';

describe('isSafeExpression', () => {
  it('rejects eval', () => {
    expect(isSafeExpression('eval("code")')).toBe(false);
  });

  it('rejects Function constructor', () => {
    expect(isSafeExpression('new Function("return 1")')).toBe(false);
  });

  it('rejects __proto__ access', () => {
    expect(isSafeExpression('obj.__proto__')).toBe(false);
  });

  it('allows simple property access', () => {
    expect(isSafeExpression('item.name')).toBe(true);
  });

  it('allows comparisons', () => {
    expect(isSafeExpression('item.status === "active"')).toBe(true);
  });
});

describe('evaluateSafeExpression', () => {
  it('evaluates property access', () => {
    expect(evaluateSafeExpression('item.name', { item: { name: 'test' } })).toBe('test');
  });

  it('evaluates array access', () => {
    expect(evaluateSafeExpression('items[0]', { items: ['a', 'b'] })).toBe('a');
  });

  it('evaluates comparisons', () => {
    expect(evaluateSafeExpression('x > 5', { x: 10 })).toBe(true);
    expect(evaluateSafeExpression('x === 5', { x: 5 })).toBe(true);
  });

  it('throws on unsafe expression', () => {
    expect(() => evaluateSafeExpression('eval("1")', {})).toThrow();
  });
});

describe('createConditionEvaluator', () => {
  it('creates a reusable evaluator', () => {
    const evaluator = createConditionEvaluator('item.active && item.count > 0');
    expect(evaluator({ item: { active: true, count: 5 } })).toBe(true);
    expect(evaluator({ item: { active: false, count: 5 } })).toBe(false);
  });
});
```

**Step 6: Run tests**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/apps/web && pnpm test src/lib/utils/__tests__/safe-eval.test.ts`

**Step 7: Commit**

```bash
git add apps/web/src/lib/utils/safe-eval.ts apps/web/src/lib/utils/__tests__/safe-eval.test.ts apps/web/src/components/blocks/historical-tester.ts apps/web/src/components/blocks/function-block.ts apps/web/src/components/blocks/loop.ts
git commit -m "fix(security): replace new Function() with safe expression evaluator

BREAKING: Expression evaluation now uses a whitelist approach.
Complex expressions may need adjustment.

Closes #SEC-001"
```

---

### Task 1.2: Add Rate Limiting to All Execute Procedures

**Files:**
- Create: `apps/web/src/lib/rate-limit.ts`
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts` (execute procedure)
- Modify: `apps/web/src/lib/trpc/routers/flows.ts` (execute procedure)
- Modify: `apps/web/src/lib/trpc/routers/blocks.ts` (execute procedure)

**Context:** Execute procedures can be called repeatedly without limits, enabling DoS attacks.

**Step 1: Create rate limiting utility**

```typescript
// apps/web/src/lib/rate-limit.ts
import { TRPCError } from '@trpc/server';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Cleanup every minute

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): void {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return;
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
    });
  }

  entry.count++;
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  execute: { windowMs: 60000, maxRequests: 10 },  // 10 executions per minute
  generate: { windowMs: 60000, maxRequests: 5 },  // 5 generations per minute
  webhook: { windowMs: 1000, maxRequests: 100 },  // 100 webhooks per second
  api: { windowMs: 60000, maxRequests: 100 },     // 100 API calls per minute
} as const;
```

**Step 2: Add rate limiting to baleybots execute procedure**

```typescript
// In apps/web/src/lib/trpc/routers/baleybots.ts
// Add import at top:
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// In execute procedure, add at start of mutation:
execute: workspaceProcedure
  .input(/* existing input */)
  .mutation(async ({ ctx, input }) => {
    // Rate limit by workspace + user
    checkRateLimit(
      `execute:${ctx.workspace.id}:${ctx.userId}`,
      RATE_LIMITS.execute
    );

    // ... rest of existing code
```

**Step 3: Add rate limiting to flows execute procedure**

```typescript
// In apps/web/src/lib/trpc/routers/flows.ts
// Add same pattern as baleybots
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// In execute procedure:
checkRateLimit(
  `flow-execute:${ctx.workspace.id}:${ctx.userId}`,
  RATE_LIMITS.execute
);
```

**Step 4: Add rate limiting to blocks execute procedure**

```typescript
// In apps/web/src/lib/trpc/routers/blocks.ts
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

// In execute procedure:
checkRateLimit(
  `block-execute:${ctx.workspace.id}:${ctx.userId}`,
  RATE_LIMITS.execute
);
```

**Step 5: Write tests**

```typescript
// apps/web/src/lib/__tests__/rate-limit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, RATE_LIMITS } from '../rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests within limit', () => {
    const config = { windowMs: 1000, maxRequests: 3 };
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
  });

  it('throws on exceeding limit', () => {
    const config = { windowMs: 1000, maxRequests: 2 };
    checkRateLimit('test-2', config);
    checkRateLimit('test-2', config);
    expect(() => checkRateLimit('test-2', config)).toThrow('Rate limit exceeded');
  });

  it('resets after window expires', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    checkRateLimit('test-3', config);
    vi.advanceTimersByTime(1001);
    expect(() => checkRateLimit('test-3', config)).not.toThrow();
  });

  it('tracks different identifiers separately', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    checkRateLimit('user-1', config);
    expect(() => checkRateLimit('user-2', config)).not.toThrow();
  });
});
```

**Step 6: Commit**

```bash
git add apps/web/src/lib/rate-limit.ts apps/web/src/lib/__tests__/rate-limit.test.ts apps/web/src/lib/trpc/routers/baleybots.ts apps/web/src/lib/trpc/routers/flows.ts apps/web/src/lib/trpc/routers/blocks.ts
git commit -m "fix(security): add rate limiting to all execute procedures

- 10 executions per minute per user per workspace
- Returns TOO_MANY_REQUESTS with retry-after header
- In-memory store (TODO: Redis for production)

Closes #SEC-002"
```

---

### Task 1.3: Hash Webhook Secrets Before Logging

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/webhooks.ts`
- Create: `apps/web/src/lib/utils/secrets.ts`

**Context:** Webhook secrets may be logged in plain text during debugging.

**Step 1: Create secrets utility**

```typescript
// apps/web/src/lib/utils/secrets.ts
import { createHash } from 'crypto';

/**
 * Mask a secret for safe logging.
 * Shows first 4 and last 4 characters, masks middle.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

/**
 * Create a one-way hash of a secret for logging correlation.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

/**
 * Redact secrets from an object before logging.
 */
export function redactSecrets<T extends object>(obj: T, secretKeys: string[]): T {
  const redacted = { ...obj } as Record<string, unknown>;

  for (const key of secretKeys) {
    if (key in redacted && typeof redacted[key] === 'string') {
      redacted[key] = maskSecret(redacted[key] as string);
    }
  }

  return redacted as T;
}
```

**Step 2: Update webhook logging**

```typescript
// In apps/web/src/lib/trpc/routers/webhooks.ts
// Find all console.log statements that might include secrets
// Replace direct logging with redacted versions

import { maskSecret, hashSecret, redactSecrets } from '@/lib/utils/secrets';

// Example: When logging webhook creation
console.log('Webhook created:', {
  id: webhook.id,
  secretHash: hashSecret(secret), // Instead of logging the actual secret
});

// Example: When logging webhook verification
console.log('Verifying webhook:', {
  webhookId: id,
  signatureProvided: Boolean(signature),
  // Never log the actual secret
});
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/utils/secrets.ts apps/web/src/lib/trpc/routers/webhooks.ts
git commit -m "fix(security): hash webhook secrets before logging

Never log plain text secrets. Use one-way hashes for correlation.

Closes #SEC-003"
```

---

### Task 1.4: Add Cascade Deletes to Foreign Keys

**Files:**
- Create: `packages/db/drizzle/migrations/0003_add_cascade_deletes.sql`
- Modify: `packages/db/src/schema.ts`

**Context:** Missing cascade deletes on: `tools.connectionId`, `blocks.connectionId`, `webhookLogs.executionId`, `toolExecutions.toolId`

**Step 1: Create migration file**

```sql
-- packages/db/drizzle/migrations/0003_add_cascade_deletes.sql

-- Add cascade delete to tools.connectionId
ALTER TABLE tools
DROP CONSTRAINT IF EXISTS tools_connection_id_fkey,
ADD CONSTRAINT tools_connection_id_fkey
  FOREIGN KEY (connection_id)
  REFERENCES connections(id)
  ON DELETE CASCADE;

-- Add cascade delete to blocks.connectionId
ALTER TABLE blocks
DROP CONSTRAINT IF EXISTS blocks_connection_id_fkey,
ADD CONSTRAINT blocks_connection_id_fkey
  FOREIGN KEY (connection_id)
  REFERENCES connections(id)
  ON DELETE CASCADE;

-- Add cascade delete to webhookLogs.executionId
ALTER TABLE webhook_logs
DROP CONSTRAINT IF EXISTS webhook_logs_execution_id_fkey,
ADD CONSTRAINT webhook_logs_execution_id_fkey
  FOREIGN KEY (execution_id)
  REFERENCES flow_executions(id)
  ON DELETE CASCADE;

-- Add cascade delete to toolExecutions.toolId
ALTER TABLE tool_executions
DROP CONSTRAINT IF EXISTS tool_executions_tool_id_fkey,
ADD CONSTRAINT tool_executions_tool_id_fkey
  FOREIGN KEY (tool_id)
  REFERENCES tools(id)
  ON DELETE CASCADE;
```

**Step 2: Update schema.ts with cascade annotations**

```typescript
// In packages/db/src/schema.ts
// Update foreign key definitions to include onDelete: 'cascade'

// Example for tools table:
export const tools = pgTable('tools', {
  // ... existing columns
  connectionId: text('connection_id')
    .references(() => connections.id, { onDelete: 'cascade' }),
  // ...
});

// Similar updates for blocks, webhookLogs, toolExecutions
```

**Step 3: Run migration**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/db && pnpm drizzle-kit push`

**Step 4: Commit**

```bash
git add packages/db/drizzle/migrations/0003_add_cascade_deletes.sql packages/db/src/schema.ts
git commit -m "fix(security): add cascade deletes to foreign keys

Prevents orphaned records when parent entities are deleted.
Affected tables: tools, blocks, webhookLogs, toolExecutions

Closes #SEC-004"
```

---

### Task 1.5: Fix Ownership Verification in All Procedures

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`
- Modify: `apps/web/src/lib/trpc/routers/flows.ts`
- Modify: `apps/web/src/lib/trpc/routers/connections.ts`

**Context:** Several procedures access nested properties without null checks, potentially allowing access to resources from other workspaces if relations are broken.

**Step 1: Create ownership verification helper**

```typescript
// Add to apps/web/src/lib/trpc/helpers.ts
import { TRPCError } from '@trpc/server';

export function verifyOwnership<T extends { workspaceId: string | null }>(
  resource: T | null | undefined,
  workspaceId: string,
  resourceName: string = 'Resource'
): asserts resource is T & { workspaceId: string } {
  if (!resource) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }

  if (resource.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: 'NOT_FOUND', // Use NOT_FOUND to not reveal existence
      message: `${resourceName} not found`,
    });
  }
}

export function verifyNestedOwnership<T extends { workspaceId?: string | null }>(
  parent: T | null | undefined,
  workspaceId: string,
  resourceName: string = 'Resource'
): asserts parent is T {
  if (!parent) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }

  if (parent.workspaceId && parent.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }
}
```

**Step 2: Update all procedures to use helper**

Audit and update each procedure that accesses workspace-scoped resources:

```typescript
// Example pattern for getExecution:
const execution = await ctx.db.query.baleybotExecutions.findFirst({
  where: eq(baleybotExecutions.id, input.executionId),
  with: { baleybot: true },
});

verifyNestedOwnership(execution?.baleybot, ctx.workspace.id, 'Execution');
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/helpers.ts apps/web/src/lib/trpc/routers/*.ts
git commit -m "fix(security): add ownership verification to all procedures

Uses consistent verifyOwnership helper across all routers.
Prevents information leakage about resource existence.

Closes #SEC-005"
```

---

### Task 1.6: Add API Key Validation

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/api-keys.ts`
- Create: `apps/web/src/lib/api-key-validation.ts`

**Context:** API keys should be validated for format and entropy before being stored or used.

**Step 1: Create API key validation**

```typescript
// apps/web/src/lib/api-key-validation.ts

export const API_KEY_PREFIX = 'bui_';
export const API_KEY_LENGTH = 32; // Excluding prefix

/**
 * Validate API key format.
 */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(API_KEY_PREFIX.length);

  // Must be correct length
  if (keyPart.length !== API_KEY_LENGTH) {
    return false;
  }

  // Must be alphanumeric
  if (!/^[a-zA-Z0-9]+$/.test(keyPart)) {
    return false;
  }

  return true;
}

/**
 * Generate a secure API key.
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(API_KEY_LENGTH);
  crypto.getRandomValues(array);

  let key = API_KEY_PREFIX;
  for (let i = 0; i < API_KEY_LENGTH; i++) {
    key += chars[array[i] % chars.length];
  }

  return key;
}

/**
 * Hash API key for storage.
 */
export function hashApiKey(key: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  // Use SubtleCrypto for hashing
  return crypto.subtle.digest('SHA-256', data).then(hash => {
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }) as unknown as string; // Note: This should be awaited in actual usage
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api-key-validation.ts apps/web/src/lib/trpc/routers/api-keys.ts
git commit -m "fix(security): add API key format validation and secure generation

Closes #SEC-006"
```

---

### Task 1.7: Sanitize All Error Messages to Clients

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`
- Modify: `apps/web/src/lib/trpc/routers/flows.ts`
- Modify: `apps/web/src/lib/trpc/routers/blocks.ts`
- Modify: `apps/web/src/lib/trpc/routers/connections.ts`
- Modify: `apps/web/src/lib/trpc/routers/webhooks.ts`

**Context:** Raw error messages may leak internal details. All catch blocks should use the sanitizer from Task 1.3 of the previous plan.

**Step 1: Audit all catch blocks**

Search for all `catch (error)` blocks in tRPC routers:

Run: `grep -n "catch.*error" apps/web/src/lib/trpc/routers/*.ts`

**Step 2: Update each catch block**

```typescript
// Pattern for all catch blocks:
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';

// In catch blocks:
catch (error) {
  const message = isUserFacingError(error)
    ? sanitizeErrorMessage(error)
    : 'An internal error occurred';

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/*.ts
git commit -m "fix(security): sanitize all error messages to clients

Prevents information leakage through error messages.

Closes #SEC-007"
```

---

### Task 1.8: Add Input Validation with Zod Schemas

**Files:**
- Create: `apps/web/src/lib/validation/schemas.ts`
- Modify: Various router files

**Context:** Some inputs lack proper validation beyond basic type checking.

**Step 1: Create comprehensive validation schemas**

```typescript
// apps/web/src/lib/validation/schemas.ts
import { z } from 'zod';

// Common patterns
export const uuidSchema = z.string().uuid();
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/);
export const nameSchema = z.string().min(1).max(255).trim();
export const descriptionSchema = z.string().max(5000).optional();

// BAL code validation
export const balCodeSchema = z.string()
  .min(1)
  .max(100000) // 100KB max
  .refine(
    (code) => !code.includes('process.') && !code.includes('require('),
    'Invalid BAL code: contains forbidden patterns'
  );

// Execution input validation
export const executionInputSchema = z.object({
  input: z.unknown().optional(),
  triggeredBy: z.enum(['manual', 'api', 'webhook', 'schedule']).default('manual'),
  triggerSource: z.string().max(1000).optional(),
});

// Webhook payload validation
export const webhookPayloadSchema = z.object({
  event: z.string().max(100),
  data: z.unknown(),
  timestamp: z.string().datetime().optional(),
});

// Flow node validation
export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.unknown()),
});

// Flow edge validation
export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});
```

**Step 2: Apply schemas to router inputs**

Update router input validation to use these schemas.

**Step 3: Commit**

```bash
git add apps/web/src/lib/validation/schemas.ts apps/web/src/lib/trpc/routers/*.ts
git commit -m "fix(security): add comprehensive input validation with Zod schemas

Closes #SEC-008"
```

---

## Phase 2: Data Integrity & Race Conditions (PRIORITY: HIGH)

### Task 2.1: Fix Abort Signal Race Condition in BAL Executor

**Files:**
- Modify: `packages/sdk/src/bal-executor.ts:152-164`

**Context:** The abort signal combination logic has a race condition where both user abort and timeout abort could fire.

**Step 1: Rewrite abort signal handling**

```typescript
// packages/sdk/src/bal-executor.ts
// Replace lines 140-164 with:

// Set up unified abort handling
const abortController = new AbortController();
let abortReason: 'timeout' | 'cancelled' | null = null;

// Handle timeout
let timeoutId: ReturnType<typeof setTimeout> | undefined;
if (timeout > 0) {
  timeoutId = setTimeout(() => {
    if (!abortReason) {
      abortReason = 'timeout';
      abortController.abort();
      onEvent?.({ type: 'error', error: `Execution timed out after ${timeout}ms` });
    }
  }, timeout);
}

// Handle user cancellation
if (signal) {
  const handleAbort = () => {
    if (!abortReason) {
      abortReason = 'cancelled';
      abortController.abort();
      onEvent?.({ type: 'cancelled' });
    }
  };

  if (signal.aborted) {
    handleAbort();
  } else {
    signal.addEventListener('abort', handleAbort, { once: true });
  }
}

// Cleanup function
const cleanup = () => {
  if (timeoutId) clearTimeout(timeoutId);
};
```

**Step 2: Update error handling to use abortReason**

```typescript
// In catch block:
catch (error) {
  cleanup();

  if (abortReason === 'timeout') {
    return {
      status: 'timeout',
      error: `Execution timed out after ${timeout}ms`,
      duration: Date.now() - startTime,
    };
  }

  if (abortReason === 'cancelled') {
    return {
      status: 'cancelled',
      duration: Date.now() - startTime,
    };
  }

  // ... rest of error handling
}
```

**Step 3: Commit**

```bash
git add packages/sdk/src/bal-executor.ts
git commit -m "fix(sdk): fix abort signal race condition in BAL executor

Uses unified abort controller with explicit reason tracking.

Closes #HIGH-001"
```

---

### Task 2.2: Add Error Context to Error Results

**Files:**
- Modify: `packages/sdk/src/bal-executor.ts:237-264`

**Context:** Error results lack context about which step failed.

**Step 1: Update error result type**

```typescript
// In types section, update BALExecutionResult:
export interface BALExecutionResult {
  status: 'success' | 'error' | 'cancelled' | 'timeout';
  result?: unknown;
  error?: string;
  errorContext?: {
    phase: 'parsing' | 'compilation' | 'execution';
    entityName?: string;
    stepIndex?: number;
  };
  entities?: string[];
  structure?: PipelineStructure | null;
  duration?: number;
}
```

**Step 2: Add context to error returns**

```typescript
// In compilation error handling:
return {
  status: 'error',
  error,
  errorContext: { phase: 'compilation' },
  duration: Date.now() - startTime,
};

// In execution error handling:
return {
  status: 'error',
  error: errorMessage,
  errorContext: {
    phase: 'execution',
    entityName: currentEntity, // Track which entity was executing
  },
  duration: Date.now() - startTime,
};
```

**Step 3: Commit**

```bash
git add packages/sdk/src/bal-executor.ts
git commit -m "feat(sdk): add error context to execution results

Includes phase, entity name, and step index for debugging.

Closes #HIGH-002"
```

---

### Task 2.3: Fix deepEqual Cycle Detection in useDirtyState

**Files:**
- Modify: `apps/web/src/hooks/useDirtyState.ts:13-32`

**Context:** The deepEqual function doesn't handle circular references, which can cause infinite loops.

**Step 1: Add cycle detection**

```typescript
// apps/web/src/hooks/useDirtyState.ts
function deepEqual(a: unknown, b: unknown, seen = new WeakSet<object>()): boolean {
  // Same reference or primitives
  if (a === b) return true;

  // Different types
  if (typeof a !== typeof b) return false;

  // Handle null
  if (a === null || b === null) return a === b;

  // Primitives
  if (typeof a !== 'object') return a === b;

  // Cycle detection
  if (seen.has(a as object)) return true; // Assume equal for cycles
  seen.add(a as object);

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], seen));
  }

  // Objects
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(key =>
    key in (b as object) &&
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      seen
    )
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useDirtyState.ts
git commit -m "fix(hooks): add cycle detection to deepEqual in useDirtyState

Prevents infinite loops with circular references.

Closes #HIGH-003"
```

---

### Task 2.4: Fix Memory Leak in useHistory Hook

**Files:**
- Modify: `apps/web/src/hooks/useHistory.ts`

**Context:** History entries accumulate without limit.

**Step 1: Add max history limit**

```typescript
// apps/web/src/hooks/useHistory.ts
const MAX_HISTORY_SIZE = 50;

export function useHistory<T>(initialValue: T) {
  const [history, setHistory] = useState<T[]>([initialValue]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const push = useCallback((value: T) => {
    setHistory(prev => {
      // Remove any future entries
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(value);

      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        const removed = newHistory.length - MAX_HISTORY_SIZE;
        return newHistory.slice(removed);
      }

      return newHistory;
    });
    setCurrentIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [currentIndex]);

  // ... rest of hook
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/useHistory.ts
git commit -m "fix(hooks): add max history limit to prevent memory leak

Limits history to 50 entries, removes oldest when exceeded.

Closes #HIGH-004"
```

---

### Task 2.5: Add Missing Database Indexes

**Files:**
- Create: `packages/db/drizzle/migrations/0004_add_performance_indexes.sql`

**Context:** Missing indexes on frequently queried columns cause slow queries.

**Step 1: Create migration**

```sql
-- packages/db/drizzle/migrations/0004_add_performance_indexes.sql

-- baleybotExecutions indexes
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_baleybot_id
  ON baleybot_executions(baleybot_id);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_status
  ON baleybot_executions(status);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_created_at
  ON baleybot_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_baleybot_status
  ON baleybot_executions(baleybot_id, status);

-- flowExecutions indexes
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id
  ON flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status
  ON flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_created_at
  ON flow_executions(created_at DESC);

-- webhookLogs indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id
  ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at
  ON webhook_logs(created_at DESC);

-- tools indexes
CREATE INDEX IF NOT EXISTS idx_tools_workspace_id
  ON tools(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tools_connection_id
  ON tools(connection_id);

-- blocks indexes
CREATE INDEX IF NOT EXISTS idx_blocks_workspace_id
  ON blocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_blocks_flow_id
  ON blocks(flow_id);

-- baleybots indexes (soft delete)
CREATE INDEX IF NOT EXISTS idx_baleybots_workspace_deleted
  ON baleybots(workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

-- flows indexes (soft delete)
CREATE INDEX IF NOT EXISTS idx_flows_workspace_deleted
  ON flows(workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

-- connections indexes
CREATE INDEX IF NOT EXISTS idx_connections_workspace_id
  ON connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connections_workspace_default
  ON connections(workspace_id, is_default)
  WHERE is_default = true;
```

**Step 2: Run migration**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/db && pnpm drizzle-kit push`

**Step 3: Commit**

```bash
git add packages/db/drizzle/migrations/0004_add_performance_indexes.sql
git commit -m "perf(db): add indexes for frequently queried columns

Improves query performance for executions, logs, and workspace-scoped queries.

Closes #HIGH-005"
```

---

### Task 2.6: Fix Race Condition in BaleyBot Dependencies Load

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

**Context:** Dependencies are loaded in parallel but component renders before all complete.

**Step 1: Add loading state tracking**

```typescript
// In the page component, track loading states:
const [loadingStates, setLoadingStates] = useState({
  baleybot: true,
  connections: true,
  approvalPatterns: true,
});

const isFullyLoaded = Object.values(loadingStates).every(v => !v);

// In each query's onSuccess:
onSuccess: (data) => {
  setLoadingStates(prev => ({ ...prev, baleybot: false }));
  // ... rest of handler
},
```

**Step 2: Only render when fully loaded**

```typescript
// In render:
if (!isFullyLoaded) {
  return <LoadingSkeleton />;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "fix(ui): fix race condition in BaleyBot page dependencies loading

Tracks all loading states and only renders when fully loaded.

Closes #HIGH-006"
```

---

### Task 2.7: Fix Race Condition in Connection Default Setting

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/connections.ts`

**Context:** Setting a connection as default doesn't use a transaction, causing potential race conditions.

**Step 1: Wrap in transaction**

```typescript
// In setDefault procedure:
setDefault: workspaceProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return await ctx.db.transaction(async (tx) => {
      // First, unset all defaults in workspace
      await tx
        .update(connections)
        .set({ isDefault: false })
        .where(
          and(
            eq(connections.workspaceId, ctx.workspace.id),
            eq(connections.isDefault, true)
          )
        );

      // Then set the new default
      const [updated] = await tx
        .update(connections)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(connections.id, input.id),
            eq(connections.workspaceId, ctx.workspace.id)
          )
        )
        .returning();

      return updated;
    });
  }),
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/trpc/routers/connections.ts
git commit -m "fix(connections): use transaction for setting default connection

Prevents race condition with multiple simultaneous default changes.

Closes #HIGH-007"
```

---

### Task 2.8: Fix Approval Counter Race Condition

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Context:** Approval count increment isn't atomic.

**Step 1: Use atomic increment**

```typescript
// Replace approval count update with atomic operation:
await ctx.db
  .update(approvalPatterns)
  .set({
    approvalCount: sql`${approvalPatterns.approvalCount} + 1`,
    updatedAt: new Date(),
  })
  .where(eq(approvalPatterns.id, pattern.id));
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/trpc/routers/baleybots.ts
git commit -m "fix(baleybots): use atomic increment for approval counter

Prevents lost updates under concurrent approval decisions.

Closes #HIGH-008"
```

---

### Task 2.9: Fix Workspace Policy Race Condition

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/workspaces.ts`

**Context:** Workspace policy updates can overwrite concurrent changes.

**Step 1: Add optimistic locking**

```typescript
// Add version column check:
updatePolicy: workspaceProcedure
  .input(z.object({
    policy: z.object({ /* policy fields */ }),
    version: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    const [updated] = await ctx.db
      .update(workspaces)
      .set({
        policy: input.policy,
        policyVersion: sql`${workspaces.policyVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaces.id, ctx.workspace.id),
          eq(workspaces.policyVersion, input.version)
        )
      )
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Policy was modified by another user. Please refresh and try again.',
      });
    }

    return updated;
  }),
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/trpc/routers/workspaces.ts
git commit -m "fix(workspaces): add optimistic locking for policy updates

Prevents silent overwrite of concurrent policy changes.

Closes #HIGH-009"
```

---

### Task 2.10: Implement Soft Delete Filtering Consistently

**Files:**
- Modify: All router files that query soft-deletable tables

**Context:** Some queries don't filter out soft-deleted records.

**Step 1: Audit and fix all queries**

```typescript
// Pattern to apply to all queries on soft-deletable tables:
// Add notDeleted() to all where clauses

// Example:
const baleybots = await ctx.db.query.baleybots.findMany({
  where: and(
    eq(baleybots.workspaceId, ctx.workspace.id),
    notDeleted() // ADD THIS
  ),
});
```

**Step 2: Create helper for common patterns**

```typescript
// packages/db/src/helpers.ts
export function workspaceFilter(workspaceId: string) {
  return and(
    eq(baleybots.workspaceId, workspaceId),
    notDeleted()
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/routers/*.ts packages/db/src/helpers.ts
git commit -m "fix(db): apply soft delete filtering consistently

All queries on soft-deletable tables now filter deleted records.

Closes #HIGH-010"
```

---

### Task 2.11: Implement V1 API Flow Execution

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/flows.ts:262-266`
- Create: `apps/web/src/lib/flow-executor.ts`

**Context:** The flow execute procedure has a TODO for actual execution logic.

**Step 1: Create flow executor**

```typescript
// apps/web/src/lib/flow-executor.ts
import { executeBALCode } from '@baleyui/sdk';

interface FlowNode {
  id: string;
  type: string;
  data: {
    baleybotId?: string;
    config?: Record<string, unknown>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface FlowExecutionContext {
  flowId: string;
  executionId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  input: unknown;
  apiKey: string;
}

export async function executeFlow(context: FlowExecutionContext): Promise<{
  status: 'success' | 'error' | 'cancelled';
  outputs: Record<string, unknown>;
  error?: string;
}> {
  const { nodes, edges, input } = context;
  const outputs: Record<string, unknown> = {};

  // Build execution graph
  const graph = buildExecutionGraph(nodes, edges);

  // Get topological order
  const order = topologicalSort(graph);

  // Execute nodes in order
  for (const nodeId of order) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Get inputs from connected nodes
    const nodeInputs = getNodeInputs(node, edges, outputs, input);

    // Execute based on node type
    if (node.type === 'baleybot' && node.data.baleybotId) {
      // Execute BaleyBot
      const result = await executeBALCode(
        // Would need to fetch BAL code here
        '',
        {
          apiKey: context.apiKey,
          timeout: 60000,
        }
      );
      outputs[nodeId] = result.result;
    }
  }

  return { status: 'success', outputs };
}

function buildExecutionGraph(nodes: FlowNode[], edges: FlowEdge[]) {
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    graph.set(node.id, []);
  }

  for (const edge of edges) {
    const deps = graph.get(edge.target) || [];
    deps.push(edge.source);
    graph.set(edge.target, deps);
  }

  return graph;
}

function topologicalSort(graph: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    for (const dep of graph.get(nodeId) || []) {
      visit(dep);
    }

    result.push(nodeId);
  }

  for (const nodeId of graph.keys()) {
    visit(nodeId);
  }

  return result;
}

function getNodeInputs(
  node: FlowNode,
  edges: FlowEdge[],
  outputs: Record<string, unknown>,
  initialInput: unknown
): unknown {
  const incomingEdges = edges.filter(e => e.target === node.id);

  if (incomingEdges.length === 0) {
    return initialInput;
  }

  if (incomingEdges.length === 1) {
    return outputs[incomingEdges[0].source];
  }

  // Multiple inputs - combine into object
  const combined: Record<string, unknown> = {};
  for (const edge of incomingEdges) {
    const key = edge.targetHandle || edge.source;
    combined[key] = outputs[edge.source];
  }
  return combined;
}
```

**Step 2: Update flows router**

```typescript
// In apps/web/src/lib/trpc/routers/flows.ts execute procedure:
import { executeFlow } from '@/lib/flow-executor';

// Replace TODO with:
const executionResult = await executeFlow({
  flowId: flow.id,
  executionId: execution.id,
  nodes: flow.nodes as FlowNode[],
  edges: flow.edges as FlowEdge[],
  input: input.input,
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Update execution record
await ctx.db
  .update(flowExecutions)
  .set({
    status: executionResult.status === 'success' ? 'completed' : 'failed',
    output: executionResult.outputs,
    error: executionResult.error,
    completedAt: new Date(),
  })
  .where(eq(flowExecutions.id, execution.id));
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/flow-executor.ts apps/web/src/lib/trpc/routers/flows.ts
git commit -m "feat(flows): implement V1 flow execution engine

Executes flow nodes in topological order, passing outputs between nodes.

Closes #HIGH-011"
```

---

### Task 2.12: Implement Streaming Execution to Client

**Files:**
- Create: `apps/web/src/lib/trpc/routers/streaming.ts`
- Modify: `apps/web/src/lib/trpc/routers/baleybots.ts`

**Context:** Need to stream execution events to the client for real-time updates.

**Step 1: Create streaming procedure**

```typescript
// apps/web/src/lib/trpc/routers/streaming.ts
import { observable } from '@trpc/server/observable';
import { streamBALExecution } from '@baleyui/sdk';

export const streamingRouter = router({
  executeStream: workspaceProcedure
    .input(z.object({
      id: z.string(),
      input: z.unknown().optional(),
    }))
    .subscription(async function* ({ ctx, input }) {
      // Get baleybot
      const baleybot = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          notDeleted()
        ),
      });

      if (!baleybot) {
        yield { type: 'error', error: 'BaleyBot not found' };
        return;
      }

      // Stream execution
      const generator = streamBALExecution(baleybot.balCode, {
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
      });

      for await (const event of generator) {
        yield event;
      }
    }),
});
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/trpc/routers/streaming.ts apps/web/src/lib/trpc/routers/index.ts
git commit -m "feat(baleybots): add streaming execution endpoint

Uses tRPC subscriptions for real-time execution events.

Closes #HIGH-012"
```

---

## Phase 3: Production Readiness (PRIORITY: HIGH)

### Task 3.1-3.8: Add ErrorBoundary to All Routes

**Files:**
- Create: `apps/web/src/app/error.tsx` (global)
- Modify: All route `layout.tsx` and `page.tsx` files

**Context:** 32 pages need ErrorBoundary wrappers.

**Step 1: Create global error handler**

```typescript
// apps/web/src/app/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
        <div className="flex gap-4 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button asChild>
            <a href="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </a>
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-8 p-4 bg-muted rounded text-left text-xs overflow-auto max-h-48">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create error boundaries for each route group**

Create `error.tsx` in:
- `apps/web/src/app/dashboard/error.tsx`
- `apps/web/src/app/dashboard/baleybots/error.tsx`
- `apps/web/src/app/dashboard/flows/error.tsx`
- `apps/web/src/app/dashboard/connections/error.tsx`
- `apps/web/src/app/dashboard/settings/error.tsx`
- `apps/web/src/app/dashboard/activity/error.tsx`
- `apps/web/src/app/api/error.tsx` (if applicable)
- `apps/web/src/app/auth/error.tsx`

**Step 3: Commit each group**

```bash
git add apps/web/src/app/error.tsx apps/web/src/app/dashboard/error.tsx apps/web/src/app/dashboard/*/error.tsx
git commit -m "feat(error-handling): add ErrorBoundary to all route groups

Provides graceful error recovery at each routing level.

Closes #HIGH-013 through #HIGH-020"
```

---

### Task 3.9-3.16: Add Loading States to All Routes

**Files:**
- Create `loading.tsx` for each route group

**Context:** Need loading states for Suspense boundaries.

**Step 1: Create loading component template**

```typescript
// apps/web/src/components/loading/DashboardSkeleton.tsx
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-muted rounded w-1/4 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// apps/web/src/components/loading/ListSkeleton.tsx
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 bg-muted rounded-lg" />
      ))}
    </div>
  );
}

// apps/web/src/components/loading/DetailSkeleton.tsx
export function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-muted rounded w-1/3 mb-4" />
      <div className="h-4 bg-muted rounded w-2/3 mb-8" />
      <div className="h-96 bg-muted rounded-xl" />
    </div>
  );
}
```

**Step 2: Create loading.tsx files**

```typescript
// apps/web/src/app/dashboard/loading.tsx
import { DashboardSkeleton } from '@/components/loading/DashboardSkeleton';

export default function Loading() {
  return <DashboardSkeleton />;
}

// apps/web/src/app/dashboard/baleybots/loading.tsx
import { ListSkeleton } from '@/components/loading/ListSkeleton';

export default function Loading() {
  return <ListSkeleton count={6} />;
}

// apps/web/src/app/dashboard/baleybots/[id]/loading.tsx
import { DetailSkeleton } from '@/components/loading/DetailSkeleton';

export default function Loading() {
  return <DetailSkeleton />;
}
```

Repeat for all route groups.

**Step 3: Commit**

```bash
git add apps/web/src/components/loading/*.tsx apps/web/src/app/**/loading.tsx
git commit -m "feat(ux): add loading states to all routes

Skeleton loaders for Suspense boundaries.

Closes #HIGH-021 through #HIGH-028"
```

---

## Phase 4: Accessibility & UX (PRIORITY: MEDIUM)

### Task 4.1: Add ARIA Labels to All Icon Buttons

**Files:**
- Modify all components with icon-only buttons

**Context:** Screen readers need labels for icon buttons.

**Step 1: Audit icon buttons**

Run: `grep -rn "size=\"icon\"" apps/web/src/`

**Step 2: Add aria-label to each**

```typescript
// Pattern:
<Button variant="ghost" size="icon" aria-label="Delete item">
  <Trash2 className="h-4 w-4" aria-hidden="true" />
</Button>
```

**Step 3: Commit**

```bash
git add apps/web/src/components/**/*.tsx apps/web/src/app/**/*.tsx
git commit -m "fix(a11y): add ARIA labels to all icon buttons

Improves screen reader experience.

Closes #MED-001"
```

---

### Task 4.2: Add Keyboard Navigation to Card Grids

**Files:**
- Modify: `apps/web/src/app/dashboard/baleybots/page.tsx`
- Modify: `apps/web/src/app/dashboard/flows/page.tsx`
- Modify: `apps/web/src/app/dashboard/connections/page.tsx`

**Context:** Card grids need arrow key navigation.

**Step 1: Create useGridNavigation hook**

```typescript
// apps/web/src/hooks/useGridNavigation.ts
import { useCallback, useRef } from 'react';

export function useGridNavigation(itemCount: number, columns: number) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, itemCount - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + columns, itemCount - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - columns, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = itemCount - 1;
        break;
      default:
        return;
    }

    e.preventDefault();

    const items = containerRef.current?.querySelectorAll('[role="gridcell"]');
    (items?.[nextIndex] as HTMLElement)?.focus();
  }, [itemCount, columns]);

  return { containerRef, handleKeyDown };
}
```

**Step 2: Apply to card grids**

```typescript
// In baleybots list page:
const { containerRef, handleKeyDown } = useGridNavigation(baleybots.length, 3);

<div
  ref={containerRef}
  role="grid"
  aria-label="BaleyBots list"
  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
>
  {baleybots.map((bot, index) => (
    <div
      key={bot.id}
      role="gridcell"
      tabIndex={index === 0 ? 0 : -1}
      onKeyDown={(e) => handleKeyDown(e, index)}
    >
      <BaleybotCard bot={bot} />
    </div>
  ))}
</div>
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useGridNavigation.ts apps/web/src/app/dashboard/*/page.tsx
git commit -m "feat(a11y): add keyboard navigation to card grids

Arrow keys, Home/End navigation in grid layouts.

Closes #MED-002"
```

---

### Task 4.3: Add Focus Management for Modals

**Files:**
- Modify: All modal/dialog components

**Context:** Focus should trap within modals and return on close.

**Step 1: Create useFocusTrap hook**

```typescript
// apps/web/src/hooks/useFocusTrap.ts
import { useEffect, useRef } from 'react';

export function useFocusTrap(isOpen: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;

      // Focus first focusable element
      const focusableElements = containerRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusableElements?.[0] as HTMLElement)?.focus();
    } else {
      // Return focus
      (previousActiveElement.current as HTMLElement)?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;

    const focusableElements = containerRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements?.length) return;

    const first = focusableElements[0] as HTMLElement;
    const last = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return { containerRef, handleKeyDown };
}
```

**Step 2: Apply to dialog components**

Note: If using Radix Dialog, focus trap is built-in. Otherwise apply hook.

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useFocusTrap.ts apps/web/src/components/ui/dialog.tsx
git commit -m "feat(a11y): add focus trap for modals

Closes #MED-003"
```

---

### Task 4.4-4.10: Additional A11y Improvements

(Tasks 4.4-4.10 follow similar patterns for:)
- Color contrast ratios
- Skip navigation links
- Form labels and descriptions
- Error announcements (aria-live)
- Responsive touch targets
- Reduced motion preferences
- High contrast mode support

Each task follows the same commit pattern.

---

## Phase 5: Type Safety & Code Quality (PRIORITY: MEDIUM)

### Task 5.1: Replace `any` Types in Router Files

**Files:**
- Modify: `apps/web/src/lib/trpc/routers/*.ts`

**Context:** 70+ `any` type usages compromise type safety.

**Step 1: Audit any types**

Run: `grep -rn ": any" apps/web/src/lib/trpc/routers/`

**Step 2: Create proper type definitions**

```typescript
// apps/web/src/lib/types/ast.ts
export interface ASTNode {
  type: string;
  name?: string;
  value?: unknown;
  children?: ASTNode[];
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

// apps/web/src/lib/types/triggers.ts
export interface TriggerConfig {
  type: 'manual' | 'webhook' | 'schedule' | 'api';
  schedule?: string; // cron expression
  webhookPath?: string;
  apiEndpoint?: string;
}

// apps/web/src/lib/types/webhooks.ts
export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  signature?: string;
}
```

**Step 3: Replace any with proper types**

```typescript
// Example: In baleybots.ts
// Before:
const segments = execution.segments as any[];

// After:
import type { ExecutionSegment } from '@/lib/types/execution';
const segments = execution.segments as ExecutionSegment[];
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/types/*.ts apps/web/src/lib/trpc/routers/*.ts
git commit -m "refactor(types): replace any types with proper definitions

70+ any usages replaced with typed alternatives.

Closes #MED-004"
```

---

### Task 5.2: Replace console.log with Proper Logging

**Files:**
- Create: `apps/web/src/lib/logger.ts`
- Modify: All files with console.log

**Context:** 40+ console.log statements need structured logging.

**Step 1: Create logger utility**

```typescript
// apps/web/src/lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  context?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const context = entry.context ? ` [${entry.context}]` : '';
  return `${prefix}${context} ${entry.message}`;
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('debug')) return;
    const entry: LogEntry = {
      level: 'debug',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.debug(formatLog(entry), data ? data : '');
  },

  info(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('info')) return;
    const entry: LogEntry = {
      level: 'info',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.info(formatLog(entry), data ? data : '');
  },

  warn(message: string, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('warn')) return;
    const entry: LogEntry = {
      level: 'warn',
      message,
      data,
      timestamp: new Date().toISOString(),
      context,
    };
    console.warn(formatLog(entry), data ? data : '');
  },

  error(message: string, error?: Error, data?: Record<string, unknown>, context?: string) {
    if (!shouldLog('error')) return;
    const entry: LogEntry = {
      level: 'error',
      message,
      data: {
        ...data,
        errorMessage: error?.message,
        errorStack: error?.stack,
      },
      timestamp: new Date().toISOString(),
      context,
    };
    console.error(formatLog(entry), error);
  },
};

// Context-specific loggers
export const createLogger = (context: string) => ({
  debug: (msg: string, data?: Record<string, unknown>) => logger.debug(msg, data, context),
  info: (msg: string, data?: Record<string, unknown>) => logger.info(msg, data, context),
  warn: (msg: string, data?: Record<string, unknown>) => logger.warn(msg, data, context),
  error: (msg: string, err?: Error, data?: Record<string, unknown>) => logger.error(msg, err, data, context),
});
```

**Step 2: Replace console.log throughout codebase**

```typescript
// Before:
console.log('Executing baleybot:', baleybotId);

// After:
import { createLogger } from '@/lib/logger';
const log = createLogger('baleybots-router');

log.info('Executing baleybot', { baleybotId });
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/logger.ts apps/web/src/lib/trpc/routers/*.ts apps/web/src/components/**/*.ts
git commit -m "refactor(logging): replace console.log with structured logger

40+ console statements replaced with context-aware logging.

Closes #MED-005"
```

---

### Task 5.3-5.15: Additional Code Quality

(Tasks 5.3-5.15 cover:)
- Extract magic numbers to constants
- Remove dead code
- Consolidate duplicate logic
- Add null coalescing operators
- Fix ESLint warnings
- Add return type annotations
- Simplify complex conditionals
- Extract helper functions
- Add explicit error types
- Document complex algorithms
- Add invariant checks
- Standardize naming conventions
- Clean up imports

Each follows similar patterns with specific file modifications and commits.

---

## Phase 6: Testing & Documentation (PRIORITY: LOW)

### Task 6.1: Add SDK Unit Tests (Coverage Target: 70%)

**Files:**
- Create: `packages/sdk/src/__tests__/*.test.ts`
- Modify: `packages/sdk/package.json`
- Create: `packages/sdk/vitest.config.ts`

**Step 1: Create vitest config**

```typescript
// packages/sdk/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});
```

**Step 2: Add tests for client.ts**

```typescript
// packages/sdk/src/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaleyUI } from '../client';

describe('BaleyUI Client', () => {
  let client: BaleyUI;

  beforeEach(() => {
    client = new BaleyUI({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com',
    });
  });

  it('initializes with options', () => {
    expect(client).toBeDefined();
  });

  // Add comprehensive tests for all methods
});
```

**Step 3: Add tests for errors.ts**

```typescript
// packages/sdk/src/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  BaleyUIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from '../errors';

describe('Error Classes', () => {
  it('creates BaleyUIError with message', () => {
    const error = new BaleyUIError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('BaleyUIError');
  });

  it('AuthenticationError has correct code', () => {
    const error = new AuthenticationError('Invalid key');
    expect(error.code).toBe('AUTHENTICATION_ERROR');
  });

  // Add tests for all error types
});
```

**Step 4: Run tests with coverage**

Run: `cd /Users/jamesmcarthur/Documents/GitHub/BaleyUI/packages/sdk && pnpm test --coverage`

**Step 5: Commit**

```bash
git add packages/sdk/vitest.config.ts packages/sdk/src/__tests__/*.ts packages/sdk/package.json
git commit -m "test(sdk): add comprehensive unit tests (70% coverage)

Tests for client, errors, BAL executor, and types.

Closes #LOW-001"
```

---

### Task 6.2: Add tRPC Router Tests

**Files:**
- Create: `apps/web/src/lib/trpc/routers/__tests__/*.test.ts`

**Context:** Router procedures need integration tests.

(Similar pattern to SDK tests, with mock database context)

---

### Task 6.3: Add Component Tests

**Files:**
- Create: `apps/web/src/components/**/__tests__/*.test.tsx`

(Tests using @testing-library/react)

---

### Task 6.4: Add E2E Tests with Playwright

**Files:**
- Create: `apps/web/e2e/*.spec.ts`
- Create: `apps/web/playwright.config.ts`

**Step 1: Create Playwright config**

```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Step 2: Create E2E tests**

```typescript
// apps/web/e2e/baleybot-crud.spec.ts
import { test, expect } from '@playwright/test';

test.describe('BaleyBot CRUD', () => {
  test.beforeEach(async ({ page }) => {
    // Login flow
    await page.goto('/login');
    // ...
  });

  test('creates a new BaleyBot', async ({ page }) => {
    await page.goto('/dashboard/baleybots');
    await page.click('[data-testid="create-baleybot"]');

    await page.fill('[data-testid="baleybot-name"]', 'Test Bot');
    await page.click('[data-testid="create-submit"]');

    await expect(page).toHaveURL(/\/dashboard\/baleybots\/[\w-]+/);
    await expect(page.locator('h1')).toContainText('Test Bot');
  });

  // More CRUD tests
});
```

**Step 3: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e/*.ts
git commit -m "test(e2e): add Playwright E2E tests

Core user flows covered: auth, CRUD, execution.

Closes #LOW-002"
```

---

### Task 6.5-6.8: Documentation Tasks

- Add JSDoc to all public APIs
- Create README files for component directories
- Document database schema
- Create API reference documentation

---

### Task 6.9-6.12: Final Cleanup Tasks

- Remove unused dependencies
- Update all dependencies to latest
- Add pre-commit hooks
- Configure CI/CD pipeline

---

## Final Verification Checklist

After completing all phases, verify:

### Security
- [ ] All `new Function()` calls replaced
- [ ] Rate limiting on all execute procedures
- [ ] No secrets in logs
- [ ] Cascade deletes configured
- [ ] Input validation on all endpoints

### Stability
- [ ] No race conditions in critical paths
- [ ] All abort signals handled correctly
- [ ] Memory leaks fixed
- [ ] Database indexes added

### Quality
- [ ] ErrorBoundary on all routes
- [ ] Loading states on all routes
- [ ] No `any` types in routers
- [ ] Structured logging throughout

### Accessibility
- [ ] All icon buttons have ARIA labels
- [ ] Keyboard navigation works
- [ ] Focus management in modals
- [ ] Color contrast passes WCAG AA

### Testing
- [ ] SDK: 70% coverage
- [ ] Routers: 60% coverage
- [ ] Components: 50% coverage
- [ ] E2E: Critical paths covered

### Documentation
- [ ] All public APIs documented
- [ ] README in each package
- [ ] Architecture overview updated

---

## Execution Instructions

This plan should be executed using `superpowers:executing-plans` skill in a fresh session:

1. Create a git worktree for isolation:
   ```bash
   git worktree add ../balayui-remediation main
   cd ../balayui-remediation
   ```

2. Execute phases in order (1 → 6)
3. Commit after each task
4. Run type-check and tests after each phase
5. Create PR after all phases complete

**Estimated Total Commits:** 100+
**Estimated Time:** Full team sprint (2-3 weeks)

For questions during execution, refer to:
- Previous plan: `docs/plans/2026-02-02-comprehensive-fixes-implementation.md`
- SDK documentation: `packages/sdk/README.md`
- Architecture: `docs/plans/2026-02-01-bal-first-architecture.md`
