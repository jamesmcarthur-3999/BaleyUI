// apps/web/src/lib/baleybot/tools/__tests__/requirements-scanner.test.ts
import { describe, it, expect } from 'vitest';
import {
  connectionNameToSlug,
  evaluateToolConnectionBinding,
  getConnectionSummary,
  parseConnectionTool,
  scanToolRequirements,
} from '../requirements-scanner';

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
    expect(result[0]?.connectionSlug).toBe('users');
    expect(result[0]?.required).toBe(true);
  });

  it('detects mysql connection-derived tools', () => {
    const result = scanToolRequirements(['query_mysql_orders']);
    expect(result).toHaveLength(1);
    expect(result[0]?.connectionType).toBe('mysql');
    expect(result[0]?.connectionSlug).toBe('orders');
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

describe('connection-derived tool parsing and binding', () => {
  it('parses connection-derived tool names', () => {
    expect(parseConnectionTool('query_postgres_users')).toEqual({
      connectionType: 'postgres',
      connectionSlug: 'users',
    });
    expect(parseConnectionTool('query_pg_events')).toEqual({
      connectionType: 'postgres',
      connectionSlug: 'events',
    });
    expect(parseConnectionTool('query_mysql_orders')).toEqual({
      connectionType: 'mysql',
      connectionSlug: 'orders',
    });
    expect(parseConnectionTool('custom_tool')).toEqual({
      connectionType: null,
      connectionSlug: undefined,
    });
  });

  it('normalizes connection names to slugs', () => {
    expect(connectionNameToSlug('Users DB')).toBe('users_db');
    expect(connectionNameToSlug('Primary-Postgres!!')).toBe('primary_postgres');
  });

  it('marks binding ready when exact source connection is connected', () => {
    const result = evaluateToolConnectionBinding('query_postgres_users_db', [
      { id: '1', type: 'postgres', name: 'Users DB', status: 'connected' },
    ]);
    expect(result.status).toBe('ready');
    expect(result.matchedConnectionName).toBe('Users DB');
  });

  it('marks binding mismatch when same type exists but exact source is missing', () => {
    const result = evaluateToolConnectionBinding('query_mysql_orders', [
      { id: '1', type: 'mysql', name: 'Analytics', status: 'connected' },
    ]);
    expect(result.status).toBe('mismatch');
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
