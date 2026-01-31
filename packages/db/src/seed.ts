/**
 * Database Seed Script
 *
 * Populates the database with comprehensive demo data for testing.
 *
 * Usage:
 *   npx dotenv -e .env -- npx tsx src/seed.ts [clerk_user_id]
 *
 * If no user ID provided, uses 'demo_user' as default.
 */

import { db } from './index';
import {
  workspaces,
  connections,
  tools,
  blocks,
  flows,
  flowExecutions,
  blockExecutions,
  decisions,
  patterns,
  apiKeys,
} from './schema';
import { eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import {
  DEMO_WORKSPACE,
  DEMO_CONNECTIONS,
  DEMO_TOOLS,
  DEMO_BLOCKS,
  DEMO_FLOWS,
  SAMPLE_INPUTS,
  SAMPLE_OUTPUTS,
  FEEDBACK_CATEGORIES,
  generateUUID,
  randomItem,
  randomInt,
  randomDate,
  randomStatus,
} from './seed-data';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TOTAL_EXECUTIONS = 100; // ~25 per flow
const DECISIONS_WITH_FEEDBACK_PERCENT = 20;
const PATTERN_COUNT = 5;

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

export async function seedDemoWorkspace(ownerId: string = 'demo_user') {
  console.log('🌱 Starting database seed...\n');

  // Check if demo workspace already exists
  const existingWorkspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, DEMO_WORKSPACE.slug))
    .limit(1);

  if (existingWorkspace.length > 0) {
    console.log('⚠️  Demo workspace already exists. Cleaning up...');
    await cleanupDemoData();
  }

  console.log(`👤 Owner ID: ${ownerId}\n`);

  // ============================================================================
  // 1. Create Workspace
  // ============================================================================

  console.log('1️⃣  Creating workspace...');
  const [workspace] = await db
    .insert(workspaces)
    .values({
      id: DEMO_WORKSPACE.id,
      name: DEMO_WORKSPACE.name,
      slug: DEMO_WORKSPACE.slug,
      ownerId,
    })
    .returning();

  if (!workspace) throw new Error('Failed to create workspace');
  console.log(`   ✅ Workspace: ${workspace.name} (${workspace.id})\n`);

  // ============================================================================
  // 2. Create Connections
  // ============================================================================

  console.log('2️⃣  Creating connections...');
  const connectionValues = Object.values(DEMO_CONNECTIONS);
  await db.insert(connections).values(connectionValues);
  console.log(`   ✅ Created ${connectionValues.length} connections\n`);

  // ============================================================================
  // 3. Create Tools
  // ============================================================================

  console.log('3️⃣  Creating tools...');
  const toolValues = Object.values(DEMO_TOOLS);
  await db.insert(tools).values(toolValues);
  console.log(`   ✅ Created ${toolValues.length} tools\n`);

  // ============================================================================
  // 4. Create Blocks
  // ============================================================================

  console.log('4️⃣  Creating blocks...');
  const blockValues = Object.values(DEMO_BLOCKS).map((block) => ({
    ...block,
    executionCount: randomInt(50, 200),
    avgLatencyMs: randomInt(300, 1500),
    lastExecutedAt: randomDate(1, 30),
  }));
  await db.insert(blocks).values(blockValues);
  console.log(`   ✅ Created ${blockValues.length} blocks\n`);

  // ============================================================================
  // 5. Create Flows
  // ============================================================================

  console.log('5️⃣  Creating flows...');
  const flowValues = Object.values(DEMO_FLOWS);
  await db.insert(flows).values(flowValues);
  console.log(`   ✅ Created ${flowValues.length} flows\n`);

  // ============================================================================
  // 6. Create API Keys
  // ============================================================================

  console.log('6️⃣  Creating API keys...');
  const apiKeyData = [
    { name: 'Development Key', permissions: ['read', 'execute'] },
    { name: 'Read-Only Key', permissions: ['read'] },
    { name: 'Admin Key', permissions: ['read', 'execute', 'admin'] },
  ];

  for (const keyDef of apiKeyData) {
    const rawKey = `bui_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await db.insert(apiKeys).values({
      workspaceId: DEMO_WORKSPACE.id,
      name: keyDef.name,
      keyHash,
      keyPrefix: rawKey.slice(0, 12),
      keySuffix: rawKey.slice(-4),
      permissions: keyDef.permissions,
      createdBy: ownerId,
    });

    console.log(`   🔑 ${keyDef.name}: ${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`);
  }
  console.log(`   ✅ Created ${apiKeyData.length} API keys\n`);

  // ============================================================================
  // 7. Create Flow Executions & Block Executions
  // ============================================================================

  console.log('7️⃣  Creating execution history...');

  const flowIds = Object.values(DEMO_FLOWS).map((f) => f.id);
  const blockIdsMap = {
    [DEMO_FLOWS.sentimentPipeline.id]: [DEMO_BLOCKS.sentimentAnalyzer.id, DEMO_BLOCKS.responseWrapper.id],
    [DEMO_FLOWS.customerSupportRouter.id]: [DEMO_BLOCKS.customerSupportBot.id, DEMO_BLOCKS.responseWrapper.id],
    [DEMO_FLOWS.mathSolverPipeline.id]: [DEMO_BLOCKS.mathSolver.id, DEMO_BLOCKS.dataValidator.id],
    [DEMO_FLOWS.parallelAnalyzer.id]: [DEMO_BLOCKS.sentimentAnalyzer.id, DEMO_BLOCKS.productRecommender.id, DEMO_BLOCKS.jsonFormatter.id],
  };

  let executionCount = 0;
  let blockExecutionCount = 0;
  const blockExecutionIds: string[] = [];

  for (let i = 0; i < TOTAL_EXECUTIONS; i++) {
    const flowId = flowIds[i % flowIds.length]!;
    const status = randomStatus();
    const startedAt = randomDate(1, 60);
    const durationMs = randomInt(500, 5000);
    const completedAt = status === 'completed' ? new Date(startedAt.getTime() + durationMs) : null;

    // Create flow execution
    const flowExecId = generateUUID('ffffffff', i);
    const input = getFlowInput(flowId);

    const [flowExec] = await db
      .insert(flowExecutions)
      .values({
        id: flowExecId,
        flowId,
        flowVersion: 1,
        triggeredBy: { type: 'manual', userId: ownerId },
        status,
        input,
        output: status === 'completed' ? getFlowOutput(flowId) : null,
        error: status === 'failed' ? { message: 'Simulated error for testing' } : null,
        startedAt,
        completedAt,
      })
      .returning();

    if (!flowExec) continue;
    executionCount++;

    // Create block executions for this flow
    const blockIds = blockIdsMap[flowId] || [];
    for (let j = 0; j < blockIds.length; j++) {
      const blockId = blockIds[j]!;
      const blockExecId = generateUUID('gggggggg', i * 10 + j);
      blockExecutionIds.push(blockExecId);

      const blockStatus = status === 'completed' ? 'complete' : status;
      const blockStarted = new Date(startedAt.getTime() + j * 200);
      const blockDuration = randomInt(200, 2000);

      await db.insert(blockExecutions).values({
        id: blockExecId,
        blockId,
        flowExecutionId: flowExecId,
        baleybotId: `baleybot-${i}-${j}`,
        status: blockStatus,
        input: getBlockInput(blockId),
        output: blockStatus === 'complete' ? getBlockOutput(blockId) : null,
        error: blockStatus === 'failed' ? 'Simulated block error' : null,
        model: getBlockModel(blockId),
        tokensInput: randomInt(100, 500),
        tokensOutput: randomInt(50, 300),
        executionPath: 'ai',
        startedAt: blockStarted,
        completedAt: blockStatus === 'complete' ? new Date(blockStarted.getTime() + blockDuration) : null,
        durationMs: blockStatus === 'complete' ? blockDuration : null,
      });

      blockExecutionCount++;
    }
  }

  console.log(`   ✅ Created ${executionCount} flow executions`);
  console.log(`   ✅ Created ${blockExecutionCount} block executions\n`);

  // ============================================================================
  // 8. Create Decisions
  // ============================================================================

  console.log('8️⃣  Creating decisions...');

  const aiBlockIds = [
    DEMO_BLOCKS.sentimentAnalyzer.id,
    DEMO_BLOCKS.customerSupportBot.id,
    DEMO_BLOCKS.mathSolver.id,
    DEMO_BLOCKS.weatherAssistant.id,
    DEMO_BLOCKS.productRecommender.id,
  ];

  let decisionCount = 0;

  // Create decisions from block executions (only for AI blocks)
  for (let i = 0; i < Math.min(blockExecutionIds.length, 75); i++) {
    const blockExecId = blockExecutionIds[i]!;
    const blockId = aiBlockIds[i % aiBlockIds.length]!;
    const hasFeeback = Math.random() < DECISIONS_WITH_FEEDBACK_PERCENT / 100;

    await db.insert(decisions).values({
      id: generateUUID('hhhhhhhh', i),
      blockId,
      blockExecutionId: blockExecId,
      input: getBlockInput(blockId),
      output: getBlockOutput(blockId),
      reasoning: 'AI reasoning explanation for this decision.',
      model: getBlockModel(blockId),
      tokensInput: randomInt(100, 500),
      tokensOutput: randomInt(50, 300),
      latencyMs: randomInt(200, 2000),
      cost: (randomInt(1, 50) / 10000).toFixed(6),
      feedbackCorrect: hasFeeback ? Math.random() > 0.3 : null,
      feedbackCategory: hasFeeback ? randomItem([...FEEDBACK_CATEGORIES]) : null,
      feedbackNotes: hasFeeback ? 'Demo feedback note' : null,
      feedbackAt: hasFeeback ? randomDate(1, 30) : null,
      createdAt: randomDate(1, 60),
    });

    decisionCount++;
  }

  console.log(`   ✅ Created ${decisionCount} decisions\n`);

  // ============================================================================
  // 9. Create Patterns
  // ============================================================================

  console.log('9️⃣  Creating patterns...');

  const patternData = [
    {
      blockId: DEMO_BLOCKS.sentimentAnalyzer.id,
      rule: 'If text contains "love", "amazing", "excellent" → positive sentiment',
      condition: { or: [{ contains: ['text', 'love'] }, { contains: ['text', 'amazing'] }, { contains: ['text', 'excellent'] }] },
      patternType: 'set_membership',
      confidence: '0.92',
    },
    {
      blockId: DEMO_BLOCKS.sentimentAnalyzer.id,
      rule: 'If text contains "terrible", "awful", "worst" → negative sentiment',
      condition: { or: [{ contains: ['text', 'terrible'] }, { contains: ['text', 'awful'] }, { contains: ['text', 'worst'] }] },
      patternType: 'set_membership',
      confidence: '0.89',
    },
    {
      blockId: DEMO_BLOCKS.customerSupportBot.id,
      rule: 'If message mentions "refund" or "money back" → billing category',
      condition: { or: [{ contains: ['message', 'refund'] }, { contains: ['message', 'money back'] }] },
      patternType: 'set_membership',
      confidence: '0.95',
    },
    {
      blockId: DEMO_BLOCKS.customerSupportBot.id,
      rule: 'If message mentions "crash", "error", "bug" → technical category',
      condition: { or: [{ contains: ['message', 'crash'] }, { contains: ['message', 'error'] }, { contains: ['message', 'bug'] }] },
      patternType: 'set_membership',
      confidence: '0.91',
    },
    {
      blockId: DEMO_BLOCKS.mathSolver.id,
      rule: 'Simple addition problems can be solved directly',
      condition: { matches: ['problem', '^\\d+\\s*\\+\\s*\\d+$'] },
      patternType: 'threshold',
      confidence: '0.99',
    },
  ];

  for (let i = 0; i < patternData.length; i++) {
    const pattern = patternData[i]!;
    await db.insert(patterns).values({
      id: generateUUID('iiiiiiii', i),
      ...pattern,
      outputTemplate: SAMPLE_OUTPUTS.sentimentPositive,
      supportCount: randomInt(10, 50),
      samples: [],
    });
  }

  console.log(`   ✅ Created ${patternData.length} patterns\n`);

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Seed completed successfully!\n');
  console.log('Summary:');
  console.log(`  • Workspace: ${workspace.name}`);
  console.log(`  • Connections: ${connectionValues.length}`);
  console.log(`  • Tools: ${toolValues.length}`);
  console.log(`  • Blocks: ${blockValues.length}`);
  console.log(`  • Flows: ${flowValues.length}`);
  console.log(`  • API Keys: ${apiKeyData.length}`);
  console.log(`  • Flow Executions: ${executionCount}`);
  console.log(`  • Block Executions: ${blockExecutionCount}`);
  console.log(`  • Decisions: ${decisionCount}`);
  console.log(`  • Patterns: ${patternData.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
  };
}

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

async function cleanupDemoData() {
  // Delete workspace cascades to all related data
  await db.delete(workspaces).where(eq(workspaces.slug, DEMO_WORKSPACE.slug));
  console.log('   ✅ Cleaned up existing demo data\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getFlowInput(flowId: string): object {
  switch (flowId) {
    case DEMO_FLOWS.sentimentPipeline.id:
      return randomItem(SAMPLE_INPUTS.sentiment);
    case DEMO_FLOWS.customerSupportRouter.id:
      return randomItem(SAMPLE_INPUTS.support);
    case DEMO_FLOWS.mathSolverPipeline.id:
      return randomItem(SAMPLE_INPUTS.math);
    case DEMO_FLOWS.parallelAnalyzer.id:
      return { text: randomItem(SAMPLE_INPUTS.sentiment).text, query: randomItem(SAMPLE_INPUTS.products).query };
    default:
      return { data: 'test' };
  }
}

function getFlowOutput(flowId: string): object {
  switch (flowId) {
    case DEMO_FLOWS.sentimentPipeline.id:
      return { success: true, data: randomItem([SAMPLE_OUTPUTS.sentimentPositive, SAMPLE_OUTPUTS.sentimentNegative, SAMPLE_OUTPUTS.sentimentNeutral]) };
    case DEMO_FLOWS.customerSupportRouter.id:
      return { success: true, data: randomItem([SAMPLE_OUTPUTS.supportBilling, SAMPLE_OUTPUTS.supportTechnical, SAMPLE_OUTPUTS.supportGeneral]) };
    case DEMO_FLOWS.mathSolverPipeline.id:
      return { success: true, data: SAMPLE_OUTPUTS.mathResult };
    default:
      return { success: true, data: {} };
  }
}

function getBlockInput(blockId: string): object {
  switch (blockId) {
    case DEMO_BLOCKS.sentimentAnalyzer.id:
      return randomItem(SAMPLE_INPUTS.sentiment);
    case DEMO_BLOCKS.customerSupportBot.id:
      return randomItem(SAMPLE_INPUTS.support);
    case DEMO_BLOCKS.mathSolver.id:
      return randomItem(SAMPLE_INPUTS.math);
    case DEMO_BLOCKS.weatherAssistant.id:
      return randomItem(SAMPLE_INPUTS.weather);
    case DEMO_BLOCKS.productRecommender.id:
      return randomItem(SAMPLE_INPUTS.products);
    default:
      return { data: 'test' };
  }
}

function getBlockOutput(blockId: string): object {
  switch (blockId) {
    case DEMO_BLOCKS.sentimentAnalyzer.id:
      return randomItem([SAMPLE_OUTPUTS.sentimentPositive, SAMPLE_OUTPUTS.sentimentNegative, SAMPLE_OUTPUTS.sentimentNeutral]);
    case DEMO_BLOCKS.customerSupportBot.id:
      return randomItem([SAMPLE_OUTPUTS.supportBilling, SAMPLE_OUTPUTS.supportTechnical, SAMPLE_OUTPUTS.supportGeneral]);
    case DEMO_BLOCKS.mathSolver.id:
      return SAMPLE_OUTPUTS.mathResult;
    case DEMO_BLOCKS.jsonFormatter.id:
    case DEMO_BLOCKS.dataValidator.id:
    case DEMO_BLOCKS.responseWrapper.id:
      return { success: true, processed: true };
    default:
      return { result: 'ok' };
  }
}

function getBlockModel(blockId: string): string | null {
  switch (blockId) {
    case DEMO_BLOCKS.sentimentAnalyzer.id:
    case DEMO_BLOCKS.mathSolver.id:
    case DEMO_BLOCKS.weatherAssistant.id:
      return 'gpt-4o-mini';
    case DEMO_BLOCKS.customerSupportBot.id:
    case DEMO_BLOCKS.productRecommender.id:
      return 'gpt-4o';
    default:
      return null;
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

// Only run if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const ownerId = process.argv[2] || 'demo_user';

  seedDemoWorkspace(ownerId)
    .then((result) => {
      console.log('To test the demo workspace:');
      console.log(`  1. Start the dev server: pnpm dev`);
      console.log(`  2. Sign in with Clerk`);
      console.log(`  3. Navigate to: /dashboard?workspace=${result.workspaceSlug}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
