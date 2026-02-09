// apps/web/src/components/creator/__tests__/getToolReadinessStatus.test.ts
import { describe, it, expect } from 'vitest';
import { getToolReadinessStatus } from '../ConnectionsPanel';

type ConnectionData = {
  id: string;
  type: string;
  name: string;
  status: string;
  isDefault: boolean;
};

function conn(
  type: string,
  status: string = 'connected',
  name?: string
): ConnectionData {
  const resolvedName = name ?? `My ${type}`;
  return { id: `c-${type}-${resolvedName}`, type, name: resolvedName, status, isDefault: false };
}

describe('getToolReadinessStatus', () => {
  describe('built-in tools', () => {
    it.each([
      'web_search',
      'fetch_url',
      'spawn_baleybot',
      'send_notification',
      'schedule_task',
      'store_memory',
      'shared_storage',
      'create_agent',
      'create_tool',
    ])('returns verifiable for %s', (toolName) => {
      const result = getToolReadinessStatus(toolName, []);
      expect(result.status).toBe('verifiable');
      expect(result.note).toBeTruthy();
    });

    it('send_notification mentions bell icon', () => {
      const result = getToolReadinessStatus('send_notification', []);
      expect(result.note).toContain('bell');
    });
  });

  describe('database tools', () => {
    it('returns blocked for postgres tool without connection', () => {
      const result = getToolReadinessStatus('query_postgres_users', []);
      expect(result.status).toBe('blocked');
      expect(result.note).toContain('PostgreSQL');
    });

    it('returns verifiable for postgres tool when the exact source is connected', () => {
      const result = getToolReadinessStatus('query_postgres_users', [conn('postgres', 'connected', 'users')]);
      expect(result.status).toBe('verifiable');
    });

    it('returns blocked for postgres tool with errored connection', () => {
      const result = getToolReadinessStatus('query_postgres_users', [conn('postgres', 'error', 'users')]);
      expect(result.status).toBe('blocked');
    });

    it('returns needs-input when postgres exists but does not match tool source name', () => {
      const result = getToolReadinessStatus('query_postgres_users', [conn('postgres', 'connected', 'analytics')]);
      expect(result.status).toBe('needs-input');
    });

    it('returns blocked for mysql tool without connection', () => {
      const result = getToolReadinessStatus('query_mysql_orders', []);
      expect(result.status).toBe('blocked');
      expect(result.note).toContain('MySQL');
    });

    it('returns verifiable for mysql tool when the exact source is connected', () => {
      const result = getToolReadinessStatus('query_mysql_orders', [conn('mysql', 'connected', 'orders')]);
      expect(result.status).toBe('verifiable');
    });

    it('handles query_pg_ prefix', () => {
      const result = getToolReadinessStatus('query_pg_users', [conn('postgres', 'connected', 'users')]);
      expect(result.status).toBe('verifiable');
    });
  });

  describe('unknown tools', () => {
    it('returns verifiable for unknown tools', () => {
      const result = getToolReadinessStatus('custom_tool', []);
      expect(result.status).toBe('verifiable');
      expect(result.note).toBeTruthy();
    });
  });
});
