/**
 * Schema Introspection Service
 *
 * Extracts database schema information from connected databases.
 * Used to provide context-aware database tools for BaleyBots.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  defaultValue?: string;
  description?: string;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  description?: string;
  rowCountEstimate?: number;
}

export interface DatabaseSchema {
  tables: TableInfo[];
  version?: string;
  introspectedAt: Date;
}

export interface ConnectionConfig {
  type: 'postgres' | 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  database?: string;
  connectionString?: string;
}

// ============================================================================
// POSTGRES INTROSPECTION
// ============================================================================

/**
 * SQL query to get table information from PostgreSQL
 */
const POSTGRES_TABLES_QUERY = `
SELECT
  t.table_schema as schema,
  t.table_name as name,
  obj_description((t.table_schema || '.' || t.table_name)::regclass) as description
FROM information_schema.tables t
WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema, t.table_name;
`;

/**
 * SQL query to get column information from PostgreSQL
 */
const POSTGRES_COLUMNS_QUERY = `
SELECT
  c.table_schema as schema,
  c.table_name as table_name,
  c.column_name as name,
  c.data_type as data_type,
  c.is_nullable = 'YES' as is_nullable,
  c.column_default as default_value,
  col_description((c.table_schema || '.' || c.table_name)::regclass, c.ordinal_position) as description
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;
`;

/**
 * SQL query to get primary key information from PostgreSQL
 */
const POSTGRES_PRIMARY_KEYS_QUERY = `
SELECT
  tc.table_schema as schema,
  tc.table_name as table_name,
  kcu.column_name as column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
`;

/**
 * SQL query to get foreign key information from PostgreSQL
 */
const POSTGRES_FOREIGN_KEYS_QUERY = `
SELECT
  tc.table_schema as schema,
  tc.table_name as table_name,
  kcu.column_name as column_name,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema');
`;

// ============================================================================
// MYSQL INTROSPECTION
// ============================================================================

const MYSQL_TABLES_QUERY = `
SELECT
  TABLE_SCHEMA as \`schema\`,
  TABLE_NAME as name,
  TABLE_COMMENT as description
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
`;

const MYSQL_COLUMNS_QUERY = `
SELECT
  TABLE_SCHEMA as \`schema\`,
  TABLE_NAME as table_name,
  COLUMN_NAME as name,
  DATA_TYPE as data_type,
  IS_NULLABLE = 'YES' as is_nullable,
  COLUMN_DEFAULT as default_value,
  COLUMN_COMMENT as description
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;
`;

/**
 * SQL query to get primary key information from MySQL
 */
const MYSQL_PRIMARY_KEYS_QUERY = `
SELECT
  TABLE_SCHEMA as \`schema\`,
  TABLE_NAME as table_name,
  COLUMN_NAME as column_name
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'PRIMARY'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
`;

/**
 * SQL query to get foreign key information from MySQL
 */
const MYSQL_FOREIGN_KEYS_QUERY = `
SELECT
  kcu.TABLE_SCHEMA as \`schema\`,
  kcu.TABLE_NAME as table_name,
  kcu.COLUMN_NAME as column_name,
  kcu.REFERENCED_TABLE_NAME as foreign_table,
  kcu.REFERENCED_COLUMN_NAME as foreign_column
FROM information_schema.KEY_COLUMN_USAGE kcu
WHERE kcu.TABLE_SCHEMA = DATABASE()
  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY kcu.TABLE_NAME, kcu.ORDINAL_POSITION;
`;

// ============================================================================
// INTROSPECTION FUNCTIONS
// ============================================================================

/**
 * Introspect a PostgreSQL database schema
 */
export async function introspectPostgres(
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>
): Promise<DatabaseSchema> {
  // Get tables
  const tablesResult = await executeQuery(POSTGRES_TABLES_QUERY);

  // Get columns
  const columnsResult = await executeQuery(POSTGRES_COLUMNS_QUERY);

  // Get primary keys
  const pkResult = await executeQuery(POSTGRES_PRIMARY_KEYS_QUERY);

  // Get foreign keys
  const fkResult = await executeQuery(POSTGRES_FOREIGN_KEYS_QUERY);

  // Build primary key lookup
  const primaryKeys = new Map<string, Set<string>>();
  for (const row of pkResult) {
    const key = `${row.schema}.${row.table_name}`;
    if (!primaryKeys.has(key)) {
      primaryKeys.set(key, new Set());
    }
    primaryKeys.get(key)!.add(row.column_name as string);
  }

  // Build foreign key lookup
  const foreignKeys = new Map<string, { table: string; column: string }>();
  for (const row of fkResult) {
    const key = `${row.schema}.${row.table_name}.${row.column_name}`;
    foreignKeys.set(key, {
      table: row.foreign_table as string,
      column: row.foreign_column as string,
    });
  }

  // Build column lookup
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnsResult) {
    const tableKey = `${row.schema}.${row.table_name}`;
    const columnKey = `${tableKey}.${row.name}`;

    const fk = foreignKeys.get(columnKey);
    const pks = primaryKeys.get(tableKey);

    const column: ColumnInfo = {
      name: row.name as string,
      dataType: row.data_type as string,
      isNullable: row.is_nullable as boolean,
      isPrimaryKey: pks?.has(row.name as string) ?? false,
      isForeignKey: !!fk,
      foreignKeyTable: fk?.table,
      foreignKeyColumn: fk?.column,
      defaultValue: row.default_value as string | undefined,
      description: row.description as string | undefined,
    };

    if (!columnsByTable.has(tableKey)) {
      columnsByTable.set(tableKey, []);
    }
    columnsByTable.get(tableKey)!.push(column);
  }

  // Build tables
  const tables: TableInfo[] = tablesResult.map((row) => {
    const tableKey = `${row.schema}.${row.name}`;
    const columns = columnsByTable.get(tableKey) ?? [];
    const pks = primaryKeys.get(tableKey);

    return {
      name: row.name as string,
      schema: row.schema as string,
      columns,
      primaryKey: pks ? Array.from(pks) : [],
      description: row.description as string | undefined,
    };
  });

  return {
    tables,
    introspectedAt: new Date(),
  };
}

/**
 * Introspect a MySQL database schema
 */
export async function introspectMySQL(
  executeQuery: (sql: string) => Promise<Record<string, unknown>[]>
): Promise<DatabaseSchema> {
  // Get tables
  const tablesResult = await executeQuery(MYSQL_TABLES_QUERY);

  // Get columns
  const columnsResult = await executeQuery(MYSQL_COLUMNS_QUERY);

  // Get primary keys
  const pkResult = await executeQuery(MYSQL_PRIMARY_KEYS_QUERY);

  // Get foreign keys
  const fkResult = await executeQuery(MYSQL_FOREIGN_KEYS_QUERY);

  // Build primary key lookup
  const primaryKeys = new Map<string, Set<string>>();
  for (const row of pkResult) {
    const key = `${row.schema}.${row.table_name}`;
    if (!primaryKeys.has(key)) {
      primaryKeys.set(key, new Set());
    }
    primaryKeys.get(key)!.add(row.column_name as string);
  }

  // Build foreign key lookup
  const foreignKeys = new Map<string, { table: string; column: string }>();
  for (const row of fkResult) {
    const key = `${row.schema}.${row.table_name}.${row.column_name}`;
    foreignKeys.set(key, {
      table: row.foreign_table as string,
      column: row.foreign_column as string,
    });
  }

  // Build column lookup
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnsResult) {
    const tableKey = `${row.schema}.${row.table_name}`;
    const columnKey = `${tableKey}.${row.name}`;

    const fk = foreignKeys.get(columnKey);
    const pks = primaryKeys.get(tableKey);

    const column: ColumnInfo = {
      name: row.name as string,
      dataType: row.data_type as string,
      isNullable: row.is_nullable as boolean,
      isPrimaryKey: pks?.has(row.name as string) ?? false,
      isForeignKey: !!fk,
      foreignKeyTable: fk?.table,
      foreignKeyColumn: fk?.column,
      defaultValue: row.default_value as string | undefined,
      description: row.description as string | undefined,
    };

    if (!columnsByTable.has(tableKey)) {
      columnsByTable.set(tableKey, []);
    }
    columnsByTable.get(tableKey)!.push(column);
  }

  // Build tables
  const tables: TableInfo[] = tablesResult.map((row) => {
    const tableKey = `${row.schema}.${row.name}`;
    const columns = columnsByTable.get(tableKey) ?? [];
    const pks = primaryKeys.get(tableKey);

    return {
      name: row.name as string,
      schema: row.schema as string,
      columns,
      primaryKey: pks ? Array.from(pks) : [],
      description: row.description as string | undefined,
    };
  });

  return {
    tables,
    introspectedAt: new Date(),
  };
}

// ============================================================================
// SCHEMA FORMATTING
// ============================================================================

/**
 * Format a database schema as context for AI tools
 */
export function formatSchemaForAI(schema: DatabaseSchema): string {
  const lines: string[] = [];

  lines.push('# Database Schema');
  lines.push('');

  for (const table of schema.tables) {
    lines.push(`## Table: ${table.schema}.${table.name}`);
    if (table.description) {
      lines.push(`Description: ${table.description}`);
    }
    lines.push('');
    lines.push('| Column | Type | Nullable | Key | Description |');
    lines.push('|--------|------|----------|-----|-------------|');

    for (const col of table.columns) {
      const keyInfo = col.isPrimaryKey
        ? 'PK'
        : col.isForeignKey
        ? `FK → ${col.foreignKeyTable}.${col.foreignKeyColumn}`
        : '';

      lines.push(
        `| ${col.name} | ${col.dataType} | ${col.isNullable ? 'Yes' : 'No'} | ${keyInfo} | ${col.description || ''} |`
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get a compact schema summary for AI context (shorter format)
 */
export function getCompactSchemaSummary(schema: DatabaseSchema): string {
  const lines: string[] = [];

  for (const table of schema.tables) {
    const columns = table.columns
      .map((c) => {
        let suffix = '';
        if (c.isPrimaryKey) suffix = ' (PK)';
        else if (c.isForeignKey) suffix = ` (FK→${c.foreignKeyTable})`;
        return `${c.name}:${c.dataType}${suffix}`;
      })
      .join(', ');

    lines.push(`${table.name}: ${columns}`);
  }

  return lines.join('\n');
}
