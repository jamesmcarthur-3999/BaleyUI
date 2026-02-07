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

function conn(type: string, status: string = 'connected'): ConnectionData {
  return { id: `c-${type}`, type, name: `My ${type}`, status, isDefault: false };
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
    ])('returns ready for %s', (toolName) => {
      const result = getToolReadinessStatus(toolName, []);
      expect(result.status).toBe('ready');
      expect(result.note).toBeTruthy();
    });

    it('send_notification mentions bell icon', () => {
      const result = getToolReadinessStatus('send_notification', []);
      expect(result.note).toContain('bell');
    });
  });

  describe('database tools', () => {
    it('returns needs-setup for postgres tool without connection', () => {
      const result = getToolReadinessStatus('query_postgres_users', []);
      expect(result.status).toBe('needs-setup');
      expect(result.note).toContain('PostgreSQL');
    });

    it('returns ready for postgres tool with connected postgres', () => {
      const result = getToolReadinessStatus('query_postgres_users', [conn('postgres')]);
      expect(result.status).toBe('ready');
    });

    it('returns needs-setup for postgres tool with errored connection', () => {
      const result = getToolReadinessStatus('query_postgres_users', [conn('postgres', 'error')]);
      expect(result.status).toBe('needs-setup');
    });

    it('returns needs-setup for mysql tool without connection', () => {
      const result = getToolReadinessStatus('query_mysql_orders', []);
      expect(result.status).toBe('needs-setup');
      expect(result.note).toContain('MySQL');
    });

    it('returns ready for mysql tool with connected mysql', () => {
      const result = getToolReadinessStatus('query_mysql_orders', [conn('mysql')]);
      expect(result.status).toBe('ready');
    });

    it('handles query_pg_ prefix', () => {
      const result = getToolReadinessStatus('query_pg_users', [conn('postgres')]);
      expect(result.status).toBe('ready');
    });
  });

  describe('unknown tools', () => {
    it('returns ready for unknown tools', () => {
      const result = getToolReadinessStatus('custom_tool', []);
      expect(result.status).toBe('ready');
      expect(result.note).toBe('Custom tool');
    });
  });
});
