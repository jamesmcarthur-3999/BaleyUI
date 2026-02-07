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
  isAIProvider,
  isDatabaseProvider,
  type ProviderType,
  type AIProviderType,
  type DatabaseProviderType,
  type ProviderDefinition,
  type AIConnectionConfig,
  type DatabaseConnectionConfig,
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
  testPostgresConnection,
  testMySQLConnection,
  testConnection,
} from './test';
