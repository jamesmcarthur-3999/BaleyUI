/**
 * Connection-Derived Tools
 *
 * Tools that are auto-generated from workspace connections.
 * When a user connects a database, API, or other service,
 * smart tools are generated that understand the connection's schema.
 */

// Schema Introspection
export {
  introspectPostgres,
  introspectMySQL,
  formatSchemaForAI,
  getCompactSchemaSummary,
  type ColumnInfo,
  type TableInfo,
  type DatabaseSchema,
  type ConnectionConfig,
} from './schema-introspection';

// Database Tools
export {
  generateDatabaseToolDefinition,
  generateDatabaseRuntimeTool,
  generateGenericDatabaseToolDefinition,
  detectQueryIntent,
  validateSQL,
  DATABASE_TOOL_SCHEMA,
  type DatabaseConnectionInfo,
  type DatabaseToolConfig,
  type DatabaseQueryInput,
  type DatabaseQueryResult,
} from './database';

// Database Executor
export {
  createDatabaseExecutor,
  createPostgresExecutor,
  createMySQLExecutor,
  closeAllConnections,
  getActiveConnectionCount,
  type DatabaseExecutor,
  type PostgresConfig,
  type MySQLConfig,
  type ExecutorOptions,
} from './database-executor';
