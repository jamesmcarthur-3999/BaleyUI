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
import { formatSchemaForAI } from './schema-introspection';

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
// SQL SAFETY VALIDATION
// ============================================================================

/**
 * Dangerous SQL patterns that should be blocked
 */
const DANGEROUS_SQL_PATTERNS = [
  /;\s*drop\s+/i,           // DROP statements after semicolon
  /;\s*truncate\s+/i,       // TRUNCATE statements after semicolon
  /;\s*delete\s+from\s+/i,  // DELETE statements after semicolon (multi-statement)
  /--/,                     // SQL comments (can hide malicious code)
  /\/\*/,                   // Block comments
  /\bxp_/i,                 // SQL Server extended procedures
  /\bexec\s*\(/i,           // EXEC calls
  /\bexecute\s*\(/i,        // EXECUTE calls
  /\bunion\s+select/i,      // UNION injection
  /\binto\s+outfile/i,      // File write
  /\binto\s+dumpfile/i,     // File dump
  /\bload_file/i,           // File read
  /\bsleep\s*\(/i,          // Time-based attacks
  /\bbenchmark\s*\(/i,      // Time-based attacks
  /\bwaitfor\s+delay/i,     // SQL Server time delays
];

/**
 * Allowed SQL statement types for read operations
 */
const SAFE_READ_PATTERNS = [
  /^\s*select\s+/i,
  /^\s*with\s+.*?\s+as\s+\(/i, // CTEs
];

const WRITE_SQL_PATTERNS = [
  /^\s*insert\s+/i,
  /^\s*update\s+/i,
  /^\s*delete\s+/i,
  /^\s*create\s+/i,
  /^\s*alter\s+/i,
  /^\s*drop\s+/i,
  /^\s*truncate\s+/i,
  /^\s*replace\s+/i,
  /^\s*grant\s+/i,
  /^\s*revoke\s+/i,
];

/**
 * Validate generated SQL for safety
 * Returns an error message if unsafe, or null if safe
 */
export function validateSQL(
  sql: string,
  operationType: 'read' | 'write'
): string | null {
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      return `SQL contains potentially dangerous pattern: ${pattern.toString()}`;
    }
  }

  // For read operations, ensure it's actually a SELECT
  if (operationType === 'read') {
    const isSelect = SAFE_READ_PATTERNS.some((pattern) => pattern.test(sql));
    if (!isSelect) {
      return 'Read operation must be a SELECT statement';
    }
  }

  // Check for multiple statements (dangerous)
  const statements = sql.split(';').filter((s) => s.trim().length > 0);
  if (statements.length > 1) {
    return 'Multiple SQL statements are not allowed';
  }

  return null; // SQL is safe
}

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

/**
 * Determine operation intent from generated SQL.
 * This keeps approval gating aligned with AI-produced SQL instead of NL heuristics.
 */
function detectSqlIntent(sql: string): 'read' | 'write' | 'uncertain' {
  const trimmed = sql.trim();
  if (!trimmed) return 'uncertain';

  if (SAFE_READ_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'read';
  }

  if (WRITE_SQL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'write';
  }

  return 'uncertain';
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sanitize a connection name into a safe tool-name segment.
 * e.g. "My Production DB!" → "my_production_db"
 */
export function sanitizeConnectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ============================================================================
// TOOL GENERATOR
// ============================================================================

/**
 * Generate a database tool definition for the tool catalog.
 * Populates enriched fields (source, tags, requirements, capability, healthStatus).
 */
export function generateDatabaseToolDefinition(
  config: DatabaseToolConfig
): ToolDefinition {
  const { connection } = config;
  const toolName = `query_${connection.type}_${sanitizeConnectionName(connection.connectionName)}`;

  return {
    name: toolName,
    description: `Query the "${connection.connectionName}" ${connection.type} database. ` +
      `Available tables: ${connection.schema.tables.map((t) => t.name).join(', ')}. ` +
      `Use natural language to describe what data you want to retrieve or modify.`,
    inputSchema: DATABASE_TOOL_SCHEMA as Record<string, unknown>,
    category: 'database',
    dangerLevel: 'moderate',
    capabilities: ['read', 'write'],
    // Enrichment fields
    capability: 'both',
    source: {
      kind: 'connection',
      connectionId: connection.connectionId,
      connectionName: connection.connectionName,
      connectionType: connection.type,
    },
    connectionId: connection.connectionId,
    requirements: [
      {
        type: 'connection',
        connectionType: connection.type,
        description: `${connection.type === 'postgres' ? 'PostgreSQL' : connection.type === 'mysql' ? 'MySQL' : connection.type} database connection`,
        satisfied: true,
        connectionId: connection.connectionId,
      },
    ],
    tags: ['database', 'sql', 'query', connection.type, ...connection.schema.tables.map(t => t.name).slice(0, 5)],
    examples: [
      { input: { query: `Show all rows from ${connection.schema.tables[0]?.name ?? 'users'}` }, description: 'Simple table read query' },
      { input: { query: 'Count records grouped by status', table: connection.schema.tables[0]?.name }, description: 'Aggregation query' },
    ],
    healthStatus: 'ready',
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
  const generatedSqlCache = new Map<string, string>();

  const buildSqlPrompt = (input: DatabaseQueryInput): string =>
    input.table
      ? `Query the "${input.table}" table: ${input.query}`
      : input.query;

  const getCacheKey = (input: DatabaseQueryInput): string =>
    `${input.table ?? ''}::${input.query}`.trim();

  const toolFunction = async (
    args: Record<string, unknown>
  ): Promise<DatabaseQueryResult> => {
    const input = args as unknown as DatabaseQueryInput;
    const limit = Math.min(input.limit ?? 100, maxRows);
    const cacheKey = getCacheKey(input);
    const sqlPrompt = buildSqlPrompt(input);

    // Generate SQL using AI (reuse preflight SQL from needsApproval when available).
    const sql =
      generatedSqlCache.get(cacheKey) ??
      (await generateSQL(sqlPrompt, schemaContext));
    generatedSqlCache.delete(cacheKey);

    const intent = detectSqlIntent(sql);
    const operationType: 'read' | 'write' = intent === 'read' ? 'read' : 'write';
    const requiredApproval = intent !== 'read';

    // Validate generated SQL for safety
    const validationError = validateSQL(sql, operationType);
    if (validationError) {
      throw new Error(`SQL validation failed: ${validationError}`);
    }

    // For read operations, add LIMIT if not present
    let finalSql = sql;
    if (operationType === 'read' && !sql.toLowerCase().includes('limit')) {
      // Use parameterized limit value (convert to string for concatenation)
      finalSql = `${sql.trimEnd()} LIMIT ${String(limit)}`;
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
    name: `query_${connection.type}_${sanitizeConnectionName(connection.connectionName)}`,
    description: `Query the "${connection.connectionName}" database`,
    inputSchema: DATABASE_TOOL_SCHEMA as Record<string, unknown>,
    function: toolFunction,
    needsApproval: async (args: Record<string, unknown>) => {
      const input = args as unknown as DatabaseQueryInput;
      if (!input || typeof input.query !== 'string') {
        return true;
      }
      try {
        const cacheKey = getCacheKey(input);
        const sqlPrompt = buildSqlPrompt(input);
        const sql =
          generatedSqlCache.get(cacheKey) ??
          (await generateSQL(sqlPrompt, schemaContext));
        generatedSqlCache.set(cacheKey, sql);
        return detectSqlIntent(sql) !== 'read';
      } catch {
        // Conservative fallback: require approval when SQL classification fails.
        return true;
      }
    },
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
    capability: 'both',
    source: { kind: 'built-in' },
    requirements: [
      { type: 'connection', connectionType: 'postgres', description: 'A database connection (PostgreSQL or MySQL)' },
    ],
    tags: ['database', 'sql', 'query', 'generic'],
    healthStatus: 'needs-setup',
    setupInstructions: 'Add a database connection (PostgreSQL or MySQL) in the Connections page.',
  };
}
