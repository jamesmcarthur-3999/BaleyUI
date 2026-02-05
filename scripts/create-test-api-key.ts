/**
 * Script to create an API key for the test-chat app
 *
 * Run: pnpm tsx scripts/create-test-api-key.ts
 */

import { db, apiKeys, workspaces, eq, isNull } from '@baleyui/db';
import { createHash, randomBytes } from 'crypto';

async function main() {
  // Get the first workspace (dev environment)
  const workspace = await db.query.workspaces.findFirst({
    where: isNull(workspaces.deletedAt),
  });

  if (!workspace) {
    console.error('No workspace found. Please create one first.');
    process.exit(1);
  }

  console.log(`Found workspace: ${workspace.id}`);

  // Generate a new API key
  const keyId = randomBytes(24).toString('hex');
  const fullKey = `bui_test_${keyId}`;
  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.slice(0, 16);
  const keySuffix = fullKey.slice(-4);

  // Check if a test key already exists
  const existingKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.name, 'Test Chat App'),
  });

  if (existingKey && !existingKey.revokedAt) {
    console.log('A test API key already exists. Revoking old one...');
    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, existingKey.id));
  }

  // Insert the new API key
  await db.insert(apiKeys).values({
    workspaceId: workspace.id,
    name: 'Test Chat App',
    keyHash,
    keyPrefix,
    keySuffix,
    permissions: ['execute', 'read'],
    createdBy: 'script',
  });

  console.log('\n===== API KEY CREATED =====');
  console.log(`Key: ${fullKey}`);
  console.log(`Workspace: ${workspace.id}`);
  console.log('Permissions: execute, read');
  console.log('\nAdd this to apps/test-chat/.env:');
  console.log(`VITE_BALEYUI_API_KEY=${fullKey}`);
  console.log('===========================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
