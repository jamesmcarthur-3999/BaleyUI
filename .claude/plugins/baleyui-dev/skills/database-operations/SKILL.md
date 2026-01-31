---
name: database-operations
description: Database patterns for soft deletes, optimistic locking, and transactions
---

# Database Operations

Schema: `/packages/db/src/schema.ts`

## Always Use Soft Deletes

```typescript
import { notDeleted, softDelete } from '@baleyui/db';

// Query - ALWAYS filter deleted records
const blocks = await db.query.blocks.findMany({
  where: and(eq(blocks.workspaceId, wsId), notDeleted(blocks))
});

// Delete
await softDelete(blocks, blockId, userId);
```

## Always Use Optimistic Locking

```typescript
import { updateWithLock, OptimisticLockError } from '@baleyui/db';

try {
  await updateWithLock(blocks, id, currentVersion, { name: 'New' });
} catch (e) {
  if (e instanceof OptimisticLockError) {
    // Refresh and retry
  }
}
```

## Always Use Transactions for Multi-Table Ops

```typescript
import { withTransaction } from '@baleyui/db';

await withTransaction(async (tx) => {
  const [block] = await tx.insert(blocks).values(data).returning();
  await tx.insert(auditLogs).values({ blockId: block.id, ... });
});
```
