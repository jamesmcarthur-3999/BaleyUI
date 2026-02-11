/**
 * Web Search Service
 *
 * Wraps @baleybots/tools webSearchTool with Tavily API.
 * Tavily API key is required — returns an informative error when not configured.
 */

import { webSearchTool } from '@baleybots/tools';
import type { WebSearchParams, WebSearchResponse } from '@baleybots/tools';
import { createLogger } from '@/lib/logger';

const logger = createLogger('web-search');

// Re-export types from @baleybots/tools
export type { WebSearchParams, WebSearchResponse } from '@baleybots/tools';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified result for backward compatibility
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchServiceConfig {
  tavilyApiKey?: string;
  defaultSearchDepth?: 'basic' | 'advanced';
  defaultMaxResults?: number;
  snippetMaxLength?: number;
}

export interface WebSearchService {
  /**
   * Basic search returning simplified results (backward compatible)
   */
  search(
    query: string,
    numResults?: number,
    options?: { workspaceId?: string }
  ): Promise<SearchResult[]>;

  /**
   * Full search exposing all @baleybots/tools features
   */
  searchFull(params: WebSearchParams): Promise<WebSearchResponse>;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

class WebSearchServiceImpl implements WebSearchService {
  private tavilyTool: ReturnType<typeof webSearchTool> | null = null;
  private snippetMaxLength: number;
  private defaultMaxResults: number;
  private defaultSearchDepth: 'basic' | 'advanced';

  constructor(config: WebSearchServiceConfig = {}) {
    this.snippetMaxLength = config.snippetMaxLength ?? 500;
    this.defaultMaxResults = config.defaultMaxResults ?? 5;
    this.defaultSearchDepth = config.defaultSearchDepth ?? 'basic';

    if (config.tavilyApiKey && config.tavilyApiKey.trim().length > 0) {
      this.tavilyTool = webSearchTool({
        apiKey: config.tavilyApiKey,
        defaultSearchDepth: this.defaultSearchDepth,
        defaultMaxResults: this.defaultMaxResults,
      });
    }
  }

  /**
   * Basic search returning simplified results (backward compatible)
   */
  async search(
    query: string,
    numResults: number = 5,
    options?: { workspaceId?: string }
  ): Promise<SearchResult[]> {
    if (!query?.trim()) {
      throw new Error('Search query cannot be empty');
    }

    const sanitizedNumResults = Math.max(1, Math.min(numResults, 20));

    // Use @baleybots/tools if Tavily key available
    if (this.tavilyTool) {
      try {
        // Call the tool's function directly
        const rawResponse = await this.tavilyTool.function({
          query,
          maxResults: sanitizedNumResults,
        });

        // Handle the response - webSearchTool returns Promise<WebSearchResponse>
        // but TypeScript infers a union type that includes AsyncGenerator
        const response = rawResponse as WebSearchResponse;

        return response.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: this.truncateSnippet(r.content),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Auth error -> return informative error result
        if (
          message.includes('401') ||
          message.includes('API key') ||
          message.includes('Unauthorized') ||
          message.includes('Invalid Tavily')
        ) {
          logger.warn('Tavily auth failed', { message });
          return [{
            title: 'Web Search Unavailable — Invalid Tavily API Key',
            url: 'https://tavily.com',
            snippet: 'The configured Tavily API key is invalid or expired. ' +
              'Check your TAVILY_API_KEY environment variable or workspace connection settings. ' +
              'Get a new key at https://tavily.com. ' +
              'Alternative: use the fetch_url tool to access specific URLs directly.',
          }];
        }

        throw error;
      }
    }

    // No Tavily key -> return informative error (not an exception — let the bot handle it)
    return [{
      title: 'Web Search Unavailable — Tavily API Key Required',
      url: 'https://tavily.com',
      snippet: 'The web_search tool requires a Tavily API key to function. ' +
        'Add TAVILY_API_KEY to your environment or configure a Tavily connection in workspace settings. ' +
        'Sign up for a free key at https://tavily.com. ' +
        'Alternative: use the fetch_url tool to access specific URLs directly.',
    }];
  }

  /**
   * Full search exposing all @baleybots/tools features
   */
  async searchFull(params: WebSearchParams): Promise<WebSearchResponse> {
    if (!this.tavilyTool) {
      throw new Error('Full search requires Tavily API key. Configure TAVILY_API_KEY in workspace settings.');
    }

    // webSearchTool returns Promise<WebSearchResponse> but TypeScript infers
    // a union type that includes AsyncGenerator. Cast to expected type.
    const response = await this.tavilyTool.function(params);
    return response as WebSearchResponse;
  }

  private truncateSnippet(content: string): string {
    if (content.length <= this.snippetMaxLength) return content;
    return content.substring(0, this.snippetMaxLength) + '...';
  }
}

// ============================================================================
// SERVICE FACTORY
// ============================================================================

/**
 * Create a web search service instance.
 *
 * @param config - Configuration including optional Tavily API key
 * @returns WebSearchService instance
 */
export function createWebSearchService(config: WebSearchServiceConfig = {}): WebSearchService {
  return new WebSearchServiceImpl(config);
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: WebSearchService | null = null;

/**
 * Configure the singleton web search service
 */
export function configureWebSearch(config: WebSearchServiceConfig): void {
  instance = new WebSearchServiceImpl(config);
}

/**
 * Get the singleton web search service
 */
export function getWebSearchService(): WebSearchService {
  if (!instance) {
    instance = new WebSearchServiceImpl();
  }
  return instance;
}
