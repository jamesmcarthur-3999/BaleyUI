/**
 * Ollama-specific utilities for managing local models.
 */

import { OllamaModelsResponse, OllamaModel } from './providers';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ollama');

/**
 * List all available models in the local Ollama instance.
 */
export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const url = `${baseUrl}/api/tags`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const data: OllamaModelsResponse = await response.json();
    return data.models || [];
  } catch (error) {
    logger.error('Failed to list Ollama models', error);
    throw error;
  }
}

/**
 * Pull a model from the Ollama library.
 * This is a streaming operation that can take a while.
 */
export async function pullOllamaModel(
  baseUrl: string,
  modelName: string,
  onProgress?: (progress: { status: string; completed?: number; total?: number }) => void
): Promise<void> {
  try {
    const url = `${baseUrl}/api/pull`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.statusText}`);
    }

    // Ollama returns a streaming response with progress updates
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (value) {
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const progress = JSON.parse(line);
            onProgress?.(progress);
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to pull Ollama model', error);
    throw error;
  }
}

/**
 * Delete a model from the local Ollama instance.
 */
export async function deleteOllamaModel(
  baseUrl: string,
  modelName: string
): Promise<void> {
  try {
    const url = `${baseUrl}/api/delete`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete model: ${response.statusText}`);
    }
  } catch (error) {
    logger.error('Failed to delete Ollama model', error);
    throw error;
  }
}

/**
 * Get information about a specific model.
 */
export async function getOllamaModelInfo(
  baseUrl: string,
  modelName: string
): Promise<unknown> {
  try {
    const url = `${baseUrl}/api/show`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: modelName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get model info: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to get Ollama model info', error);
    throw error;
  }
}

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
