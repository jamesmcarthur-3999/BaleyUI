import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebSearchService } from '../web-search-service';

vi.mock('../../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: [
      {
        title: 'Test Result 1',
        url: 'https://example.com/1',
        snippet: 'This is test result 1',
      },
      {
        title: 'Test Result 2',
        url: 'https://example.com/2',
        snippet: 'This is test result 2',
      },
    ],
    executionId: 'exec-123',
  }),
}));

describe('web-search-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AI fallback', () => {
    it('uses internal BaleyBot when no Tavily API key', async () => {
      const { executeInternalBaleybot } = await import('../../internal-baleybots');

      const service = createWebSearchService({});
      await service.search('test query', 5);

      expect(executeInternalBaleybot).toHaveBeenCalledWith(
        'web_search_fallback',
        expect.any(String),
        expect.objectContaining({
          triggeredBy: 'internal',
        })
      );
    });

    it('passes query and numResults in input', async () => {
      const { executeInternalBaleybot } = await import('../../internal-baleybots');

      const service = createWebSearchService({});
      await service.search('best restaurants', 3);

      expect(executeInternalBaleybot).toHaveBeenCalledWith(
        'web_search_fallback',
        expect.stringContaining('best restaurants'),
        expect.any(Object)
      );
      expect(executeInternalBaleybot).toHaveBeenCalledWith(
        'web_search_fallback',
        expect.stringContaining('3'),
        expect.any(Object)
      );
    });

    it('returns normalized search results', async () => {
      const service = createWebSearchService({});
      const results = await service.search('test', 5);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: 'Test Result 1',
        url: 'https://example.com/1',
        snippet: 'This is test result 1',
      });
    });

    it('handles failed AI search gracefully', async () => {
      const { executeInternalBaleybot } = await import('../../internal-baleybots');
      vi.mocked(executeInternalBaleybot).mockRejectedValueOnce(new Error('AI failed'));

      const service = createWebSearchService({});
      const results = await service.search('test', 5);

      // Should return informative fallback result
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Web Search Unavailable');
      expect(results[0]?.snippet).toContain('AI failed');
    });
  });

  describe('validation', () => {
    it('throws on empty query', async () => {
      const service = createWebSearchService({});
      await expect(service.search('', 5)).rejects.toThrow('Search query cannot be empty');
    });

    it('clamps numResults to valid range', async () => {
      const { executeInternalBaleybot } = await import('../../internal-baleybots');

      const service = createWebSearchService({});
      await service.search('test', 100);

      // Should be clamped to 20 max
      expect(executeInternalBaleybot).toHaveBeenCalledWith(
        'web_search_fallback',
        expect.stringContaining('20'),
        expect.any(Object)
      );
    });
  });
});
