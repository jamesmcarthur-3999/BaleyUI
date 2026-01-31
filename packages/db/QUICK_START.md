# Data Integrity Layer - Quick Start Guide

Get up and running with the Data Integrity Layer in 5 minutes.

## Step 1: Environment Setup (1 minute)

Generate an encryption key and add it to your `.env.local`:

```bash
# Generate a secure encryption key
openssl rand -hex 32

# Add to .env.local
echo "ENCRYPTION_KEY=<paste_the_generated_key_here>" >> .env.local
```

## Step 2: Import What You Need (30 seconds)

```typescript
// In your tRPC router
import { router, auditedProcedure } from '@/lib/trpc/trpc';
import {
  blocks,
  eq,
  withTransaction,
  updateWithLock,
  OptimisticLockError,
  softDelete,
  restore,
  notDeleted,
} from '@baleyui/db';
import { encrypt, decrypt } from '@/lib/encryption';
```

## Step 3: Use in Your Code (3 minutes)

### For Queries - Filter Deleted Records

```typescript
// Before
const blocks = await db.query.blocks.findMany();

// After
const blocks = await db.query.blocks.findMany({
  where: notDeleted(blocks),
});
```

### For Updates - Add Optimistic Locking

```typescript
// In your tRPC router
update: auditedProcedure
  .input(z.object({
    id: z.string(),
    version: z.number(),  // Add this to your input
    name: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      const updated = await updateWithLock(
        blocks,
        input.id,
        input.version,
        { name: input.name }
      );

      await ctx.audit({
        entityType: 'block',
        entityId: input.id,
        action: 'update',
        changes: { name: input.name },
      });

      return updated;
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Record was modified. Please refresh and try again.',
        });
      }
      throw error;
    }
  }),
```

### For Deletes - Use Soft Delete

```typescript
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
```

### For API Keys - Encrypt Before Storing

```typescript
createConnection: auditedProcedure
  .input(z.object({
    type: z.enum(['openai', 'anthropic']),
    apiKey: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    const connection = await ctx.db
      .insert(connections)
      .values({
        type: input.type,
        workspaceId: ctx.workspace.id,
        config: {
          apiKey: encrypt(input.apiKey),  // Encrypt before storing
        },
      })
      .returning();

    return connection[0];
  }),
```

### For Multi-Step Operations - Use Transactions

```typescript
createBlockWithTools: auditedProcedure
  .input(z.object({
    blockName: z.string(),
    tools: z.array(z.object({ name: z.string() })),
  }))
  .mutation(async ({ ctx, input }) => {
    return await withTransaction(async (tx) => {
      const block = await tx.insert(blocks)
        .values({ name: input.blockName })
        .returning();

      const createdTools = [];
      for (const tool of input.tools) {
        const t = await tx.insert(tools)
          .values({ ...tool, blockId: block[0].id })
          .returning();
        createdTools.push(t[0]);
      }

      return { block: block[0], tools: createdTools };
    });
  }),
```

## Step 4: Update Your Frontend (30 seconds)

### Add Version to Forms

```tsx
function BlockEditor({ block }) {
  const updateBlock = trpc.blocks.update.useMutation();

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      updateBlock.mutate({
        id: block.id,
        version: block.version,  // Include current version
        name: formData.name,
      });
    }}>
      <input name="name" defaultValue={block.name} />
      <input type="hidden" value={block.version} />  {/* Track version */}
      <button>Save</button>
    </form>
  );
}
```

### Handle Optimistic Lock Errors

```tsx
function BlockEditor({ block }) {
  const updateBlock = trpc.blocks.update.useMutation({
    onError: (error) => {
      if (error.data?.code === 'CONFLICT') {
        toast.error('This record was modified. Please refresh the page.');
        // Optionally: refetch to get latest version
      }
    },
  });

  // ... rest of component
}
```

## Common Patterns

### Pattern 1: CRUD with All Features

```typescript
export const blocksRouter = router({
  // List (with soft delete filter)
  list: auditedProcedure.query(async ({ ctx }) => {
    return await ctx.db.query.blocks.findMany({
      where: notDeleted(blocks),
    });
  }),

  // Create (with audit)
  create: auditedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.insert(blocks)
        .values({ name: input.name })
        .returning();

      await ctx.audit({
        entityType: 'block',
        entityId: block[0].id,
        action: 'create',
        changes: input,
      });

      return block[0];
    }),

  // Update (with optimistic lock + audit)
  update: auditedProcedure
    .input(z.object({
      id: z.string(),
      version: z.number(),
      name: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateWithLock(
        blocks,
        input.id,
        input.version,
        { name: input.name }
      );

      await ctx.audit({
        entityType: 'block',
        entityId: input.id,
        action: 'update',
        changes: { name: input.name },
      });

      return updated;
    }),

  // Delete (soft delete + audit)
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

### Pattern 2: Decrypt on Demand

```typescript
// Get connection with decrypted API key
getConnection: auditedProcedure
  .input(z.object({ id: z.string() }))
  .query(async ({ ctx, input }) => {
    const connection = await ctx.db.query.connections.findFirst({
      where: eq(connections.id, input.id),
    });

    if (!connection) throw new TRPCError({ code: 'NOT_FOUND' });

    // Decrypt API key for use
    const config = connection.config as { apiKey: string };
    const apiKey = decrypt(config.apiKey);

    return { ...connection, apiKey }; // Return with decrypted key
  }),
```

### Pattern 3: Audit Trail Query

```typescript
getHistory: auditedProcedure
  .input(z.object({ entityType: z.string(), entityId: z.string() }))
  .query(async ({ ctx, input }) => {
    return await ctx.db.query.auditLogs.findMany({
      where: (logs, { eq, and }) =>
        and(
          eq(logs.entityType, input.entityType),
          eq(logs.entityId, input.entityId)
        ),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
    });
  }),
```

## Checklist

- [ ] Add `ENCRYPTION_KEY` to `.env.local`
- [ ] Use `auditedProcedure` for data mutations
- [ ] Include `version` in update inputs
- [ ] Use `notDeleted()` in queries
- [ ] Encrypt secrets with `encrypt()` before storing
- [ ] Decrypt with `decrypt()` when needed
- [ ] Handle `OptimisticLockError` in error handlers
- [ ] Add `ctx.audit()` calls to mutations
- [ ] Use `withTransaction()` for multi-step operations

## Need Help?

- **Full Documentation**: See `DATA_INTEGRITY.md`
- **Example Router**: See `apps/web/src/lib/trpc/example-router.ts`
- **Tests**: See `src/__tests__/data-integrity.test.ts`

## Tips

1. **Always use `notDeleted()`** in queries (except trash views)
2. **Always encrypt secrets** before storing in database
3. **Always include version** in update forms
4. **Always use transactions** for multi-step operations
5. **Log important actions** with `ctx.audit()`

That's it! You're now using enterprise-grade data integrity patterns. 🚀
