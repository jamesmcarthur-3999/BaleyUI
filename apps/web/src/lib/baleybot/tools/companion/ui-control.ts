/**
 * UI Control Companion Tools
 *
 * Lets the creator_bot switch the user's right-panel view by calling
 * navigate_tab. The pipeline emits a creator_navigate_tab SSE event
 * which the page.tsx handler uses to call navigateToTab().
 */

import type { RuntimeToolDefinition } from '../../executor';

export interface UIControlToolContext {
  onNavigateTab: (tab: string) => void;
}

export function buildUIControlTools(
  ctx: UIControlToolContext,
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

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
      ctx.onNavigateTab(tab);
      return { success: true, message: `Navigated to ${tab} tab` };
    },
  });

  return tools;
}
