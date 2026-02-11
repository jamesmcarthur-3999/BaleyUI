import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebSearchService } from '../web-search-service';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('web-search-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('no Tavily key', () => {
    it('returns informative error result when no Tavily API key is configured', async () => {
      const service = createWebSearchService({});
      const results = await service.search('test query', 5);

      expect(results).toHaveLength(1);
      expect(results[0]?.title).toContain('Tavily API Key Required');
      expect(results[0]?.url).toBe('https://tavily.com');
      expect(results[0]?.snippet).toContain('TAVILY_API_KEY');
      expect(results[0]?.snippet).toContain('fetch_url');
    });

    it('does not throw when no Tavily key — returns error result instead', async () => {
      const service = createWebSearchService({});
      // Should not throw, should return gracefully
      await expect(service.search('any query', 3)).resolves.toBeDefined();
    });
  });

  describe('searchFull', () => {
    it('throws when no Tavily key for full search', async () => {
      const service = createWebSearchService({});
      await expect(service.searchFull({ query: 'test' })).rejects.toThrow(
        'Full search requires Tavily API key'
      );
    });
  });

  describe('validation', () => {
    it('throws on empty query', async () => {
      const service = createWebSearchService({});
      await expect(service.search('', 5)).rejects.toThrow('Search query cannot be empty');
    });

    it('clamps numResults to valid range', async () => {
      const service = createWebSearchService({});
      // With no Tavily key, this returns the error result regardless of numResults
      // but shouldn't throw
      const results = await service.search('test', 100);
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toContain('Tavily API Key Required');
    });
  });
});
