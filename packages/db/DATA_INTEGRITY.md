# Data Integrity Layer

This document describes the Data Integrity Layer components for BaleyUI, providing transaction support, optimistic locking, soft deletes, encryption, and audit logging.

## Components

### 1. Transaction Helper

Location: `packages/db/src/transactions.ts`

Provides a simple wrapper for database transactions with automatic rollback on error.

```typescript
import { withTransaction, blocks, tools } from '@baleyui/db';

// Create multiple related records atomically
const result = await withTransaction(async (tx) => {
  const block = await tx
    .insert(blocks)
    .values({
      name: 'New Block',
      workspaceId: workspace.id,
    })
    .returning();

  const tool = await tx
    .insert(tools)
    .values({
      blockId: block[0].id,
      name: 'Helper Tool',
    })
    .returning();

  return { block: block[0], tool: tool[0] };
});

// If any error occurs, entire transaction is rolled back
```

**Features:**
- Automatic rollback on error
- Automatic commit on success
- Type-safe transaction client
- Works with all Drizzle operations

---

### 2. Optimistic Locking

Location: `packages/db/src/optimistic-lock.ts`

Prevents lost updates when multiple users edit the same record concurrently.

```typescript
import { updateWithLock, OptimisticLockError, blocks } from '@baleyui/db';

try {
  const updated = await updateWithLock(
    blocks,
    blockId,
    currentVersion, // The version the client has
    { name: 'Updated Name' }
  );

  console.log('Successfully updated to version', updated.version);
} catch (error) {
  if (error instanceof OptimisticLockError) {
    // Show user: "This record was modified by another user. Please refresh."
    console.error(error.message);
  }
}
```

**How it works:**
1. Client reads a record with version 3
2. Client makes changes locally
3. Client attempts to save with expected version 3
4. If current version is still 3: update succeeds, version becomes 4
5. If current version is 4+: update fails with `OptimisticLockError`

**Best Practices:**
- Always include `version` in your GET responses
- Show version number in UI for debugging
- On conflict, fetch fresh data and merge changes if possible
- In forms, store version in a hidden field

---

### 3. Soft Delete

Location: `packages/db/src/soft-delete.ts`

Allows "deleting" records without actually removing them from the database.

```typescript
import { softDelete, restore, notDeleted, blocks, db } from '@baleyui/db';

// Soft delete a block
const deleted = await softDelete(blocks, blockId, userId);
console.log('Deleted at:', deleted.deletedAt);
console.log('Deleted by:', deleted.deletedBy);

// Query only active (non-deleted) records
const activeBlocks = await db.query.blocks.findMany({
  where: notDeleted(blocks),
});

// Combine with other filters
const userActiveBlocks = await db.query.blocks.findMany({
  where: (blocks, { eq, and }) =>
    and(
      notDeleted(blocks),
      eq(blocks.workspaceId, workspaceId)
    ),
});

// Restore a deleted block
const restored = await restore(blocks, blockId, userId);
console.log('Restored:', restored.deletedAt); // null
```

**Best Practices:**
- Always use `notDeleted()` in queries (except for "trash" views)
- Show deleted items in a separate "Trash" or "Archive" view
- Implement auto-purge after 30 days if needed
- Consider hard delete for sensitive data (GDPR compliance)

**Schema Requirements:**
Your tables need these fields:
```typescript
deletedAt: timestamp('deleted_at'),
deletedBy: varchar('deleted_by', { length: 255 }),
```

---

### 4. Encryption

Location: `apps/web/src/lib/encryption/index.ts`

AES-256-GCM encryption for sensitive data like API keys.

```typescript
import { encrypt, decrypt } from '@/lib/encryption';

// Encrypt before storing
const apiKey = 'sk-1234567890abcdef';
const encrypted = encrypt(apiKey);

await db.insert(connections).values({
  type: 'openai',
  config: { apiKey: encrypted },
});

// Decrypt when using
const connection = await db.query.connections.findFirst();
const plainApiKey = decrypt(connection.config.apiKey);

const client = new OpenAI({ apiKey: plainApiKey });
```

**Setup:**
1. Generate an encryption key:
   ```bash
   openssl rand -hex 32
   ```

2. Add to `.env.local`:
   ```env
   ENCRYPTION_KEY=your_64_character_hex_string_here
   ```

3. **Important**: Never commit the encryption key to git!

**Format:**
Encrypted strings use format: `iv:authTag:encrypted` (all hex encoded)

**Features:**
- AES-256-GCM (industry standard)
- Authenticated encryption (tamper-proof)
- Random IV for each encryption (no pattern leaks)
- Helper `isEncrypted()` for migration

**Example Migration:**
```typescript
// Migrate old plaintext to encrypted
const connections = await db.query.connections.findMany();

for (const conn of connections) {
  if (!isEncrypted(conn.config.apiKey)) {
    await db.update(connections)
      .set({
        config: {
          ...conn.config,
          apiKey: encrypt(conn.config.apiKey)
        }
      })
      .where(eq(connections.id, conn.id));
  }
}
```

---

### 5. Audit Logging

Location: `apps/web/src/lib/audit/middleware.ts`

Automatically log all data changes for compliance and debugging.

```typescript
import { router, auditedProcedure } from '@/lib/trpc/trpc';
import { blocks, eq } from '@baleyui/db';
import { z } from 'zod';

export const blocksRouter = router({
  update: auditedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get current state
      const current = await ctx.db.query.blocks.findFirst({
        where: eq(blocks.id, input.id),
      });

      // Perform update
      const updated = await ctx.db
        .update(blocks)
        .set({ name: input.name })
        .where(eq(blocks.id, input.id))
        .returning();

      // Log the change
      await ctx.audit({
        entityType: 'block',
        entityId: input.id,
        action: 'update',
        changes: { name: input.name },
        previousValues: { name: current?.name },
      });

      return updated[0];
    }),

  delete: auditedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await softDelete(blocks, input.id, ctx.userId);

      await ctx.audit({
        entityType: 'block',
        entityId: input.id,
        action: 'delete',
      });

      return deleted;
    }),
});
```

**What gets logged:**
- `entityType` - What was changed (e.g., 'block', 'connection')
- `entityId` - Which record changed
- `action` - What happened ('create', 'update', 'delete', 'restore')
- `changes` - New values
- `previousValues` - Old values
- `userId` - Who made the change
- `workspaceId` - Which workspace
- `ipAddress` - Request origin
- `userAgent` - Browser/client info
- `requestId` - Unique ID for request tracing
- `createdAt` - When it happened

**Helper Functions:**

```typescript
import { getChanges, getPreviousValues } from '@/lib/audit/middleware';

const oldData = { name: 'Old Name', status: 'active', count: 5 };
const newData = { name: 'New Name', status: 'active', count: 10 };

// Get only changed fields
const changes = getChanges(oldData, newData);
// { name: 'New Name', count: 10 }

// Get previous values for changed fields
const previous = getPreviousValues(oldData, Object.keys(changes));
// { name: 'Old Name', count: 5 }
```

**Querying Audit Logs:**

```typescript
import { db, auditLogs, eq, desc } from '@baleyui/db';

// Get all changes for a specific block
const blockHistory = await db
  .select()
  .from(auditLogs)
  .where(
    and(
      eq(auditLogs.entityType, 'block'),
      eq(auditLogs.entityId, blockId)
    )
  )
  .orderBy(desc(auditLogs.createdAt));

// Get all changes by a user
const userActivity = await db
  .select()
  .from(auditLogs)
  .where(eq(auditLogs.userId, userId))
  .orderBy(desc(auditLogs.createdAt))
  .limit(100);
```

---

## Complete Example: Update with All Features

```typescript
import { router, auditedProcedure } from '@/lib/trpc/trpc';
import {
  blocks,
  eq,
  updateWithLock,
  OptimisticLockError,
  withTransaction,
} from '@baleyui/db';
import { encrypt } from '@/lib/encryption';
import { getChanges, getPreviousValues } from '@/lib/audit/middleware';
import { z } from 'zod';

export const blocksRouter = router({
  update: auditedProcedure
    .input(
      z.object({
        id: z.string(),
        version: z.number(),
        name: z.string().optional(),
        apiKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await withTransaction(async (tx) => {
          // Get current state for audit log
          const current = await tx.query.blocks.findFirst({
            where: eq(blocks.id, input.id),
          });

          if (!current) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Block not found',
            });
          }

          // Prepare updates with encryption
          const updates: any = {};
          if (input.name) updates.name = input.name;
          if (input.apiKey) {
            updates.config = {
              ...current.config,
              apiKey: encrypt(input.apiKey),
            };
          }

          // Update with optimistic locking
          const updated = await updateWithLock(
            blocks,
            input.id,
            input.version,
            updates,
            tx
          );

          // Compute changes for audit log
          const changes = getChanges(current, updated);
          const previousValues = getPreviousValues(
            current,
            Object.keys(changes)
          );

          // Log the change
          await ctx.audit({
            entityType: 'block',
            entityId: input.id,
            action: 'update',
            changes,
            previousValues,
          });

          return updated;
        });
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: error.message,
          });
        }
        throw error;
      }
    }),
});
```

---

## Testing

### Transaction Rollback Test

```typescript
import { withTransaction, blocks, tools } from '@baleyui/db';

test('transaction rolls back on error', async () => {
  const initialCount = await db.select({ count: sql`count(*)` }).from(blocks);

  await expect(
    withTransaction(async (tx) => {
      await tx.insert(blocks).values({ name: 'Test' });
      throw new Error('Simulated error');
    })
  ).rejects.toThrow('Simulated error');

  const finalCount = await db.select({ count: sql`count(*)` }).from(blocks);
  expect(finalCount).toEqual(initialCount);
});
```

### Optimistic Lock Test

```typescript
import { updateWithLock, OptimisticLockError } from '@baleyui/db';

test('optimistic lock prevents concurrent updates', async () => {
  const block = await db.insert(blocks)
    .values({ name: 'Test', version: 1 })
    .returning();

  // Simulate concurrent update
  await db.update(blocks)
    .set({ version: 2 })
    .where(eq(blocks.id, block[0].id));

  // This should fail
  await expect(
    updateWithLock(blocks, block[0].id, 1, { name: 'Updated' })
  ).rejects.toThrow(OptimisticLockError);
});
```

### Encryption Test

```typescript
import { encrypt, decrypt, isEncrypted } from '@/lib/encryption';

test('encryption round-trip', () => {
  const plaintext = 'sk-1234567890abcdef';
  const encrypted = encrypt(plaintext);

  expect(isEncrypted(encrypted)).toBe(true);
  expect(encrypted).not.toBe(plaintext);
  expect(decrypt(encrypted)).toBe(plaintext);
});

test('tampered ciphertext fails', () => {
  const encrypted = encrypt('secret');
  const tampered = encrypted.replace(/.$/, '0'); // Change last character

  expect(() => decrypt(tampered)).toThrow();
});
```

---

## Best Practices Summary

1. **Transactions**: Use for any multi-step operation that must succeed or fail together
2. **Optimistic Locking**: Use for all user-editable records to prevent lost updates
3. **Soft Delete**: Use by default; hard delete only for sensitive data or after retention period
4. **Encryption**: Encrypt all secrets (API keys, passwords, tokens) before storing
5. **Audit Logging**: Use `auditedProcedure` for all data mutations except high-frequency operations

---

## Environment Setup

Add to `.env.local`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/baleyui

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your_64_character_hex_string_here_do_not_commit
```

**Security Checklist:**
- [ ] `.env.local` is in `.gitignore`
- [ ] Encryption key is stored in environment variables
- [ ] Encryption key is different per environment (dev/staging/prod)
- [ ] Database backups are encrypted at rest
- [ ] Audit logs are retained for compliance period (e.g., 90 days)
