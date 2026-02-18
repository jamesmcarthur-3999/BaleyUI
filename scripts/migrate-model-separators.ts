/**
 * One-time migration: replace colon model separators with pipe separators
 * in all balCode fields stored in the database.
 *
 * Run with: npx tsx scripts/migrate-model-separators.ts
 *
 * Safe to re-run: already-migrated rows are skipped (no colon provider patterns found).
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

const PROVIDER_PREFIXES = ['anthropic', 'openai', 'ollama'] as const;

/**
 * Replace provider:model with provider|model in a BAL code string.
 * Only matches the specific provider: patterns to avoid clobbering URLs or other colons.
 */
function migrateBalCode(balCode: string): { updated: string; changed: boolean } {
  let updated = balCode;
  for (const prefix of PROVIDER_PREFIXES) {
    // Match "prefix:word" where word starts with a letter (model name)
    const pattern = new RegExp(`\\b${prefix}:([a-zA-Z])`, 'g');
    updated = updated.replace(pattern, `${prefix}|$1`);
  }
  return { updated, changed: updated !== balCode };
}

async function main() {
  console.log('Fetching all baleybots with BAL code...');

  // Raw query to get id + balCode for all non-deleted bots
  const rows = await db.execute<{ id: string; bal_code: string }>(
    sql`SELECT id, bal_code FROM baleybots WHERE bal_code IS NOT NULL AND deleted_at IS NULL`,
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { updated, changed } = migrateBalCode(row.bal_code);
    if (!changed) {
      skipped++;
      continue;
    }

    await db.execute(
      sql`UPDATE baleybots SET bal_code = ${updated} WHERE id = ${row.id}`,
    );
    migrated++;
    console.log(`  Migrated bot ${row.id}`);
  }

  console.log(`\nDone. Migrated: ${migrated}, Already up-to-date: ${skipped}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
