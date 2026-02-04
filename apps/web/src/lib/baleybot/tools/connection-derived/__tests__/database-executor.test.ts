/**
 * Database Executor Tests
 *
 * Tests for SQL injection protection and parameterized query handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPostgresExecutor,
  validateSQLQuery,
  SQL_INJECTION_PATTERNS,
} from '../database-executor';

// Mock postgres
vi.mock('postgres', () => {
  const mockSql = Object.assign(
    vi.fn(() => Promise.resolve([])),
    {
      unsafe: vi.fn(() => Promise.resolve([])),
      end: vi.fn(() => Promise.resolve()),
    }
  );
  return {
    default: vi.fn(() => mockSql),
  };
});

describe('PostgresExecutor', () => {
  describe('SQL injection protection', () => {
    it('should export SQL injection patterns', () => {
      expect(SQL_INJECTION_PATTERNS).toBeDefined();
      expect(Array.isArray(SQL_INJECTION_PATTERNS)).toBe(true);
      expect(SQL_INJECTION_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should reject queries with SQL injection patterns', async () => {
      const maliciousQueries = [
        "SELECT * FROM users; DROP TABLE users;--",
        "SELECT * FROM users WHERE id = '1' OR '1'='1'",
        "SELECT * FROM users WHERE name = '' UNION SELECT password FROM credentials--",
        "SELECT * FROM users WHERE id = 1; UPDATE users SET admin = true;--",
        "SELECT * FROM users /* comment */ WHERE 1=1",
        "SELECT * FROM users WHERE id = 1; DELETE FROM users;--",
      ];

      for (const query of maliciousQueries) {
        const result = validateSQLQuery(query);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/injection|unsafe|forbidden|multiple/i);
      }
    });

    it('should allow safe SELECT queries', () => {
      const safeQueries = [
        'SELECT * FROM users WHERE id = 1',
        'SELECT name, email FROM users LIMIT 10',
        'SELECT COUNT(*) FROM orders',
        'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
      ];

      for (const query of safeQueries) {
        const result = validateSQLQuery(query);
        expect(result.safe).toBe(true);
      }
    });

    it('should reject non-SELECT raw queries', () => {
      const nonSelectQueries = [
        'INSERT INTO users (name) VALUES ($1)',
        'UPDATE users SET name = $1 WHERE id = $2',
        'DELETE FROM users WHERE id = $1',
        'DROP TABLE users',
        'TRUNCATE TABLE users',
      ];

      for (const query of nonSelectQueries) {
        const result = validateSQLQuery(query, { allowOnlySelect: true });
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/select|forbidden/i);
      }
    });

    it('should reject queries with multiple statements', () => {
      const multiStatementQueries = [
        'SELECT 1; SELECT 2',
        'SELECT * FROM users; DROP TABLE secrets',
        'BEGIN; SELECT 1; COMMIT;',
      ];

      for (const query of multiStatementQueries) {
        const result = validateSQLQuery(query);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/multiple/i);
      }
    });

    it('should detect UNION injection attempts', () => {
      const unionInjections = [
        "SELECT * FROM users WHERE id = 1 UNION SELECT * FROM passwords",
        "SELECT name FROM products UNION ALL SELECT password FROM users",
      ];

      for (const query of unionInjections) {
        const result = validateSQLQuery(query);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/union|injection|forbidden/i);
      }
    });

    it('should detect comment-based injection attempts', () => {
      const commentInjections = [
        "SELECT * FROM users WHERE id = 1 --",
        "SELECT * FROM users /* admin bypass */ WHERE 1=1",
        "SELECT * FROM users WHERE id = '1'--",
      ];

      for (const query of commentInjections) {
        const result = validateSQLQuery(query);
        expect(result.safe).toBe(false);
        expect(result.reason).toMatch(/comment|injection|forbidden/i);
      }
    });
  });

  describe('parameterized queries', () => {
    let executor: ReturnType<typeof createPostgresExecutor>;
    let mockPostgres: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      // Reset mocks
      vi.clearAllMocks();

      // Get the mock
      const postgres = await import('postgres');
      mockPostgres = vi.mocked(postgres.default);

      executor = createPostgresExecutor({
        host: 'localhost',
        port: 5432,
        database: 'test',
        username: 'test',
        password: 'test',
      });
    });

    afterEach(async () => {
      await executor.close();
    });

    it('should use parameterized queries for user input', async () => {
      const mockSql = mockPostgres.mock.results[0]?.value;

      if (mockSql) {
        mockSql.unsafe.mockResolvedValue([{ id: 'user-123', name: 'Test' }]);

        await executor.queryWithParams(
          'SELECT * FROM users WHERE id = $1',
          ['user-123']
        );

        // Verify unsafe was called with parameters (parameterized query)
        expect(mockSql.unsafe).toHaveBeenCalledWith(
          'SELECT * FROM users WHERE id = $1',
          ['user-123']
        );
      }
    });

    it('should validate raw queries before execution', async () => {
      // This should throw because of SQL injection pattern
      await expect(
        executor.query("SELECT * FROM users; DROP TABLE users;--")
      ).rejects.toThrow(/unsafe|injection|forbidden|multiple/i);
    });
  });
});
