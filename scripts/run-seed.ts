#!/usr/bin/env npx tsx
/**
 * Seed Runner Script
 *
 * Easy-to-use CLI for seeding the demo workspace.
 *
 * Usage:
 *   npx tsx scripts/run-seed.ts [clerk_user_id]
 *
 * Examples:
 *   npx tsx scripts/run-seed.ts                    # Uses 'demo_user'
 *   npx tsx scripts/run-seed.ts user_abc123        # Uses specific Clerk user ID
 *
 * Environment:
 *   Requires DATABASE_URL in .env or packages/db/.env
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment from multiple possible locations
const envPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), 'packages/db/.env'),
  resolve(process.cwd(), 'apps/web/.env.local'),
];

for (const envPath of envPaths) {
  config({ path: envPath });
}

// Verify DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.\n');
  console.error('Please create a .env file with:');
  console.error('  DATABASE_URL=postgresql://username@localhost:5432/baleyui\n');
  process.exit(1);
}

// Dynamic import after environment is loaded
async function main() {
  const ownerId = process.argv[2] || 'demo_user';

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║        BaleyUI Demo Workspace Seed Script          ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log(`📍 Database: ${maskDatabaseUrl(process.env.DATABASE_URL!)}`);
  console.log(`👤 Owner ID: ${ownerId}\n`);

  try {
    // Import the seed function
    const { seedDemoWorkspace } = await import('../packages/db/src/seed');

    const result = await seedDemoWorkspace(ownerId);

    console.log('\n✅ Demo workspace ready!\n');
    console.log('Next steps:');
    console.log('  1. Start the dev server:');
    console.log('     pnpm dev\n');
    console.log('  2. Sign in with Clerk\n');
    console.log('  3. Access the demo workspace at:');
    console.log(`     http://localhost:3000/dashboard\n`);
    console.log('  4. Test the following features:');
    console.log('     • View blocks, flows, connections');
    console.log('     • Execute flows and see real-time streaming');
    console.log('     • Check execution history and analytics');
    console.log('     • Review decisions and provide feedback');
    console.log('     • Manage API keys in Settings\n');

    return result;
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  }
}

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@]+@/, ':***@');
  }
}

main();
