/**
 * Model Registry — DB-backed model resolution
 *
 * Source of truth for model data is the `aiModels` table.
 * Falls back to AVAILABLE_MODELS from config.ts when DB is unavailable.
 */

import { db, aiModels, connections, eq, and, isNull, or, notDeleted } from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { AVAILABLE_MODELS, parseModelString, type ProviderType, type ModelInfo } from './config';
import { sql } from 'drizzle-orm';

const logger = createLogger('model-registry');

// ============================================================================
// TYPES
// ============================================================================

export interface DBModelInfo {
  id: string;
  modelId: string;
  provider: string;
  displayName: string;
  family: string;
  version: string | null;
  tier: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputCostPer1mTokens: string | null;
  outputCostPer1mTokens: string | null;
  capabilities: Record<string, unknown> | null;
  sdkSupported: boolean;
  isLatest: boolean;
  isDefault: boolean;
  deprecatedAt: Date | null;
  sunsetAt: Date | null;
}

export interface CostInfo {
  inputPer1mTokens: number;
  outputPer1mTokens: number;
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Models the user can actually use — filtered by connected providers.
 * Falls back to static AVAILABLE_MODELS if DB query fails.
 */
export async function getModelsForWorkspace(workspaceId: string): Promise<DBModelInfo[]> {
  try {
    // 1. Get user's connected AI providers
    const connectedProviders = await db.query.connections.findMany({
      where: and(
        eq(connections.workspaceId, workspaceId),
        notDeleted(connections),
        eq(connections.status, 'connected'),
      ),
      columns: { type: true },
    });

    const aiProviderTypes = [...new Set(
      connectedProviders
        .map(c => c.type)
        .filter(t => ['openai', 'anthropic', 'ollama'].includes(t))
    )];

    if (aiProviderTypes.length === 0) {
      return [];
    }

    // 2. Query aiModels for those providers
    const models = await db.query.aiModels.findMany({
      where: and(
        sql`${aiModels.provider} IN (${sql.join(aiProviderTypes.map(p => sql`${p}`), sql`, `)})`,
        eq(aiModels.sdkSupported, true),
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
      orderBy: [aiModels.provider, aiModels.tier],
    });

    return models as DBModelInfo[];
  } catch (err) {
    logger.warn('Failed to query aiModels, falling back to static config', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return fallbackToStatic();
  }
}

/**
 * All non-sunset models for a provider (admin view).
 */
export async function getAvailableModels(provider: ProviderType): Promise<DBModelInfo[]> {
  try {
    const models = await db.query.aiModels.findMany({
      where: and(
        eq(aiModels.provider, provider),
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
      orderBy: [aiModels.tier],
    });
    return models as DBModelInfo[];
  } catch (err) {
    logger.warn('Failed to query available models', { provider, error: err instanceof Error ? err.message : 'Unknown' });
    return [];
  }
}

/**
 * Resolve tier+provider to specific model ID (used by executor fallback).
 */
export async function getDefaultModelForTier(provider: ProviderType, tier: string): Promise<string | null> {
  try {
    const model = await db.query.aiModels.findFirst({
      where: and(
        eq(aiModels.provider, provider),
        eq(aiModels.tier, tier),
        eq(aiModels.isDefault, true),
        eq(aiModels.sdkSupported, true),
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
    });
    return model ? `${model.provider}:${model.modelId}` : null;
  } catch {
    return null;
  }
}

/**
 * Latest model in a family (for deprecation fallback).
 */
export async function getFamilyLatest(family: string): Promise<string | null> {
  try {
    const model = await db.query.aiModels.findFirst({
      where: and(
        eq(aiModels.family, family),
        eq(aiModels.isLatest, true),
        eq(aiModels.sdkSupported, true),
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
    });
    return model ? `${model.provider}:${model.modelId}` : null;
  } catch {
    return null;
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

/**
 * "anthropic:claude-sonnet-4-20250514" → "Sonnet"
 */
export async function resolveDisplayName(modelString: string): Promise<string> {
  const parsed = parseModelString(modelString);
  if (!parsed) return modelString;

  try {
    const model = await db.query.aiModels.findFirst({
      where: eq(aiModels.modelId, parsed.modelId),
      columns: { displayName: true },
    });
    return model?.displayName ?? parsed.modelId;
  } catch {
    // Fallback to static config
    const staticModel = AVAILABLE_MODELS[parsed.provider]?.find(m => m.id === parsed.modelId);
    return staticModel?.name ?? parsed.modelId;
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if model is SDK-supported and not sunset.
 */
export async function isModelAvailable(modelId: string): Promise<boolean> {
  try {
    const model = await db.query.aiModels.findFirst({
      where: and(
        eq(aiModels.modelId, modelId),
        eq(aiModels.sdkSupported, true),
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
      columns: { id: true },
    });
    return !!model;
  } catch {
    return true; // Permissive on DB failure
  }
}

/**
 * Get cost per 1M tokens (for analytics).
 */
export async function getModelCost(modelId: string): Promise<CostInfo | null> {
  try {
    const model = await db.query.aiModels.findFirst({
      where: eq(aiModels.modelId, modelId),
      columns: { inputCostPer1mTokens: true, outputCostPer1mTokens: true },
    });
    if (!model?.inputCostPer1mTokens || !model?.outputCostPer1mTokens) return null;
    return {
      inputPer1mTokens: parseFloat(model.inputCostPer1mTokens),
      outputPer1mTokens: parseFloat(model.outputCostPer1mTokens),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// DEPRECATION CHECKING (BB-driven)
// ============================================================================

/**
 * Scan BBs for deprecated models and create recommendations.
 * Called from seedInternalBaleybots() on startup and can be scheduled.
 */
export async function checkModelDeprecations(workspaceId: string): Promise<void> {
  try {
    const { baleybots, recommendations } = await import('@baleyui/db');

    // 1. Find deprecated but not yet sunset models
    const deprecatedModels = await db.query.aiModels.findMany({
      where: and(
        sql`${aiModels.deprecatedAt} IS NOT NULL`,
        or(
          isNull(aiModels.sunsetAt),
          sql`${aiModels.sunsetAt} > NOW()`
        ),
      ),
    });

    if (deprecatedModels.length === 0) return;

    // 2. For each deprecated model, find BBs that reference it
    for (const model of deprecatedModels) {
      const modelString = `${model.provider}:${model.modelId}`;
      const affectedBBs = await db.query.baleybots.findMany({
        where: and(
          eq(baleybots.workspaceId, workspaceId),
          sql`${baleybots.balCode} LIKE ${'%' + modelString + '%'}`,
          notDeleted(baleybots),
        ),
        columns: { id: true, name: true, balCode: true },
      });

      if (affectedBBs.length === 0) continue;

      // 3. Get replacement model
      const replacement = await getFamilyLatest(model.family);
      const daysUntilSunset = model.sunsetAt
        ? Math.ceil((model.sunsetAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const severity = daysUntilSunset !== null && daysUntilSunset < 14 ? 'critical' : 'warning';

      // 4. Create recommendations for each affected BB
      for (const bb of affectedBBs) {
        const proposedBalCode = replacement
          ? bb.balCode.replace(new RegExp(modelString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
          : null;

        // Check if a recommendation already exists for this model+BB
        const existing = await db.query.recommendations.findFirst({
          where: and(
            eq(recommendations.workspaceId, workspaceId),
            eq(recommendations.targetBaleybotId, bb.id),
            eq(recommendations.sourceType, 'model_health'),
            eq(recommendations.status, 'pending'),
            sql`${recommendations.metadata}->>'deprecatedModel' = ${modelString}`,
          ),
        });
        if (existing) continue;

        await db.insert(recommendations).values({
          workspaceId,
          sourceType: 'model_health',
          targetBaleybotId: bb.id,
          targetType: 'bal_patch',
          title: `Model deprecated: ${model.displayName} → update to latest`,
          description: `The model "${modelString}" used by "${bb.name}" has been deprecated.${
            model.sunsetAt ? ` It will be sunset on ${model.sunsetAt.toISOString().split('T')[0]}.` : ''
          }${replacement ? ` Suggested replacement: ${replacement}` : ''}`,
          severity,
          proposedAction: {
            deprecatedModel: modelString,
            suggestedModel: replacement,
            sunsetDate: model.sunsetAt?.toISOString() ?? null,
            balCodePatch: proposedBalCode,
          },
          metadata: { deprecatedModel: modelString },
        });
      }

      // 5. Send notification for critical deprecations
      if (severity === 'critical' && affectedBBs.length > 0) {
        try {
          const { notifications } = await import('@baleyui/db');
          // Get workspace owner for notification
          const { workspaces } = await import('@baleyui/db');
          const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId),
            columns: { ownerId: true },
          });
          if (workspace?.ownerId) {
            await db.insert(notifications).values({
              workspaceId,
              userId: workspace.ownerId,
              title: `Model sunset in ${daysUntilSunset} days: ${affectedBBs.length} BB${affectedBBs.length > 1 ? 's' : ''} affected`,
              message: `The model "${model.displayName}" (${modelString}) is being sunset. ${affectedBBs.length} BaleyBot${affectedBBs.length > 1 ? 's use' : ' uses'} this model. Review recommended actions.`,
              priority: 'high',
              sourceType: 'system',
            });
          }
        } catch (notifErr) {
          logger.warn('Failed to send deprecation notification', {
            error: notifErr instanceof Error ? notifErr.message : 'Unknown',
          });
        }
      }
    }

    logger.info('Model deprecation check complete', {
      workspaceId,
      deprecatedModelsChecked: deprecatedModels.length,
    });
  } catch (err) {
    logger.warn('Model deprecation check failed (non-fatal)', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

// ============================================================================
// STATIC FALLBACK
// ============================================================================

function fallbackToStatic(): DBModelInfo[] {
  const results: DBModelInfo[] = [];
  for (const [provider, models] of Object.entries(AVAILABLE_MODELS)) {
    for (const model of models) {
      results.push({
        id: `static-${provider}-${model.id}`,
        modelId: model.id,
        provider,
        displayName: model.name,
        family: model.id.split('-')[0] ?? model.id,
        version: null,
        tier: model.tier,
        contextWindow: model.contextWindow ?? null,
        maxOutputTokens: null,
        inputCostPer1mTokens: null,
        outputCostPer1mTokens: null,
        capabilities: null,
        sdkSupported: true,
        isLatest: false,
        isDefault: false,
        deprecatedAt: null,
        sunsetAt: null,
      });
    }
  }
  return results;
}
