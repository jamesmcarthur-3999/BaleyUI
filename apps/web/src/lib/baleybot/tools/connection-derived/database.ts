/**
 * Database Tool Generator
 *
 * Auto-generates a schema-aware database tool when a database connection is added.
 * The tool accepts natural language queries, translates them to SQL using AI,
 * and executes them against the connected database.
 */

import type { ToolDefinition } from '../../types';
import type { RuntimeToolDefinition } from '../../executor';
import type { DatabaseSchema } from './schema-introspection';
import { formatSchemaForAI, getCompactSchemaSummary } from './schema-introspection';

// ============================================================================
// TYPES
// ============================================================================

export interface DatabaseConnectionInfo {
  connectionId: string;
  connectionName: string;
  type: 'postgres' | 'mysql' | 'sqlite';
  schema: DatabaseSchema;
}

export interface DatabaseToolConfig {
  connection: DatabaseConnectionInfo;
  /** Whether to allow write operations (default: false, requires approval) */
  allowWrites?: boolean;
  /** Maximum number of rows to return (default: 1000) */
  maxRows?: number;
}

export interface DatabaseQueryInput {
  /** Natural language description of what data to retrieve or modify */
  query: string;
  /** Optional: specific table to query */
  table?: string;
  /** Optional: maximum rows to return */
  limit?: number;
}

export interface DatabaseQueryResult {
  /** The generated SQL query */
  sql: string;
  /** The query results */
  data: Record<string, unknown>[];
  /** Number of rows affected (for write operations) */
  rowsAffected?: number;
  /** Whether this was a read or write operation */
  operationType: 'read' | 'write';
  /** Whether approval was required */
  requiredApproval: boolean;
}

// ============================================================================
// TOOL SCHEMA
// ============================================================================

export const DATABASE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Natural language description of what data to retrieve or modify',
    },
    table: {
      type: 'string',
      description: 'Optional: specific table to query',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of rows to return (default: 100)',
      default: 100,
    },
  },
  required: ['query'],
} as const;

// ============================================================================
// INTENT DETECTION
// ============================================================================

/**
 * Detect whether a query intends to read or write data
 * This is a simple heuristic - in production, use AI classification
 */
export function detectQueryIntent(
  query: string
): 'read' | 'write' | 'uncertain' {
  const lowerQuery = query.toLowerCase();

  // Write operation keywords
  const writeKeywords = [
    'insert',
    'create',
    'add',
    'update',
    'modify',
    'change',
    'delete',
    'remove',
    'drop',
    'truncate',
    'alter',
    'set',
    'increment',
    'decrement',
  ];

  // Check for write keywords
  for (const keyword of writeKeywords) {
    if (lowerQuery.includes(keyword)) {
      return 'write';
    }
  }

  // Read operation keywords
  const readKeywords = [
    'find',
    'get',
    'show',
    'list',
    'select',
    'search',
    'retrieve',
    'fetch',
    'count',
    'sum',
    'average',
    'max',
    'min',
    'group',
  ];

  for (const keyword of readKeywords) {
    if (lowerQuery.includes(keyword)) {
      return 'read';
    }
  }

  // Default to uncertain (requires approval)
  return 'uncertain';
}

// ============================================================================
// TOOL GENERATOR
// ============================================================================

/**
 * Generate a database tool definition for the tool catalog
 */
export function generateDatabaseToolDefinition(
  config: DatabaseToolConfig
): ToolDefinition {
  const { connection } = config;
  const schemaSummary = getCompactSchemaSummary(connection.schema);

  return {
    name: `database_${connection.connectionId.substring(0, 8)}`,
    description: `Query the "${connection.connectionName}" ${connection.type} database. ` +
      `Available tables: ${connection.schema.tables.map((t) => t.name).join(', ')}. ` +
      `Use natural language to describe what data you want to retrieve or modify.`,
    inputSchema: DATABASE_TOOL_SCHEMA as Record<string, unknown>,
    category: 'database',
    dangerLevel: 'moderate',
    capabilities: ['read', 'write'],
  };
}

/**
 * Generate a runtime database tool with actual execution capability
 */
export function generateDatabaseRuntimeTool(
  config: DatabaseToolConfig,
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>,
  generateSQL: (query: string, schema: string) => Promise<string>
): RuntimeToolDefinition {
  const { connection, maxRows = 1000 } = config;
  const schemaContext = formatSchemaForAI(connection.schema);

  const toolFunction = async (
    args: Record<string, unknown>
  ): Promise<DatabaseQueryResult> => {
    const input = args as unknown as DatabaseQueryInput;
    const limit = Math.min(input.limit ?? 100, maxRows);

    // Detect intent
    const intent = detectQueryIntent(input.query);
    const operationType = intent === 'write' ? 'write' : 'read';
    const requiredApproval = intent !== 'read';

    // Generate SQL using AI
    const sqlPrompt = input.table
      ? `Query the "${input.table}" table: ${input.query}`
      : input.query;

    const sql = await generateSQL(sqlPrompt, schemaContext);

    // For read operations, add LIMIT if not present
    let finalSql = sql;
    if (operationType === 'read' && !sql.toLowerCase().includes('limit')) {
      finalSql = `${sql.trimEnd()} LIMIT ${limit}`;
    }

    // Execute the query
    const data = await executeQuery(finalSql);

    return {
      sql: finalSql,
      data,
      rowsAffected: operationType === 'write' ? data.length : undefined,
      operationType,
      requiredApproval,
    };
  };

  return {
    name: `database_${connection.connectionId.substring(0, 8)}`,
    description: `Query the "${connection.connectionName}" database`,
    inputSchema: DATABASE_TOOL_SCHEMA as Record<string, unknown>,
    function: toolFunction,
    category: 'database',
    dangerLevel: 'moderate',
  };
}

// ============================================================================
// HELPER: Generate generic database tool (without connection)
// ============================================================================

/**
 * Generate a generic database tool that can work with any connected database.
 * This is used when a specific connection isn't known at tool generation time.
 */
export function generateGenericDatabaseToolDefinition(): ToolDefinition {
  return {
    name: 'database',
    description:
      'Query connected databases using natural language. ' +
      'Describe what data you want to retrieve or modify, and the AI will ' +
      'translate your request to SQL and execute it. Read operations are ' +
      'immediate; write operations require approval.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what data to retrieve or modify',
        },
        connection: {
          type: 'string',
          description: 'Optional: name or ID of the database connection to use',
        },
        table: {
          type: 'string',
          description: 'Optional: specific table to query',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return (default: 100)',
          default: 100,
        },
      },
      required: ['query'],
    },
    category: 'database',
    dangerLevel: 'moderate',
    capabilities: ['read', 'write'],
  };
}
