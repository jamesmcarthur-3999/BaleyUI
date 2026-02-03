/**
 * Database Query Executor
 *
 * Executes SQL queries against connected PostgreSQL and MySQL databases.
 * Manages connection pools and provides unified interface for query execution.
 */

import postgres from 'postgres';
import type { DatabaseConnectionConfig } from '@/lib/connections/providers';

// ============================================================================
// TYPES
// ============================================================================

export interface DatabaseExecutor {
  /** Execute a SQL query and return results */
  query<T extends Record<string, unknown>>(sql: string): Promise<T[]>;
  /** Execute a SQL query with parameters */
  queryWithParams<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[]
  ): Promise<T[]>;
  /** Close the connection */
  close(): Promise<void>;
  /** Test the connection */
  ping(): Promise<boolean>;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  schema?: string;
}

export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface ExecutorOptions {
  /** Maximum query execution time in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum rows to return (default: 10000) */
  maxRows?: number;
  /** Whether to enable query logging (default: false) */
  debug?: boolean;
}

// ============================================================================
// CONNECTION POOLS
// ============================================================================

// Cache for connection pools to avoid creating multiple connections
const connectionPools = new Map<string, postgres.Sql>();

/**
 * Generate a unique key for a connection configuration
 */
function getConnectionKey(type: string, config: DatabaseConnectionConfig): string {
  if (config.connectionUrl) {
    return `${type}:${config.connectionUrl}`;
  }
  return `${type}:${config.host}:${config.port}:${config.database}:${config.username}`;
}

// ============================================================================
// POSTGRES EXECUTOR
// ============================================================================

/**
 * Create a PostgreSQL database executor
 */
export function createPostgresExecutor(
  config: PostgresConfig | { connectionUrl: string },
  options: ExecutorOptions = {}
): DatabaseExecutor {
  const { timeout = 30000, maxRows = 10000, debug = false } = options;

  // Check for cached connection
  const connectionKey = getConnectionKey('postgres', config);
  let sql = connectionPools.get(connectionKey);

  if (!sql) {
    // Create new connection
    if ('connectionUrl' in config && config.connectionUrl) {
      sql = postgres(config.connectionUrl, {
        max: 5, // Maximum pool size
        idle_timeout: 60, // Close idle connections after 60 seconds
        connect_timeout: 10, // 10 second connection timeout
        debug: debug ? console.log : undefined,
      });
    } else {
      const pgConfig = config as PostgresConfig;
      sql = postgres({
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        username: pgConfig.username,
        password: pgConfig.password,
        ssl: pgConfig.ssl ? { rejectUnauthorized: false } : false,
        max: 5,
        idle_timeout: 60,
        connect_timeout: 10,
        debug: debug ? console.log : undefined,
      });
    }

    connectionPools.set(connectionKey, sql);
  }

  const executor: DatabaseExecutor = {
    async query<T extends Record<string, unknown>>(sqlQuery: string): Promise<T[]> {
      if (!sql) {
        throw new Error('Database connection not initialized');
      }

      // Add timeout using postgres.js timeout option
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout exceeded')), timeout);
        });

        const queryPromise = sql.unsafe(sqlQuery) as Promise<T[]>;
        const result = await Promise.race([queryPromise, timeoutPromise]);

        // Limit results
        if (Array.isArray(result) && result.length > maxRows) {
          console.warn(`Query returned ${result.length} rows, limiting to ${maxRows}`);
          return result.slice(0, maxRows);
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`PostgreSQL query failed: ${message}`);
      }
    },

    async queryWithParams<T extends Record<string, unknown>>(
      sqlQuery: string,
      params: unknown[]
    ): Promise<T[]> {
      if (!sql) {
        throw new Error('Database connection not initialized');
      }

      try {
        // Use template literal for parameterized queries
        // Note: postgres.js uses $1, $2, etc. for parameters
        // Cast params to the expected type for postgres.js
        const result = await sql.unsafe(
          sqlQuery,
          params as postgres.ParameterOrJSON<string>[]
        ) as T[];

        if (Array.isArray(result) && result.length > maxRows) {
          return result.slice(0, maxRows);
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`PostgreSQL query failed: ${message}`);
      }
    },

    async close(): Promise<void> {
      if (sql) {
        connectionPools.delete(connectionKey);
        await sql.end();
      }
    },

    async ping(): Promise<boolean> {
      if (!sql) return false;

      try {
        await sql`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  };

  return executor;
}

// ============================================================================
// MYSQL EXECUTOR (Placeholder - requires mysql2 package)
// ============================================================================

/**
 * Create a MySQL database executor
 * Note: Requires mysql2 package to be installed
 */
export function createMySQLExecutor(
  config: MySQLConfig | { connectionUrl: string },
  options: ExecutorOptions = {}
): DatabaseExecutor {
  const { timeout = 30000, maxRows = 10000 } = options;

  // MySQL implementation would go here
  // For now, return a stub that throws an error
  const executor: DatabaseExecutor = {
    async query<T extends Record<string, unknown>>(_sqlQuery: string): Promise<T[]> {
      // TODO: Implement MySQL support
      // This requires adding mysql2 to package.json:
      // import mysql from 'mysql2/promise';

      throw new Error(
        'MySQL support requires mysql2 package. Install with: pnpm add mysql2'
      );
    },

    async queryWithParams<T extends Record<string, unknown>>(
      _sqlQuery: string,
      _params: unknown[]
    ): Promise<T[]> {
      throw new Error(
        'MySQL support requires mysql2 package. Install with: pnpm add mysql2'
      );
    },

    async close(): Promise<void> {
      // Nothing to close yet
    },

    async ping(): Promise<boolean> {
      return false;
    },
  };

  return executor;
}

// ============================================================================
// UNIFIED EXECUTOR FACTORY
// ============================================================================

/**
 * Create a database executor based on connection type
 */
export function createDatabaseExecutor(
  type: 'postgres' | 'mysql',
  config: DatabaseConnectionConfig,
  options?: ExecutorOptions
): DatabaseExecutor {
  switch (type) {
    case 'postgres':
      if (config.connectionUrl) {
        return createPostgresExecutor({ connectionUrl: config.connectionUrl }, options);
      }
      return createPostgresExecutor(
        {
          host: config.host ?? 'localhost',
          port: config.port ?? 5432,
          database: config.database ?? '',
          username: config.username ?? '',
          password: config.password ?? '',
          ssl: config.ssl,
          schema: config.schema,
        },
        options
      );

    case 'mysql':
      if (config.connectionUrl) {
        return createMySQLExecutor({ connectionUrl: config.connectionUrl }, options);
      }
      return createMySQLExecutor(
        {
          host: config.host ?? 'localhost',
          port: config.port ?? 3306,
          database: config.database ?? '',
          username: config.username ?? '',
          password: config.password ?? '',
          ssl: config.ssl,
        },
        options
      );

    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

// ============================================================================
// CONNECTION POOL MANAGEMENT
// ============================================================================

/**
 * Close all database connection pools
 * Call this on application shutdown
 */
export async function closeAllConnections(): Promise<void> {
  const closePromises = Array.from(connectionPools.entries()).map(
    async ([key, sql]) => {
      try {
        await sql.end();
        connectionPools.delete(key);
      } catch (error) {
        console.error(`Error closing connection ${key}:`, error);
      }
    }
  );

  await Promise.all(closePromises);
}

/**
 * Get the number of active connection pools
 */
export function getActiveConnectionCount(): number {
  return connectionPools.size;
}
