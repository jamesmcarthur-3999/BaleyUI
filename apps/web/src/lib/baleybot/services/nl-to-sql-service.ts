/**
 * Natural Language to SQL Translation Service
 *
 * Translates natural language database queries to SQL using a specialized
 * BaleyBot. Provides schema-aware query generation with safety validation.
 */

import { Baleybot } from '@baleybots/core';

// ============================================================================
// TYPES
// ============================================================================

export interface NLToSQLConfig {
  /** AI model to use (default: openai:gpt-4o-mini) */
  model?: string;
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
// SQL GOAL TEMPLATES
// ============================================================================

const POSTGRES_GOAL = `You are a SQL expert that translates natural language queries into valid PostgreSQL.

RULES:
1. Generate ONLY the SQL query - no explanations, no markdown, just raw SQL
2. Use the exact table and column names from the provided schema
3. Use fully qualified table names when possible (schema.table)
4. For SELECT queries, prefer explicit column lists over SELECT *
5. Include appropriate WHERE clauses to filter data
6. Use proper JOIN syntax when querying related tables
7. Add LIMIT if not specified (default to 100)
8. Never generate destructive queries (DROP, TRUNCATE, DELETE without WHERE)

PostgreSQL SPECIFICS:
- Use double quotes for identifiers with special characters
- Use single quotes for string literals
- Use :: for type casting
- Use ILIKE for case-insensitive matching
- Use NOW() for current timestamp

SAFETY:
- Never include multiple statements (no semicolons except at the end)
- Never include comments (-- or /* */)
- Never use UNION, EXEC, or other injection patterns

Output ONLY the SQL query, nothing else.`;

const MYSQL_GOAL = `You are a SQL expert that translates natural language queries into valid MySQL.

RULES:
1. Generate ONLY the SQL query - no explanations, no markdown, just raw SQL
2. Use the exact table and column names from the provided schema
3. Use fully qualified table names when possible (schema.table)
4. For SELECT queries, prefer explicit column lists over SELECT *
5. Include appropriate WHERE clauses to filter data
6. Use proper JOIN syntax when querying related tables
7. Add LIMIT if not specified (default to 100)
8. Never generate destructive queries (DROP, TRUNCATE, DELETE without WHERE)

MySQL SPECIFICS:
- Use backticks for identifiers with special characters
- Use single quotes for string literals
- Use CONVERT() for type casting
- Use LOWER() with LIKE for case-insensitive matching
- Use NOW() for current timestamp

SAFETY:
- Never include multiple statements (no semicolons except at the end)
- Never include comments (-- or /* */)
- Never use UNION, EXEC, or other injection patterns

Output ONLY the SQL query, nothing else.`;

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Create a Natural Language to SQL translation service using Baleybots
 */
export function createNLToSQLService(config: NLToSQLConfig = {}): NLToSQLService {
  const { model = 'openai:gpt-4o-mini', databaseType = 'postgres' } = config;

  // Select the appropriate goal based on database type
  const goal = databaseType === 'mysql' ? MYSQL_GOAL : POSTGRES_GOAL;

  // Create a specialized BaleyBot for SQL generation
  const sqlBot = Baleybot.create({
    name: 'sql-translator',
    goal,
    model,
    outputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The generated SQL query',
        },
      },
      required: ['sql'],
    },
  });

  const service: NLToSQLService = {
    async translate(query: string, schemaContext: string): Promise<string> {
      const prompt = `DATABASE SCHEMA:
${schemaContext}

USER QUERY:
${query}

Generate the SQL query:`;

      try {
        // Execute the SQL bot
        const result = await sqlBot.process(prompt);

        // Extract SQL from result
        let sql: string;

        if (typeof result === 'string') {
          sql = result;
        } else if (result && typeof result === 'object' && 'sql' in result) {
          sql = String((result as { sql: unknown }).sql);
        } else {
          sql = String(result);
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
