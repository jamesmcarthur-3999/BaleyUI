/**
 * BB Bundle Format — a single JSON file that contains everything
 * needed to run a BaleyBot anywhere.
 */

export interface BaleybotTestCase {
  name: string;
  input: string;
  expectedOutput?: string;
  matchStrategy?: 'contains' | 'exact' | 'semantic';
}

export interface BaleybotBundle {
  /** Bundle format version. Always 1. */
  version: 1;
  /** Display name of the BaleyBot. */
  name: string;
  /** Description of what this BaleyBot does. */
  description: string;
  /** Emoji icon. */
  icon: string;
  /** The BAL source code. */
  balCode: string;
  /** Entity names defined in the BAL code. */
  entityNames: string[];
  /** Built-in tools required (e.g. ['web_search', 'fetch_url']). */
  requiredTools: string[];
  /** AI providers needed (e.g. ['anthropic', 'openai']). */
  requiredProviders: string[];
  /** Bundled test cases. */
  testCases?: BaleybotTestCase[];
  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Validate that a parsed JSON object is a valid BaleybotBundle.
 */
export function validateBundle(data: unknown): data is BaleybotBundle {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  return (
    obj.version === 1 &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.icon === 'string' &&
    typeof obj.balCode === 'string' &&
    Array.isArray(obj.entityNames) &&
    Array.isArray(obj.requiredTools) &&
    Array.isArray(obj.requiredProviders)
  );
}
