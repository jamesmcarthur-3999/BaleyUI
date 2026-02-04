/**
 * Natural Language to SQL Translation Service
 *
 * Translates natural language database queries to SQL using the internal
 * nl_to_sql_postgres or nl_to_sql_mysql BaleyBots. Provides schema-aware
 * query generation with safety validation.
 */

import { executeInternalBaleybot } from '../internal-baleybots';

// ============================================================================
// TYPES
// ============================================================================

export interface NLToSQLConfig {
  /** Database type for dialect-specific SQL */
  databaseType?: 'postgres' | 'mysql';
}

export interface NLToSQLService {
  /**
   * Translate a natural language query to SQL
   * @param query The natural language query
   * @param schemaContext The database schema formatted as context
   * @returns The generated SQL query
   */
  translate(query: string, schemaContext: string): Promise<string>;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Create a Natural Language to SQL translation service using internal BaleyBots
 */
export function createNLToSQLService(config: NLToSQLConfig = {}): NLToSQLService {
  const { databaseType = 'postgres' } = config;

  // Select the appropriate internal BaleyBot based on database type
  const internalBotName = databaseType === 'mysql' ? 'nl_to_sql_mysql' : 'nl_to_sql_postgres';

  const service: NLToSQLService = {
    async translate(query: string, schemaContext: string): Promise<string> {
      const input = `DATABASE SCHEMA:
${schemaContext}

USER QUERY:
${query}

Generate the SQL query:`;

      try {
        // Execute the internal SQL translation BaleyBot
        const { output } = await executeInternalBaleybot(internalBotName, input, {
          triggeredBy: 'internal',
        });

        // Extract SQL from result
        let sql: string;

        if (typeof output === 'string') {
          sql = output;
        } else if (output && typeof output === 'object' && 'sql' in output) {
          sql = String((output as { sql: unknown }).sql);
        } else {
          sql = String(output);
        }

        // Clean up the result
        sql = sql.trim();

        // Remove markdown code blocks if present
        if (sql.startsWith('```sql')) {
          sql = sql.slice(6);
        } else if (sql.startsWith('```')) {
          sql = sql.slice(3);
        }
        if (sql.endsWith('```')) {
          sql = sql.slice(0, -3);
        }

        sql = sql.trim();

        // Remove trailing semicolon (pg.js doesn't need it)
        if (sql.endsWith(';')) {
          sql = sql.slice(0, -1).trim();
        }

        return sql;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`NL to SQL translation failed: ${message}`);
      }
    },
  };

  return service;
}

// ============================================================================
// FACTORY FUNCTION FOR CATALOG SERVICE
// ============================================================================

/**
 * Create a SQL generator function for use with the catalog service.
 * This is a convenience wrapper around the NLToSQLService.
 */
export function createSQLGenerator(
  config: NLToSQLConfig = {}
): (query: string, schema: string) => Promise<string> {
  const service = createNLToSQLService(config);
  return service.translate.bind(service);
}

// ============================================================================
// SQL VALIDATION HELPERS
// ============================================================================

/**
 * Validate that a generated SQL query is safe to execute.
 * Returns null if safe, or an error message if not.
 */
export function validateGeneratedSQL(sql: string): string | null {
  // Check for multiple statements
  const statements = sql.split(';').filter((s) => s.trim().length > 0);
  if (statements.length > 1) {
    return 'Multiple SQL statements detected';
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    { pattern: /\bdrop\s+/i, message: 'DROP statement detected' },
    { pattern: /\btruncate\s+/i, message: 'TRUNCATE statement detected' },
    { pattern: /\bdelete\s+from\s+[^w]/i, message: 'DELETE without WHERE detected' },
    { pattern: /\balter\s+/i, message: 'ALTER statement detected' },
    { pattern: /\bgrant\s+/i, message: 'GRANT statement detected' },
    { pattern: /\brevoke\s+/i, message: 'REVOKE statement detected' },
    { pattern: /--/, message: 'SQL comment detected' },
    { pattern: /\/\*/, message: 'SQL block comment detected' },
    { pattern: /\bunion\s+select/i, message: 'UNION SELECT detected' },
    { pattern: /;\s*select/i, message: 'Multiple SELECT statements detected' },
    { pattern: /\bexec\s*\(/i, message: 'EXEC call detected' },
    { pattern: /\bexecute\s*\(/i, message: 'EXECUTE call detected' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(sql)) {
      return message;
    }
  }

  return null;
}

/**
 * Extract table names referenced in a SQL query.
 * Useful for validation against schema.
 */
export function extractTableNames(sql: string): string[] {
  const tables = new Set<string>();

  // Simple regex patterns to find table names
  const patterns = [
    /\bfrom\s+["'`]?(\w+(?:\.\w+)?)["'`]?/gi,
    /\bjoin\s+["'`]?(\w+(?:\.\w+)?)["'`]?/gi,
    /\binto\s+["'`]?(\w+(?:\.\w+)?)["'`]?/gi,
    /\bupdate\s+["'`]?(\w+(?:\.\w+)?)["'`]?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      if (match[1]) {
        tables.add(match[1].toLowerCase());
      }
    }
  }

  return Array.from(tables);
}
