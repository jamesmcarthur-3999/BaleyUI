/**
 * LLM Connections
 *
 * Provider integration and connection testing.
 */

// Ollama utilities
export {
  listOllamaModels,
  pullOllamaModel,
  deleteOllamaModel,
  getOllamaModelInfo,
  formatBytes,
} from './ollama';

// Provider definitions
export {
  PROVIDERS,
  type ProviderType,
  type ProviderDefinition,
  type ConnectionConfig,
  type OllamaModel,
  type OllamaModelsResponse,
  type TestConnectionResult,
} from './providers';

// Connection testing
export {
  testOpenAIConnection,
  testAnthropicConnection,
  testOllamaConnection,
  testConnection,
} from './test';
