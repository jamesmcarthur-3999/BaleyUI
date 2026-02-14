import { describe, it, expect, vi } from 'vitest';
import {
  getInternalBaleybot,
  INTERNAL_BALEYBOTS,
} from '../internal-baleybots';
import { parseBalCode } from '../bal-parser-pure';

// Mock the database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybots: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: 'bb-internal-1', name: 'baley', balCode: 'baley {}' },
        ]),
      }),
    }),
  },
  baleybots: {},
  baleybotExecutions: {},
  eq: vi.fn(),
  and: vi.fn(),
  notDeleted: vi.fn(),
}));

// Mock system workspace
vi.mock('@/lib/system-workspace', () => ({
  getOrCreateSystemWorkspace: vi.fn().mockResolvedValue('system-ws-id'),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock encryption (transitive dep via executor → ai-credentials-service)
vi.mock('@/lib/encryption', () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

// ============================================================================
// All internal BaleyBots
// ============================================================================

const ALL_INTERNAL_BOTS = [
  'bal_generator',
  'baley',
  'component_generator',
  'component_library_director',
  'connection_advisor',
  'context_processor',
  'creator_action_advisor',
  'deployment_advisor',
  'design_analyzer',
  'design_generator',
  'design_refiner',
  'execution_reviewer',
  'integration_builder',
  'nl_to_sql_mysql',
  'nl_to_sql_postgres',
  'pattern_learner',
  'platform_bug_triage',
  'test_generator',
  'test_interface_designer',
  'test_orchestrator',
  'test_results_analyzer',
  'test_validator',
  'tool_executor',
  'web_search_fallback',
] as const;

// Bots whose BAL the SDK parser can currently handle.
// Most internal bots use complex output type syntax (array<object{...}>, enum(...), ?type)
// that the SDK's type parser doesn't support yet.
// nl_to_sql_postgres and nl_to_sql_mysql use only simple types (string, number, boolean, array, object).
const BOTS_PARSEABLE_NOW = ['context_processor', 'nl_to_sql_postgres', 'nl_to_sql_mysql'] as const;

describe('internal-baleybots', () => {
  describe('INTERNAL_BALEYBOTS', () => {
    it('defines all internal bots', () => {
      for (const name of ALL_INTERNAL_BOTS) {
        expect(INTERNAL_BALEYBOTS[name], `Missing internal bot: ${name}`).toBeDefined();
      }
    });

    it('has at least one internal bot defined', () => {
      const definedBots = Object.keys(INTERNAL_BALEYBOTS);
      expect(definedBots.length).toBeGreaterThan(0);
    });

    it.each(ALL_INTERNAL_BOTS)('%s has required fields (name, description, icon, balCode)', (botName) => {
      const bot = INTERNAL_BALEYBOTS[botName]!;
      expect(bot.name).toBe(botName);
      expect(bot.description).toBeTruthy();
      expect(bot.icon).toBeTruthy();
      expect(bot.balCode).toBeTruthy();
    });

    it.each(ALL_INTERNAL_BOTS)('%s balCode contains an entity with a goal', (botName) => {
      const bot = INTERNAL_BALEYBOTS[botName]!;
      // Compositions (like creator_build_team) contain multiple entity names, not the composition name
      if (!bot.balCode.includes('chain {') && !bot.balCode.includes('parallel {')) {
        expect(bot.balCode).toContain(botName);
      }
      // BAL code should define a goal
      expect(bot.balCode).toContain('"goal"');
    });

    // Only test parsing for bots with simple output types the SDK parser supports
    it.each(BOTS_PARSEABLE_NOW)('%s balCode parses without errors', (botName) => {
      const bot = INTERNAL_BALEYBOTS[botName]!;
      const result = parseBalCode(bot.balCode);
      expect(result.errors, `Parse errors for ${botName}: ${result.errors.join(', ')}`).toHaveLength(0);
      expect(result.entities.length).toBeGreaterThanOrEqual(1);
    });

    // TODO: Enable after SDK parser adds complex type support (array<object{...}>, enum(...), ?type, unknown)
    it.todo('remaining 15 internal bots parse without errors (awaiting SDK complex type parser)');

    it.each(BOTS_PARSEABLE_NOW)('%s balCode defines an output schema', (botName) => {
      const bot = INTERNAL_BALEYBOTS[botName]!;
      const result = parseBalCode(bot.balCode);
      const entity = result.entities.find(e => e.name === botName);
      expect(entity, `Entity ${botName} not found in parsed BAL`).toBeDefined();
      expect(entity!.config.output, `${botName} missing output schema`).toBeDefined();
    });

    it.todo('remaining 15 internal bots define output schemas (awaiting SDK complex type parser)');
  });

  describe('INTERNAL_BALEYBOTS specific bot properties', () => {
    // These tests only work for bots whose BAL the parser can handle

    it('nl_to_sql_postgres uses gpt-5-mini', () => {
      const result = parseBalCode(INTERNAL_BALEYBOTS.nl_to_sql_postgres!.balCode);
      const entity = result.entities.find(e => e.name === 'nl_to_sql_postgres');
      expect(entity?.config.model).toBe('openai:gpt-5-mini');
    });

    it('nl_to_sql_mysql uses gpt-5-mini', () => {
      const result = parseBalCode(INTERNAL_BALEYBOTS.nl_to_sql_mysql!.balCode);
      const entity = result.entities.find(e => e.name === 'nl_to_sql_mysql');
      expect(entity?.config.model).toBe('openai:gpt-5-mini');
    });

    it('nl_to_sql_postgres output has expected fields', () => {
      const result = parseBalCode(INTERNAL_BALEYBOTS.nl_to_sql_postgres!.balCode);
      const entity = result.entities.find(e => e.name === 'nl_to_sql_postgres');
      const output = entity?.config.output as Record<string, string>;
      expect(output).toBeDefined();
      expect(output).toHaveProperty('sql');
    });

    it('nl_to_sql_mysql output has expected fields', () => {
      const result = parseBalCode(INTERNAL_BALEYBOTS.nl_to_sql_mysql!.balCode);
      const entity = result.entities.find(e => e.name === 'nl_to_sql_mysql');
      const output = entity?.config.output as Record<string, string>;
      expect(output).toBeDefined();
      expect(output).toHaveProperty('sql');
    });

    // These tests depend on complex type parsing — marked as todo until SDK patch
    it.todo('test_validator uses gpt-5-mini (awaiting SDK complex type parser)');
    it.todo('bal_generator output has balCode, entities, suggestedName, suggestedIcon fields');
    it.todo('test_orchestrator output has topology and tests');
    it.todo('deployment_advisor output has trigger recommendations and checklist');

    // Verify output fields via string matching (bypasses parser)
    // Bots that use conversational mode (no structured output schema)
    const CONVERSATIONAL_BOTS = new Set(['baley', 'integration_builder']);
    const BOTS_WITH_OUTPUT = ALL_INTERNAL_BOTS.filter(name => !CONVERSATIONAL_BOTS.has(name));
    it.each(BOTS_WITH_OUTPUT)('%s balCode contains an "output" block', (botName) => {
      const bot = INTERNAL_BALEYBOTS[botName]!;
      expect(bot.balCode).toContain('"output"');
    });

    it.each([...CONVERSATIONAL_BOTS])('%s has no output block (conversational)', (botName) => {
      expect(INTERNAL_BALEYBOTS[botName]!.balCode).not.toContain('"output"');
    });

    it('baley goal mentions key capabilities', () => {
      const balCode = INTERNAL_BALEYBOTS.baley!.balCode;
      expect(balCode).toContain('get_workspace_health');
      expect(balCode).toContain('navigate_user_to');
      expect(balCode).toContain('list_baleybots');
    });

    it('test_validator balCode specifies claude-haiku model (fast tier for per-test validation)', () => {
      expect(INTERNAL_BALEYBOTS.test_validator!.balCode).toContain('anthropic:claude-haiku-4-5-20251001');
    });

    it('creator_action_advisor output keeps structured actions typing', () => {
      expect(INTERNAL_BALEYBOTS.creator_action_advisor!.balCode).toContain('"actions": "array<object>"');
    });
  });

  describe('getInternalBaleybot', () => {
    it('returns internal bot definition', async () => {
      const bot = await getInternalBaleybot('baley');
      expect(bot).toBeDefined();
      expect(bot?.name).toBe('baley');
    });

    it('returns null for unknown bot', async () => {
      const bot = await getInternalBaleybot('unknown_bot');
      expect(bot).toBeNull();
    });
  });
});
