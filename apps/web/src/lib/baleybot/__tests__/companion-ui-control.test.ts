import { describe, it, expect } from 'vitest';
import { buildUIControlTools } from '../tools/companion/ui-control';

const ctx = { workspaceId: 'ws-1', userId: 'user-1' };

describe('buildUIControlTools', () => {
  it('returns three tools: present_plan, show_surface, navigate_tab', () => {
    const tools = buildUIControlTools(ctx);
    expect(tools.size).toBe(3);
    expect(tools.has('present_plan')).toBe(true);
    expect(tools.has('show_surface')).toBe(true);
    expect(tools.has('navigate_tab')).toBe(true);
  });

  describe('present_plan', () => {
    it('returns show_plan action with plan data', async () => {
      const tools = buildUIControlTools(ctx);
      const tool = tools.get('present_plan')!;
      const result = await tool.function({
        name: 'Test Bot',
        description: 'A test bot',
        entities: [
          { name: 'entity1', purpose: 'Test entity', tools: ['web_search'] },
        ],
        topology: 'single',
        topologyDescription: 'Single entity',
        complexity: 'simple',
      });

      expect(result).toEqual(
        expect.objectContaining({
          action: 'show_plan',
          awaitUserAction: true,
          plan: expect.objectContaining({
            name: 'Test Bot',
            description: 'A test bot',
            topology: 'single',
            complexity: 'simple',
            entities: [
              expect.objectContaining({
                name: 'entity1',
                purpose: 'Test entity',
                tools: ['web_search'],
              }),
            ],
          }),
        }),
      );
    });
  });

  describe('show_surface', () => {
    it('returns show_surface action for valid surface', async () => {
      const tools = buildUIControlTools(ctx);
      const tool = tools.get('show_surface')!;
      const result = await tool.function({ surface: 'test', reason: 'Run the tests' });

      expect(result).toEqual({
        action: 'show_surface',
        surface: 'test',
        reason: 'Run the tests',
        message: 'Switched to test surface: Run the tests',
      });
    });

    it('returns error for invalid surface', async () => {
      const tools = buildUIControlTools(ctx);
      const tool = tools.get('show_surface')!;
      const result = await tool.function({ surface: 'invalid' });

      expect(result).toEqual(
        expect.objectContaining({ success: false, error: expect.stringContaining('Invalid surface') }),
      );
    });
  });

  describe('navigate_tab', () => {
    it('returns show_surface action (maps tab to surface)', async () => {
      const tools = buildUIControlTools(ctx);
      const tool = tools.get('navigate_tab')!;
      const result = await tool.function({ tab: 'code' });

      expect(result).toEqual({
        action: 'show_surface',
        surface: 'code',
        reason: 'The AI assistant navigated here to show you something relevant.',
        message: 'Navigated to code tab',
      });
    });

    it('returns error for invalid tab', async () => {
      const tools = buildUIControlTools(ctx);
      const tool = tools.get('navigate_tab')!;
      const result = await tool.function({ tab: 'invalid' });

      expect(result).toEqual(
        expect.objectContaining({ success: false, error: expect.stringContaining('Invalid tab') }),
      );
    });
  });
});
