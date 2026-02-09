import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWebSearchService } from '../web-search-service';

vi.mock('../../internal-bb/runner', () => ({
  runWebSearchFallback: vi.fn().mockResolvedValue({
    results: [
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
      const { runWebSearchFallback } = await import('../../internal-bb/runner');

      const service = createWebSearchService({});
      await service.search('test query', 5);

      expect(runWebSearchFallback).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          triggeredBy: 'internal',
        })
      );
    });

    it('passes query and numResults in input', async () => {
      const { runWebSearchFallback } = await import('../../internal-bb/runner');

      const service = createWebSearchService({});
      await service.search('best restaurants', 3);

      expect(runWebSearchFallback).toHaveBeenCalledWith(
        expect.stringContaining('best restaurants'),
        expect.any(Object)
      );
      expect(runWebSearchFallback).toHaveBeenCalledWith(
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

    it('passes user workspace to internal fallback', async () => {
      const { runWebSearchFallback } = await import('../../internal-bb/runner');

      const service = createWebSearchService({});
      await service.search('workspace scoped query', 4, {
        workspaceId: 'ws-user-123',
      });

      expect(runWebSearchFallback).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          triggeredBy: 'internal',
          userWorkspaceId: 'ws-user-123',
        })
      );
    });

    it('handles failed AI search gracefully', async () => {
      const { runWebSearchFallback } = await import('../../internal-bb/runner');
      vi.mocked(runWebSearchFallback).mockRejectedValueOnce(new Error('AI failed'));

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
      const { runWebSearchFallback } = await import('../../internal-bb/runner');

      const service = createWebSearchService({});
      await service.search('test', 100);

      // Should be clamped to 20 max
      expect(runWebSearchFallback).toHaveBeenCalledWith(
        expect.stringContaining('20'),
        expect.any(Object)
      );
    });
  });
});
