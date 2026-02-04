import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNLToSQLService, createSQLGenerator } from '../nl-to-sql-service';

vi.mock('../../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn().mockResolvedValue({
    output: {
      sql: 'SELECT id, name FROM users WHERE active = true LIMIT 100',
    },
    executionId: 'exec-123',
  }),
}));

describe('nl-to-sql-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses internal BaleyBot for postgres translation', async () => {
    const { executeInternalBaleybot } = await import('../../internal-baleybots');

    const service = createNLToSQLService({ databaseType: 'postgres' });
    await service.translate('Get all active users', 'CREATE TABLE users (id int, name text, active boolean)');

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'nl_to_sql_postgres',
      expect.any(String),
      expect.objectContaining({
        triggeredBy: 'internal',
      })
    );
  });

  it('uses internal BaleyBot for mysql translation', async () => {
    const { executeInternalBaleybot } = await import('../../internal-baleybots');

    const service = createNLToSQLService({ databaseType: 'mysql' });
    await service.translate('Get all active users', 'CREATE TABLE users (id int, name varchar(255), active tinyint)');

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'nl_to_sql_mysql',
      expect.any(String),
      expect.objectContaining({
        triggeredBy: 'internal',
      })
    );
  });

  it('returns cleaned SQL from output', async () => {
    const service = createNLToSQLService();
    const result = await service.translate('Get active users', 'schema context');

    expect(result).toBe('SELECT id, name FROM users WHERE active = true LIMIT 100');
  });

  it('createSQLGenerator returns a function that uses internal BaleyBot', async () => {
    const { executeInternalBaleybot } = await import('../../internal-baleybots');

    const generator = createSQLGenerator({ databaseType: 'postgres' });
    await generator('Get users', 'schema');

    expect(executeInternalBaleybot).toHaveBeenCalledWith(
      'nl_to_sql_postgres',
      expect.any(String),
      expect.objectContaining({
        triggeredBy: 'internal',
      })
    );
  });
});
