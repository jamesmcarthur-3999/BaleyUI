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
  DATABASE_TOOL_SCHEMA,
  type DatabaseConnectionInfo,
  type DatabaseToolConfig,
  type DatabaseQueryInput,
  type DatabaseQueryResult,
} from './database';
