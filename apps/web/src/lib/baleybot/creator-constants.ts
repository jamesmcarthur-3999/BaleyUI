/**
 * Creator Page Constants
 *
 * Shared constants for the BaleyBot creation and detail page.
 */

import type { AdaptiveTab } from './creator-types';

export const ADVANCED_EDITOR_TABS: AdaptiveTab[] = ['code'];
export const POST_DESIGN_TABS: AdaptiveTab[] = ['test', 'integrate'];

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
