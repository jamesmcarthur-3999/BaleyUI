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
  { label: 'Research & summarize', prompt: 'Create a bot that searches the web for a topic, fetches the top 3 results, and summarizes them into a concise report' },
  { label: 'Data pipeline', prompt: 'Build a bot that reads data from a database, analyzes it, and sends me a notification with insights' },
  { label: 'Multi-bot workflow', prompt: 'Create a team of bots: one that monitors websites for changes and another that summarizes the changes into a daily digest' },
  { label: 'Simple assistant', prompt: 'Create a helpful assistant that can search the web and answer questions' },
];

/**
 * Maximum length for BaleyBot names
 */
export const MAX_NAME_LENGTH = 100;
