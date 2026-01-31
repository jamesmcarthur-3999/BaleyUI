import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// For development, we can create a global connection pool
const globalForDb = globalThis as unknown as {
  client: postgres.Sql | undefined;
};

const client = globalForDb.client ?? postgres(connectionString);
if (process.env.NODE_ENV !== 'production') globalForDb.client = client;

export const db = drizzle(client, { schema });

// Re-export schema and types
export * from './schema';
export * from './types';

// Re-export drizzle-orm operators for consistent usage
export { eq, ne, gt, gte, lt, lte, isNull, isNotNull, and, or, sql, desc, asc, inArray } from 'drizzle-orm';

// Data Integrity Layer
export { withTransaction } from './transactions';
export type { Transaction } from './transactions';
export { updateWithLock, OptimisticLockError } from './optimistic-lock';
export { notDeleted, softDelete, restore } from './soft-delete';
