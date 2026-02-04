/**
 * Model Configuration
 *
 * Centralized configuration for AI model providers and models.
 * This replaces hardcoded model strings throughout the codebase.
 */

// ============================================================================
// PROVIDER TYPES
// ============================================================================

export type ProviderType = 'openai' | 'anthropic' | 'ollama';

export interface ModelInfo {
  id: string;
  name: string;
  tier: 'fast' | 'balanced' | 'powerful';
  contextWindow?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}

// ============================================================================
// DEFAULT MODELS BY PROVIDER
// ============================================================================

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  openai: 'openai:gpt-4o-mini',
  anthropic: 'anthropic:claude-sonnet-4-20250514',
  ollama: 'ollama:llama3.2',
} as const;

// ============================================================================
// AVAILABLE MODELS
// ============================================================================

export const AVAILABLE_MODELS: Record<ProviderType, ModelInfo[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', tier: 'powerful', contextWindow: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'fast', contextWindow: 128000 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tier: 'powerful', contextWindow: 128000 },
    { id: 'gpt-4', name: 'GPT-4', tier: 'powerful', contextWindow: 8192 },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', tier: 'fast', contextWindow: 16385 },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'powerful', contextWindow: 200000 },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', tier: 'fast', contextWindow: 200000 },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', tier: 'balanced', contextWindow: 200000 },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tier: 'powerful', contextWindow: 200000 },
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2', tier: 'balanced' },
    { id: 'llama3.1', name: 'Llama 3.1', tier: 'balanced' },
    { id: 'mistral', name: 'Mistral', tier: 'fast' },
    { id: 'codellama', name: 'Code Llama', tier: 'balanced' },
  ],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the default model for a provider
 */
export function getDefaultModelForProvider(provider: ProviderType): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Get the default model string (with provider prefix)
 */
export function getDefaultModel(): string {
  return DEFAULT_MODELS.openai;
}

/**
 * Detect provider from API key prefix
 */
export function detectProviderFromApiKey(apiKey: string): ProviderType | null {
  if (apiKey.startsWith('sk-ant-')) return 'anthropic';
  if (apiKey.startsWith('sk-')) return 'openai';
  return null;
}

/**
 * Parse a model string into provider and model ID
 */
export function parseModelString(modelString: string): { provider: ProviderType; modelId: string } | null {
  const parts = modelString.split(':');
  if (parts.length !== 2) return null;

  const [provider, modelId] = parts;
  if (!provider || !modelId) return null;

  if (provider === 'openai' || provider === 'anthropic' || provider === 'ollama') {
    return { provider, modelId };
  }

  return null;
}

/**
 * Format a model string from provider and model ID
 */
export function formatModelString(provider: ProviderType, modelId: string): string {
  return `${provider}:${modelId}`;
}

/**
 * Get model info by ID
 */
export function getModelInfo(provider: ProviderType, modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS[provider].find((m) => m.id === modelId);
}

/**
 * Get all models for a provider
 */
export function getModelsForProvider(provider: ProviderType): ModelInfo[] {
  return AVAILABLE_MODELS[provider];
}

/**
 * Check if a model is valid
 */
export function isValidModel(modelString: string): boolean {
  const parsed = parseModelString(modelString);
  if (!parsed) return false;

  const { provider, modelId } = parsed;
  return AVAILABLE_MODELS[provider].some((m) => m.id === modelId);
}

/**
 * Get fast models for a provider (for quick tasks)
 */
export function getFastModels(provider: ProviderType): ModelInfo[] {
  return AVAILABLE_MODELS[provider].filter((m) => m.tier === 'fast');
}

/**
 * Get powerful models for a provider (for complex tasks)
 */
export function getPowerfulModels(provider: ProviderType): ModelInfo[] {
  return AVAILABLE_MODELS[provider].filter((m) => m.tier === 'powerful');
}
