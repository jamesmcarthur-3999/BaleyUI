/**
 * UI Control Companion Tools
 *
 * Lets Baley control the user's right-panel view.
 * - `present_plan`: Show a plan preview before building
 * - `show_surface`: Switch to any surface with a reason toast
 * - `navigate_tab`: Legacy alias for show_surface
 *
 * Tools return action objects that the frontend handles via tool_execution_output.
 * No SSE callback wiring required — works in any route that calls buildCompanionTools().
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import type { PlanPreviewData } from '../../creator-types';
import type { AdaptiveTab } from '../../readiness';

export function buildUIControlTools(
  _ctx: CompanionToolContext,
  availableTabs?: AdaptiveTab[],
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  // -------------------------------------------------------------------------
  // present_plan — Show a structured plan preview on the right panel
  // -------------------------------------------------------------------------

  tools.set('present_plan', {
    name: 'present_plan',
    description:
      'Present a structured build plan to the user for review before generating BAL code. Call this when you have enough information to propose a design. The plan will appear as a visual preview card on the right panel. Wait for user approval before building.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Suggested bot name',
        },
        description: {
          type: 'string',
          description: '1-2 sentence description of what the bot does',
        },
        icon: {
          type: 'string',
          description: 'Emoji icon for the bot',
        },
        entities: {
          type: 'array',
          description: 'Entities (agents) in the bot',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Entity name' },
              purpose: { type: 'string', description: 'What this entity does' },
              tools: { type: 'array', items: { type: 'string' }, description: 'Tools assigned' },
              model: { type: 'string', description: 'Model to use (optional)' },
              icon: { type: 'string', description: 'Emoji icon (optional)' },
            },
            required: ['name', 'purpose', 'tools'],
          },
        },
        topology: {
          type: 'string',
          enum: ['single', 'chain', 'parallel', 'conditional', 'loop', 'mixed'],
          description: 'How entities are composed',
        },
        topologyDescription: {
          type: 'string',
          description: 'Human-readable description of the flow',
        },
        connections: {
          type: 'array',
          description: 'External connections required',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Connection type (e.g., "anthropic", "postgres")' },
              name: { type: 'string', description: 'Display name' },
              status: { type: 'string', enum: ['ready', 'needs-setup', 'missing'] },
              requiredBy: { type: 'array', items: { type: 'string' }, description: 'Entity names that need this' },
            },
            required: ['type', 'name', 'status'],
          },
        },
        complexity: {
          type: 'string',
          enum: ['simple', 'moderate', 'complex'],
          description: 'Overall complexity assessment',
        },
        designRationale: {
          type: 'string',
          description: 'Brief explanation of why this design was chosen',
        },
      },
      required: ['name', 'description', 'entities', 'topology', 'topologyDescription', 'complexity'],
    },
    category: 'ui',
    dangerLevel: 'safe',
    async function(args: Record<string, unknown>) {
      // Cap descriptions to prevent tool output from exceeding SDK's 10K char limit
      const capStr = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s;

      const plan: PlanPreviewData = {
        name: String(args.name ?? 'Unnamed Bot'),
        description: capStr(String(args.description ?? ''), 500),
        icon: String(args.icon ?? '🤖'),
        entities: Array.isArray(args.entities)
          ? (args.entities as Array<Record<string, unknown>>).map((e) => ({
              name: String(e.name ?? ''),
              purpose: capStr(String(e.purpose ?? ''), 200),
              tools: Array.isArray(e.tools) ? (e.tools as unknown[]).map(String) : [],
              model: e.model ? String(e.model) : undefined,
              icon: e.icon ? String(e.icon) : undefined,
            }))
          : [],
        topology: (['single', 'chain', 'parallel', 'conditional', 'loop', 'mixed'].includes(String(args.topology))
          ? String(args.topology)
          : 'single') as PlanPreviewData['topology'],
        topologyDescription: String(args.topologyDescription ?? ''),
        connections: Array.isArray(args.connections)
          ? (args.connections as Array<Record<string, unknown>>).map((c) => ({
              type: String(c.type ?? ''),
              name: String(c.name ?? ''),
              status: (['ready', 'needs-setup', 'missing'].includes(String(c.status))
                ? String(c.status)
                : 'missing') as 'ready' | 'needs-setup' | 'missing',
              requiredBy: Array.isArray(c.requiredBy) ? (c.requiredBy as unknown[]).map(String) : undefined,
            }))
          : [],
        complexity: (['simple', 'moderate', 'complex'].includes(String(args.complexity))
          ? String(args.complexity)
          : 'moderate') as PlanPreviewData['complexity'],
        designRationale: args.designRationale ? String(args.designRationale) : undefined,
      };

      return {
        action: 'show_plan',
        plan,
        message: 'Plan presented to user. Wait for their approval before building. They will say "approve", "looks good", "build it", or provide feedback for changes.',
        awaitUserAction: true,
      };
    },
  });

  // -------------------------------------------------------------------------
  // show_surface — Switch the right panel to any surface
  // -------------------------------------------------------------------------

  tools.set('show_surface', {
    name: 'show_surface',
    description:
      'Switch the user\'s right-panel view to a specific surface. Use this to guide the user — for example, switching to the test surface after building, or to integrate when discussing deployment. Include a reason so the user understands why you switched.',
    inputSchema: {
      type: 'object',
      properties: {
        surface: {
          type: 'string',
          enum: ['plan', 'visual', 'code', 'test', 'integrate'],
          description: 'The surface to show',
        },
        reason: {
          type: 'string',
          description: 'Why you are switching (shown as a toast to the user)',
        },
      },
      required: ['surface'],
    },
    category: 'ui',
    dangerLevel: 'safe',
    async function(args: Record<string, unknown>) {
      const surface = String(args.surface ?? '');
      const reason = args.reason ? String(args.reason) : undefined;

      // Validate against actual available tabs if provided
      if (availableTabs && !availableTabs.includes(surface as AdaptiveTab)) {
        return {
          success: false,
          error: `Surface "${surface}" is not available yet. Available surfaces: ${availableTabs.join(', ')}`,
        };
      }

      // Fallback to static validation
      const validSurfaces = ['plan', 'visual', 'code', 'test', 'integrate'];
      if (!validSurfaces.includes(surface)) {
        return {
          success: false,
          error: `Invalid surface: ${surface}. Must be one of: ${validSurfaces.join(', ')}`,
        };
      }

      return {
        action: 'show_surface',
        surface,
        reason,
        message: `Switched to ${surface} surface${reason ? `: ${reason}` : ''}`,
      };
    },
  });

  // -------------------------------------------------------------------------
  // navigate_tab — Backward-compatible alias for show_surface
  // -------------------------------------------------------------------------

  tools.set('navigate_tab', {
    name: 'navigate_tab',
    description:
      'Switch the user\'s right-panel view to a different tab. Use this to guide the user to relevant content — for example, switching to the Test tab after building, or to the Integrate tab when discussing deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: {
          type: 'string',
          enum: ['visual', 'code', 'test', 'integrate'],
          description: 'The tab to navigate to',
        },
      },
      required: ['tab'],
    },
    category: 'ui',
    dangerLevel: 'safe',
    async function(args: Record<string, unknown>) {
      const tab = args.tab as string;
      const validTabs = ['visual', 'code', 'test', 'integrate'];
      if (!validTabs.includes(tab)) {
        return { success: false, error: `Invalid tab: ${tab}. Must be one of: ${validTabs.join(', ')}` };
      }
      return {
        action: 'show_surface',
        surface: tab,
        reason: 'The AI assistant navigated here to show you something relevant.',
        message: `Navigated to ${tab} tab`,
      };
    },
  });

  return tools;
}
