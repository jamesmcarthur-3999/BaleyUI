import { describe, it, expect } from 'vitest';
import { getToolLabel, getToolIcon } from '../tool-summaries';

describe('getToolLabel', () => {
  describe('web_search', () => {
    it('shows active label with query', () => {
      expect(getToolLabel('web_search', 'running', { query: 'quantum computing' }))
        .toBe('Searching the web for "quantum computing"');
    });

    it('shows done label with result count', () => {
      expect(getToolLabel('web_search', 'completed', { query: 'test' }, [{}, {}, {}]))
        .toBe('Searched the web for "test" — 3 results');
    });

    it('shows active label without args', () => {
      expect(getToolLabel('web_search', 'running'))
        .toBe('Searching the web');
    });
  });

  describe('fetch_url', () => {
    it('extracts hostname from URL', () => {
      expect(getToolLabel('fetch_url', 'running', { url: 'https://arxiv.org/paper/123' }))
        .toBe('Fetching page arxiv.org');
    });

    it('shows done label', () => {
      expect(getToolLabel('fetch_url', 'completed', { url: 'https://example.com' }))
        .toBe('Fetched page example.com');
    });
  });

  describe('spawn_baleybot', () => {
    it('shows bot name', () => {
      expect(getToolLabel('spawn_baleybot', 'running', { botName: 'data_analyzer' }))
        .toBe('Running bot data_analyzer');
    });
  });

  describe('unknown tool', () => {
    it('formats snake_case to title case with Running prefix', () => {
      expect(getToolLabel('custom_tool_xyz', 'running'))
        .toBe('Running Custom Tool Xyz');
    });

    it('uses Ran prefix when done', () => {
      expect(getToolLabel('custom_tool_xyz', 'completed'))
        .toBe('Ran Custom Tool Xyz');
    });
  });

  describe('error status', () => {
    it('uses done label for failed status', () => {
      expect(getToolLabel('web_search', 'failed', { query: 'test' }))
        .toContain('Searched the web');
    });
  });
});

describe('getToolIcon', () => {
  it('returns specific icon for known tools', () => {
    expect(getToolIcon('web_search')).toBeDefined();
    expect(getToolIcon('fetch_url')).toBeDefined();
  });

  it('returns Wrench for unknown tools', () => {
    const icon = getToolIcon('unknown_tool');
    expect(icon).toBeDefined();
  });
});
