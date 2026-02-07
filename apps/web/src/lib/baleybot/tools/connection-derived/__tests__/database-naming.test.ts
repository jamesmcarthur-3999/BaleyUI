/**
 * Database Tool Naming Tests
 *
 * Verifies that database tool definitions produce the canonical
 * `query_{type}_{sanitizedName}` format expected by the scanner,
 * readiness checks, visual editor, AI instructions, and execution logger.
 */

import { describe, it, expect } from 'vitest';
import {
  generateDatabaseToolDefinition,
  sanitizeConnectionName,
  type DatabaseToolConfig,
} from '../database';

function makeConfig(
  overrides: Partial<DatabaseToolConfig['connection']> = {}
): DatabaseToolConfig {
  return {
    connection: {
      connectionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      connectionName: 'My DB',
      type: 'postgres',
      schema: { tables: [], introspectedAt: new Date() },
      ...overrides,
    },
  };
}

describe('sanitizeConnectionName', () => {
  it('lowercases and replaces non-alphanumeric chars with underscores', () => {
    expect(sanitizeConnectionName('My Production DB!')).toBe(
      'my_production_db'
    );
  });

  it('collapses consecutive underscores', () => {
    expect(sanitizeConnectionName('a---b___c')).toBe('a_b_c');
  });

  it('strips leading and trailing underscores', () => {
    expect(sanitizeConnectionName('__hello__')).toBe('hello');
  });

  it('handles simple lowercase names unchanged', () => {
    expect(sanitizeConnectionName('analytics')).toBe('analytics');
  });

  it('handles names with spaces and special characters', () => {
    expect(sanitizeConnectionName('My DB (prod)')).toBe('my_db_prod');
  });
});

describe('generateDatabaseToolDefinition', () => {
  it('produces query_{type}_{name} for postgres', () => {
    const def = generateDatabaseToolDefinition(makeConfig());
    expect(def.name).toBe('query_postgres_my_db');
  });

  it('produces query_{type}_{name} for mysql', () => {
    const def = generateDatabaseToolDefinition(
      makeConfig({ type: 'mysql', connectionName: 'Analytics' })
    );
    expect(def.name).toBe('query_mysql_analytics');
  });

  it('sanitizes special characters in connection name', () => {
    const def = generateDatabaseToolDefinition(
      makeConfig({ connectionName: 'Prod DB (v2)' })
    );
    expect(def.name).toBe('query_postgres_prod_db_v2');
  });

  it('does NOT use connection ID in the name', () => {
    const def = generateDatabaseToolDefinition(makeConfig());
    expect(def.name).not.toContain('aaaaaaaa');
    expect(def.name).not.toMatch(/database_/);
  });

  it('matches the pattern expected by requirements-scanner', () => {
    const def = generateDatabaseToolDefinition(makeConfig());
    // Scanner checks: tool.startsWith('query_postgres_') || tool.startsWith('query_mysql_')
    expect(
      def.name.startsWith('query_postgres_') ||
        def.name.startsWith('query_mysql_')
    ).toBe(true);
  });
});
