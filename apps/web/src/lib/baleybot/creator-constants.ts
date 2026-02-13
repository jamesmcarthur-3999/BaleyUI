/**
 * Creator Page Constants
 *
 * Shared constants for the BaleyBot creation and detail page.
 */

import type { AdaptiveTab } from './creator-types';

export const ADVANCED_EDITOR_TABS: AdaptiveTab[] = ['code'];
export const POST_DESIGN_TABS: AdaptiveTab[] = ['test', 'integrate'];
/** Tabs that are only visible when plan data exists */
export const PLAN_TABS: AdaptiveTab[] = ['plan'];

/**
 * Example prompts shown on the /new welcome view
 */
export const EXAMPLE_PROMPTS = [
  { label: 'Automate research', prompt: 'I need a bot that searches for information on a topic and gives me a concise summary' },
  { label: 'Monitor & alert', prompt: 'Build a bot that checks something regularly and notifies me when it finds something important' },
  { label: 'Process data', prompt: 'Create a bot that takes data from a source, analyzes it, and produces a report' },
  { label: 'Help me brainstorm', prompt: "I have a task I want to automate but I'm not sure how to design it. Can you help me brainstorm?" },
];

/**
 * Maximum length for BaleyBot names
 */
export const MAX_NAME_LENGTH = 100;

/**
 * Tab-specific quick prompts for the chat input.
 * Shown when the user is on a specific tab to guide interaction.
 */
export const TAB_QUICK_PROMPTS: Record<string, Array<{ id: string; label: string; prompt: string; mode: 'send' }>> = {
  test: [
    { id: 'qp-test-sample', label: 'Run with sample input', prompt: 'Run a test with sample input to check the bot works correctly', mode: 'send' },
    { id: 'qp-test-error', label: 'Test error handling', prompt: 'Test how the bot handles invalid or missing input', mode: 'send' },
    { id: 'qp-test-complex', label: 'Try a complex case', prompt: 'Run a more complex test case to stress-test the bot', mode: 'send' },
  ],
  integrate: [
    { id: 'qp-int-webhook', label: 'Set up a webhook', prompt: 'Set up a webhook so this bot can be triggered from external services', mode: 'send' },
    { id: 'qp-int-schedule', label: 'Schedule recurring runs', prompt: 'Set up a schedule so this bot runs automatically on a recurring basis', mode: 'send' },
    { id: 'qp-int-chain', label: 'Chain from another bot', prompt: 'Configure this bot to be triggered when another BaleyBot completes', mode: 'send' },
    { id: 'qp-int-api', label: 'Show API endpoint', prompt: 'Show me the API endpoint and how to call this bot programmatically', mode: 'send' },
  ],
};
