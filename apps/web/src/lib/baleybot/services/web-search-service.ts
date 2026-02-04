/**
 * Web Search Service
 *
 * Provides web search capability with multiple backends:
 * 1. Tavily API (primary) - if API key is configured
 * 2. AI Model fallback - uses internal web_search_fallback BaleyBot if no API key
 *
 * The service is designed to be injected into the web_search built-in tool.
 */

import { executeInternalBaleybot } from '../internal-baleybots';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchConfig {
  tavilyApiKey?: string;
}

export interface WebSearchService {
  search(query: string, numResults: number): Promise<SearchResult[]>;
}

// ============================================================================
// TAVILY IMPLEMENTATION
// ============================================================================

interface TavilySearchResponse {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  answer?: string;
  query: string;
}

async function searchWithTavily(
  apiKey: string,
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: numResults,
      include_answer: false,
      include_raw_content: false,
      search_depth: 'basic',
    }),
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid Tavily API key. Please check your API key in workspace settings.');
    }
    if (response.status === 429) {
      throw new Error('Tavily rate limit exceeded. Please try again later.');
    }
    throw new Error(`Tavily search failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as TavilySearchResponse;

  return data.results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content.length > 500
      ? result.content.substring(0, 500) + '...'
      : result.content,
  }));
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[web_search] AI fallback failed:', message);

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
// SERVICE FACTORY
// ============================================================================

/**
 * Create a web search service instance.
 *
 * @param config - Configuration including optional Tavily API key
 * @returns WebSearchService instance
 */
export function createWebSearchService(config: WebSearchConfig): WebSearchService {
  return {
    async search(query: string, numResults: number): Promise<SearchResult[]> {
      // Validate inputs
      if (!query || query.trim().length === 0) {
        throw new Error('Search query cannot be empty');
      }

      const sanitizedNumResults = Math.max(1, Math.min(numResults, 20));

      // Use Tavily if API key is available
      if (config.tavilyApiKey && config.tavilyApiKey.trim().length > 0) {
        try {
          return await searchWithTavily(
            config.tavilyApiKey,
            query,
            sanitizedNumResults
          );
        } catch (error) {
          // If Tavily fails with auth error, fall back to AI
          // But if it's a rate limit or other error, let it propagate
          const message = error instanceof Error ? error.message : '';
          if (message.includes('Invalid Tavily API key')) {
            console.warn('[web_search] Tavily auth failed, falling back to AI search');
            return searchWithAI(query, sanitizedNumResults);
          }
          throw error;
        }
      }

      // Fall back to AI search
      return searchWithAI(query, sanitizedNumResults);
    },
  };
}
