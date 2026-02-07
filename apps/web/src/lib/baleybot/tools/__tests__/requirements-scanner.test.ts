// apps/web/src/lib/baleybot/tools/__tests__/requirements-scanner.test.ts
import { describe, it, expect } from 'vitest';
import { scanToolRequirements, getConnectionSummary } from '../requirements-scanner';

describe('scanToolRequirements', () => {
  it('returns known requirements for built-in tools', () => {
    const result = scanToolRequirements(['web_search', 'store_memory']);
    expect(result).toHaveLength(2);
    expect(result[0]?.connectionType).toBe('none');
    expect(result[1]?.connectionType).toBe('none');
  });

  it('detects postgres connection-derived tools', () => {
    const result = scanToolRequirements(['query_postgres_users']);
    expect(result).toHaveLength(1);
    expect(result[0]?.connectionType).toBe('postgres');
    expect(result[0]?.required).toBe(true);
  });

  it('detects mysql connection-derived tools', () => {
    const result = scanToolRequirements(['query_mysql_orders']);
    expect(result).toHaveLength(1);
    expect(result[0]?.connectionType).toBe('mysql');
  });

  it('returns none for unknown tools', () => {
    const result = scanToolRequirements(['custom_unknown_tool']);
    expect(result).toHaveLength(1);
    expect(result[0]?.connectionType).toBe('none');
  });

  it('handles empty array', () => {
    const result = scanToolRequirements([]);
    expect(result).toHaveLength(0);
  });
});

describe('getConnectionSummary', () => {
  it('reports needsAiProvider as true always', () => {
    const result = getConnectionSummary([]);
    expect(result.needsAiProvider).toBe(true);
    expect(result.totalRequired).toBe(1); // AI provider only
  });

  it('groups tools by connection type', () => {
    const result = getConnectionSummary([
      'query_postgres_users',
      'query_postgres_orders',
      'web_search',
    ]);
    expect(result.required).toHaveLength(1);
    expect(result.required[0]?.connectionType).toBe('postgres');
    expect(result.required[0]?.tools).toEqual(['query_postgres_users', 'query_postgres_orders']);
    expect(result.totalRequired).toBe(2); // postgres + AI
  });

  it('handles multiple connection types', () => {
    const result = getConnectionSummary([
      'query_postgres_users',
      'query_mysql_products',
    ]);
    expect(result.required).toHaveLength(2);
    expect(result.totalRequired).toBe(3); // postgres + mysql + AI
  });
});
