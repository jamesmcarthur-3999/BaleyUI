/**
 * Connection testing utilities.
 * Tests connectivity to AI providers.
 */

import { AIConnectionConfig, TestConnectionResult, OllamaModelsResponse } from './providers';

/**
 * Test OpenAI connection by fetching available models.
 */
export async function testOpenAIConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}/models`;

    const headers: HeadersInit = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (config.organization) {
      headers['OpenAI-Organization'] = config.organization;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        message: `Failed to connect to OpenAI: ${response.status} ${response.statusText}`,
        details: { error },
      };
    }

    const data = await response.json();
    const modelCount = data.data?.length || 0;

    return {
      success: true,
      message: `Successfully connected to OpenAI. Found ${modelCount} models.`,
      details: {
        models: data.data?.slice(0, 5).map((m: any) => m.id) || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test Anthropic connection by making a minimal API request.
 */
export async function testAnthropicConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    const url = `${baseUrl}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      // Check for authentication errors
      if (response.status === 401) {
        return {
          success: false,
          message: 'Invalid API key',
          details: { error },
        };
      }

      return {
        success: false,
        message: `Failed to connect to Anthropic: ${response.status} ${response.statusText}`,
        details: { error },
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Anthropic.',
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test Ollama connection by fetching local models.
 */
export async function testOllamaConnection(
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  try {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const url = `${baseUrl}/api/tags`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Failed to connect to Ollama: ${response.status} ${response.statusText}`,
        details: { error: await response.text() },
      };
    }

    const data: OllamaModelsResponse = await response.json();
    const modelCount = data.models?.length || 0;

    return {
      success: true,
      message: `Successfully connected to Ollama. Found ${modelCount} local models.`,
      details: {
        models: data.models?.map((m) => m.name) || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { error: String(error) },
    };
  }
}

/**
 * Test a connection based on provider type.
 */
export async function testConnection(
  type: string,
  config: AIConnectionConfig
): Promise<TestConnectionResult> {
  switch (type) {
    case 'openai':
      return testOpenAIConnection(config);
    case 'anthropic':
      return testAnthropicConnection(config);
    case 'ollama':
      return testOllamaConnection(config);
    default:
      return {
        success: false,
        message: `Unknown provider type: ${type}`,
      };
  }
}
