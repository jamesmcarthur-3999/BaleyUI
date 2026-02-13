# Phase 4.5: Centralized Config

**Status:** Pending Review
**Dependencies:** None
**Estimated Scope:** ~200 LOC across 3 files

## Overview

Replace scattered hardcoded constants (rate limits, thresholds, feature flags) with a centralized `platform_config` database table and admin panel. This allows tuning platform behavior without code changes.

---

## 4.5.1 — Database Schema

**File:** `packages/db/src/schema.ts`

```typescript
export const platformConfig = pgTable(
  'platform_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 255 }).notNull().unique(),
    value: jsonb('value').notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }), // 'execution', 'security', 'analytics', etc.
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('platform_config_category_idx').on(table.category),
  ]
);
```

---

## 4.5.2 — `getConfig()` Helper

**File:** `apps/web/src/lib/config.ts`

```typescript
const configCache = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

export async function getConfig<T>(key: string, defaultValue: T): Promise<T> {
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const row = await db.query.platformConfig.findFirst({
    where: eq(platformConfig.key, key),
  });

  const value = row ? (row.value as T) : defaultValue;
  configCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
  return value;
}
```

---

## 4.5.3 — Admin Panel Page

**File:** `apps/web/src/app/dashboard/admin/config/page.tsx`

Simple key-value editor table showing all config entries grouped by category. Editable values with JSON validation.

---

## Default Config Entries

| Key | Default | Category | Used By |
|-----|---------|----------|---------|
| `slow_execution_multiplier` | `2` | execution | Phase 2.3 slow execution review |
| `max_pattern_learner_rate` | `1` per 5 min | execution | Phase 2 rate limiting |
| `webhook_max_body_size` | `102400` | security | Phase 0.3 webhook body limit |
| `creator_rate_limit_per_min` | `30` | security | Creator stream endpoint |

---

## Files Created/Modified

| Action | File |
|---|---|
| **Modify** | `packages/db/src/schema.ts` — add `platformConfig` table |
| **Create** | `apps/web/src/lib/config.ts` — `getConfig()` helper |
| **Create** | `apps/web/src/app/dashboard/admin/config/page.tsx` — admin panel |
