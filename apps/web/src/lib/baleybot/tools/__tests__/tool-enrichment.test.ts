// apps/web/src/lib/baleybot/tools/__tests__/tool-enrichment.test.ts
import { describe, it, expect } from 'vitest';
import {
  getBuiltInToolDefinitions,
  BUILT_IN_TOOLS_METADATA,
} from '../built-in';
import {
  getToolCatalog,
  type CatalogContext,
  type FullToolCatalog,
} from '../catalog-service';
import {
  getToolRequirements,
  getToolHealthStatus,
  getToolsNeedingSetup,
  scanToolRequirements,
  getConnectionSummary,
} from '../requirements-scanner';
import {
  generateDatabaseToolDefinition,
  generateGenericDatabaseToolDefinition,
} from '../connection-derived/database';
import type { ToolDefinition } from '../../types';

// ============================================================================
// Helpers
// ============================================================================

function makeCatalogContext(overrides?: Partial<CatalogContext>): CatalogContext {
  return {
    workspaceId: 'ws-1',
    workspacePolicies: null,
    ...overrides,
  };
}

function makeDatabaseConnection(name: string, type: 'postgres' | 'mysql' = 'postgres') {
  return {
    connectionId: `conn-${name}`,
    connectionName: name,
    type,
    config: { host: 'localhost', port: type === 'postgres' ? 5432 : 3306, database: 'test', user: 'test', password: 'test' },
    schema: {
      tables: [
        { name: 'users', schema: 'public', primaryKey: ['id'], columns: [{ name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, isForeignKey: false }] },
        { name: 'orders', schema: 'public', primaryKey: ['id'], columns: [{ name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, isForeignKey: false }] },
      ],
      introspectedAt: new Date(),
    },
  };
}

// ============================================================================
// Built-in Tool Enrichment
// ============================================================================

describe('Built-in tool enrichment', () => {
  it('every metadata entry has capability, requirements, tags, and examples', () => {
    for (const meta of BUILT_IN_TOOLS_METADATA) {
      expect(meta.capability, `${meta.name} missing capability`).toBeDefined();
      expect(['read', 'write', 'both']).toContain(meta.capability);
      expect(Array.isArray(meta.requirements), `${meta.name} requirements not array`).toBe(true);
      expect(Array.isArray(meta.tags), `${meta.name} tags not array`).toBe(true);
      expect(meta.tags.length, `${meta.name} has no tags`).toBeGreaterThan(0);
      expect(Array.isArray(meta.examples), `${meta.name} examples not array`).toBe(true);
      expect(meta.examples.length, `${meta.name} has no examples`).toBeGreaterThan(0);
    }
  });

  it('getBuiltInToolDefinitions returns enriched ToolDefinitions', () => {
    const defs = getBuiltInToolDefinitions();
    expect(defs.length).toBe(BUILT_IN_TOOLS_METADATA.length);

    for (const def of defs) {
      expect(def.source).toEqual({ kind: 'built-in' });
      expect(def.capability).toBeDefined();
      expect(def.tags).toBeDefined();
      expect(def.tags!.length).toBeGreaterThan(0);
      expect(def.examples).toBeDefined();
    }
  });

  it('built-in tools with no requirements have healthStatus ready', () => {
    const defs = getBuiltInToolDefinitions();
    const fetchUrl = defs.find(t => t.name === 'fetch_url')!;
    expect(fetchUrl.healthStatus).toBe('ready');
    expect(fetchUrl.requirements).toEqual([]);
  });

  it('built-in tools with requirements have healthStatus unknown initially', () => {
    const defs = getBuiltInToolDefinitions();
    const webSearch = defs.find(t => t.name === 'web_search')!;
    // web_search has an api_key requirement (optional)
    expect(webSearch.requirements!.length).toBeGreaterThan(0);
    expect(webSearch.healthStatus).toBe('unknown');
  });

  it('capability classifications are correct', () => {
    const defs = getBuiltInToolDefinitions();
    const byName = new Map(defs.map(d => [d.name, d]));

    expect(byName.get('web_search')!.capability).toBe('read');
    expect(byName.get('fetch_url')!.capability).toBe('read');
    expect(byName.get('send_notification')!.capability).toBe('write');
    expect(byName.get('schedule_task')!.capability).toBe('write');
    expect(byName.get('store_memory')!.capability).toBe('both');
    expect(byName.get('spawn_baleybot')!.capability).toBe('both');
    expect(byName.get('create_agent')!.capability).toBe('write');
    expect(byName.get('create_tool')!.capability).toBe('write');
    expect(byName.get('shared_storage')!.capability).toBe('both');
    expect(byName.get('request_user_input')!.capability).toBe('read');
  });
});

// ============================================================================
// Database Tool Enrichment
// ============================================================================

describe('Database tool enrichment', () => {
  it('generateDatabaseToolDefinition returns enriched tool', () => {
    const tool = generateDatabaseToolDefinition({
      connection: {
        connectionId: 'conn-1',
        connectionName: 'Prod DB',
        type: 'postgres',
        schema: {
          tables: [
            { name: 'users', schema: 'public', primaryKey: ['id'], columns: [{ name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, isForeignKey: false }] },
          ],
          introspectedAt: new Date(),
        },
      },
    });

    expect(tool.name).toBe('query_postgres_prod_db');
    expect(tool.capability).toBe('both');
    expect(tool.source).toEqual({
      kind: 'connection',
      connectionId: 'conn-1',
      connectionName: 'Prod DB',
      connectionType: 'postgres',
    });
    expect(tool.connectionId).toBe('conn-1');
    expect(tool.healthStatus).toBe('ready');
    expect(tool.requirements).toHaveLength(1);
    expect(tool.requirements![0]!.type).toBe('connection');
    expect(tool.requirements![0]!.satisfied).toBe(true);
    expect(tool.tags).toContain('database');
    expect(tool.tags).toContain('postgres');
    expect(tool.examples!.length).toBeGreaterThan(0);
  });

  it('generateGenericDatabaseToolDefinition returns needs-setup status', () => {
    const tool = generateGenericDatabaseToolDefinition();
    expect(tool.healthStatus).toBe('needs-setup');
    expect(tool.setupInstructions).toBeDefined();
    expect(tool.requirements!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Catalog Health Resolution
// ============================================================================

describe('Catalog health resolution', () => {
  it('resolves built-in tools to ready when no requirements', () => {
    const catalog = getToolCatalog(makeCatalogContext());
    const fetchUrl = catalog.builtIn.find(t => t.name === 'fetch_url')!;
    expect(fetchUrl.healthStatus).toBe('ready');
  });

  it('all built-in tools get resolved healthStatus', () => {
    const catalog = getToolCatalog(makeCatalogContext());
    for (const tool of catalog.builtIn) {
      expect(tool.healthStatus, `${tool.name} has no healthStatus`).toBeDefined();
      expect(tool.healthStatus).not.toBe('unknown');
    }
  });

  it('connection-derived tools have ready status when schema is available', () => {
    const catalog = getToolCatalog(makeCatalogContext({
      includeConnectionTools: true,
      databaseConnections: [makeDatabaseConnection('Prod DB')],
    }));

    const dbTool = catalog.connectionDerived.find(t => t.name.startsWith('query_postgres_'))!;
    expect(dbTool).toBeDefined();
    expect(dbTool.healthStatus).toBe('ready');
    expect(dbTool.source).toEqual({
      kind: 'connection',
      connectionId: 'conn-Prod DB',
      connectionName: 'Prod DB',
      connectionType: 'postgres',
    });
  });

  it('workspace tools get default ready status', () => {
    const workspaceTool: ToolDefinition = {
      name: 'custom_tool',
      description: 'A custom tool',
      inputSchema: { type: 'object', properties: {} },
    };
    const catalog = getToolCatalog(makeCatalogContext({
      workspaceTools: [workspaceTool],
    }));

    const custom = catalog.workspace.find(t => t.name === 'custom_tool')!;
    expect(custom).toBeDefined();
    expect(custom.healthStatus).toBe('ready');
    expect(custom.source).toEqual({ kind: 'workspace', toolId: 'custom_tool' });
  });

  it('all tools in catalog.all have source populated', () => {
    const catalog = getToolCatalog(makeCatalogContext({
      includeConnectionTools: true,
      databaseConnections: [makeDatabaseConnection('TestDB')],
    }));

    for (const tool of catalog.all) {
      expect(tool.source, `${tool.name} missing source`).toBeDefined();
    }
  });
});

// ============================================================================
// Catalog-based Scanner Functions
// ============================================================================

describe('Catalog-based scanner functions', () => {
  let catalog: FullToolCatalog;

  const allTools = () => catalog.all;

  it('getToolRequirements returns enriched requirements from catalog', () => {
    catalog = getToolCatalog(makeCatalogContext({
      includeConnectionTools: true,
      databaseConnections: [makeDatabaseConnection('Analytics')],
    }));

    const dbReqs = getToolRequirements('query_postgres_analytics', allTools());
    expect(dbReqs.length).toBeGreaterThan(0);
    expect(dbReqs[0]!.type).toBe('connection');
    expect(dbReqs[0]!.connectionType).toBe('postgres');
  });

  it('getToolRequirements returns empty for tools with no requirements', () => {
    catalog = getToolCatalog(makeCatalogContext());
    const reqs = getToolRequirements('fetch_url', allTools());
    expect(reqs).toEqual([]);
  });

  it('getToolHealthStatus returns resolved status', () => {
    catalog = getToolCatalog(makeCatalogContext());
    expect(getToolHealthStatus('fetch_url', allTools())).toBe('ready');
  });

  it('getToolHealthStatus returns unknown for missing tools', () => {
    catalog = getToolCatalog(makeCatalogContext());
    expect(getToolHealthStatus('nonexistent_tool', allTools())).toBe('unknown');
  });

  it('getToolsNeedingSetup filters correctly', () => {
    const toolsWithSetup: ToolDefinition[] = [
      { name: 'ready_tool', description: '', inputSchema: {}, healthStatus: 'ready' },
      { name: 'setup_tool', description: '', inputSchema: {}, healthStatus: 'needs-setup' },
      { name: 'error_tool', description: '', inputSchema: {}, healthStatus: 'error' },
    ];

    const needSetup = getToolsNeedingSetup(toolsWithSetup);
    expect(needSetup).toHaveLength(2);
    expect(needSetup.map(t => t.name)).toEqual(['setup_tool', 'error_tool']);
  });
});

// ============================================================================
// Catalog-aware scanToolRequirements
// ============================================================================

describe('scanToolRequirements with catalog', () => {
  it('uses catalog metadata when available', () => {
    const catalog = getToolCatalog(makeCatalogContext({
      includeConnectionTools: true,
      databaseConnections: [makeDatabaseConnection('Users')],
    }));

    const result = scanToolRequirements(
      ['web_search', 'query_postgres_users'],
      catalog.all
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.toolName).toBe('web_search');
    expect(result[0]!.connectionType).toBe('none');
    expect(result[1]!.toolName).toBe('query_postgres_users');
    expect(result[1]!.connectionType).toBe('postgres');
  });

  it('falls back to name-based parsing for tools not in catalog', () => {
    const catalog = getToolCatalog(makeCatalogContext());

    const result = scanToolRequirements(
      ['query_postgres_unknown_db'],
      catalog.all
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.connectionType).toBe('postgres');
    expect(result[0]!.connectionSlug).toBe('unknown_db');
  });

  it('getConnectionSummary works with catalog', () => {
    const catalog = getToolCatalog(makeCatalogContext({
      includeConnectionTools: true,
      databaseConnections: [makeDatabaseConnection('Prod')],
    }));

    const summary = getConnectionSummary(
      ['web_search', 'query_postgres_prod'],
      catalog.all
    );

    expect(summary.needsAiProvider).toBe(true);
    expect(summary.required).toHaveLength(1);
    expect(summary.required[0]!.connectionType).toBe('postgres');
  });
});

// ============================================================================
// Enriched ToolDefinition type shape
// ============================================================================

describe('ToolDefinition enrichment type shape', () => {
  it('ToolSource discriminated union works correctly', () => {
    const builtIn: ToolDefinition = {
      name: 'test',
      description: 'test',
      inputSchema: {},
      source: { kind: 'built-in' },
    };
    expect(builtIn.source!.kind).toBe('built-in');

    const connection: ToolDefinition = {
      name: 'test',
      description: 'test',
      inputSchema: {},
      source: { kind: 'connection', connectionId: 'c1', connectionName: 'DB', connectionType: 'postgres' },
    };
    expect(connection.source!.kind).toBe('connection');
    if (connection.source?.kind === 'connection') {
      expect(connection.source.connectionId).toBe('c1');
    }

    const workspace: ToolDefinition = {
      name: 'test',
      description: 'test',
      inputSchema: {},
      source: { kind: 'workspace', toolId: 't1' },
    };
    expect(workspace.source!.kind).toBe('workspace');

    const ephemeral: ToolDefinition = {
      name: 'test',
      description: 'test',
      inputSchema: {},
      source: { kind: 'ephemeral', createdBy: 'bot-1' },
    };
    expect(ephemeral.source!.kind).toBe('ephemeral');
  });

  it('enrichment fields are optional (backward compatible)', () => {
    const minimal: ToolDefinition = {
      name: 'test',
      description: 'test',
      inputSchema: {},
    };
    expect(minimal.source).toBeUndefined();
    expect(minimal.healthStatus).toBeUndefined();
    expect(minimal.requirements).toBeUndefined();
    expect(minimal.tags).toBeUndefined();
    expect(minimal.capability).toBeUndefined();
  });
});
