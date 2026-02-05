/**
 * Web Search Service
 *
 * Wraps @baleybots/tools webSearchTool with BaleyUI-specific AI fallback.
 * When Tavily API key is not configured, falls back to internal BaleyBot.
 */

import { webSearchTool } from '@baleybots/tools';
import type { WebSearchParams, WebSearchResponse } from '@baleybots/tools';
import { executeInternalBaleybot } from '../internal-baleybots';
import { createLogger, extractErrorMessage } from '@/lib/logger';

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
  search(query: string, numResults?: number): Promise<SearchResult[]>;

  /**
   * Full search exposing all @baleybots/tools features
   */
  searchFull(params: WebSearchParams): Promise<WebSearchResponse>;
}

// ============================================================================
// AI FALLBACK IMPLEMENTATION
// ============================================================================

/**
 * Uses the internal web_search_fallback BaleyBot to perform searches.
 * This is a fallback when no Tavily API key is configured.
 */
async function searchWithAI(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  try {
    const input = `Search the web for: ${query}

Return ${numResults} relevant search results as a JSON array.
Each result should have: title, url, snippet.`;

    const { output } = await executeInternalBaleybot('web_search_fallback', input, {
      triggeredBy: 'internal',
    });

    // Parse the result
    if (Array.isArray(output)) {
      // Already parsed as array
      return output.slice(0, numResults).map((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return {
          title: String(obj.title || ''),
          url: String(obj.url || ''),
          snippet: String(obj.snippet || ''),
        };
      });
    }

    // Handle string or other result types
    const text = typeof output === 'string' ? output.trim() : String(output);

    // Handle code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1]?.trim() : text;

    if (!jsonStr) {
      throw new Error('No JSON content found in AI response');
    }

    const parsed = JSON.parse(jsonStr) as Array<{
      title: string;
      url: string;
      snippet: string;
    }>;

    // Validate and normalize results
    return parsed.slice(0, numResults).map((item) => ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      snippet: String(item.snippet || ''),
    }));
  } catch (error) {
    // If AI search fails, return an informative result
    const message = extractErrorMessage(error);
    logger.error('AI fallback failed', { message });

    return [
      {
        title: 'Web Search Unavailable',
        url: 'https://tavily.com',
        snippet: `Web search is currently unavailable. To enable web search, add a Tavily API key in your workspace settings. Error: ${message}`,
      },
    ];
  }
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
  async search(query: string, numResults: number = 5): Promise<SearchResult[]> {
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

        // Auth error -> fall back to AI
        if (
          message.includes('401') ||
          message.includes('API key') ||
          message.includes('Unauthorized') ||
          message.includes('Invalid Tavily')
        ) {
          logger.warn('Tavily auth failed, falling back to AI search');
          return searchWithAI(query, sanitizedNumResults);
        }

        throw error;
      }
    }

    // No Tavily key -> use AI fallback
    return searchWithAI(query, sanitizedNumResults);
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
