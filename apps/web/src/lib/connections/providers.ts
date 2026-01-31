/**
 * Provider definitions for AI connections.
 * Supports OpenAI, Anthropic, and Ollama.
 */

export type ProviderType = 'openai' | 'anthropic' | 'ollama';

export interface ProviderDefinition {
  type: ProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  configFields: {
    name: string;
    label: string;
    type: 'text' | 'password' | 'url';
    required: boolean;
    placeholder?: string;
    defaultValue?: string;
  }[];
}

export const PROVIDERS: Record<ProviderType, ProviderDefinition> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    description: 'Connect to OpenAI API for GPT-4, GPT-3.5, and other models',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    configFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-...',
      },
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        required: false,
        placeholder: 'https://api.openai.com/v1',
        defaultValue: 'https://api.openai.com/v1',
      },
      {
        name: 'organization',
        label: 'Organization ID',
        type: 'text',
        required: false,
        placeholder: 'org-...',
      },
    ],
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    description: 'Connect to Anthropic API for Claude models',
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    configFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'sk-ant-...',
      },
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        required: false,
        placeholder: 'https://api.anthropic.com/v1',
        defaultValue: 'https://api.anthropic.com/v1',
      },
    ],
  },
  ollama: {
    type: 'ollama',
    name: 'Ollama',
    description: 'Connect to local Ollama instance for open-source models',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:11434',
    configFields: [
      {
        name: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        required: true,
        placeholder: 'http://localhost:11434',
        defaultValue: 'http://localhost:11434',
      },
    ],
  },
};

export interface ConnectionConfig {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: {
    models?: string[];
    error?: string;
  };
}
