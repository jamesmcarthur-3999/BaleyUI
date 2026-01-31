/**
 * Cost calculation utilities for AI model usage.
 * Prices are approximate and based on current pricing as of 2025.
 */

interface ModelPricing {
  inputCostPer1K: number;
  outputCostPer1K: number;
}

/**
 * Model pricing table (cost per 1K tokens)
 * Updated to reflect 2025 pricing
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-4o': {
    inputCostPer1K: 0.0025,
    outputCostPer1K: 0.01,
  },
  'gpt-4o-mini': {
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
  },
  'gpt-4-turbo': {
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
  },
  'gpt-4': {
    inputCostPer1K: 0.03,
    outputCostPer1K: 0.06,
  },
  'gpt-3.5-turbo': {
    inputCostPer1K: 0.0005,
    outputCostPer1K: 0.0015,
  },

  // Anthropic models
  'claude-3-5-sonnet-20241022': {
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
  },
  'claude-3-5-sonnet': {
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
  },
  'claude-3-opus-20240229': {
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
  },
  'claude-3-opus': {
    inputCostPer1K: 0.015,
    outputCostPer1K: 0.075,
  },
  'claude-3-sonnet-20240229': {
    inputCostPer1K: 0.003,
    outputCostPer1K: 0.015,
  },
  'claude-3-haiku-20240307': {
    inputCostPer1K: 0.00025,
    outputCostPer1K: 0.00125,
  },
};

/**
 * Calculate the cost of an AI model invocation.
 *
 * @param model - The model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns The total cost in USD
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Handle local models (Ollama)
  if (model.startsWith('ollama/')) {
    return 0;
  }

  // Get pricing for the model
  let pricing = MODEL_PRICING[model];

  // If exact model not found, try to match by prefix
  if (!pricing) {
    const modelKey = Object.keys(MODEL_PRICING).find((key) =>
      model.toLowerCase().includes(key.toLowerCase())
    );
    if (modelKey) {
      pricing = MODEL_PRICING[modelKey];
    }
  }

  // If still no pricing found, use a conservative default (GPT-4 pricing)
  if (!pricing) {
    pricing = {
      inputCostPer1K: 0.03,
      outputCostPer1K: 0.06,
    };
  }

  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1K;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1K;

  return inputCost + outputCost;
}

/**
 * Format a cost value for display.
 *
 * @param cost - Cost in USD
 * @param decimals - Number of decimal places (default: 4)
 * @returns Formatted cost string
 * @deprecated Use formatCost from '@/lib/format' instead for consistent formatting
 */
export function formatCost(cost: number, decimals: number = 4): string {
  return `$${cost.toFixed(decimals)}`;
}

/**
 * Get the pricing info for a model.
 *
 * @param model - The model identifier
 * @returns Pricing info or null if not found
 */
export function getModelPricing(model: string): ModelPricing | null {
  if (model.startsWith('ollama/')) {
    return {
      inputCostPer1K: 0,
      outputCostPer1K: 0,
    };
  }

  return MODEL_PRICING[model] || null;
}

/**
 * Get a list of all supported models with pricing.
 */
export function getAllModelPricing(): Record<string, ModelPricing> {
  return MODEL_PRICING;
}
