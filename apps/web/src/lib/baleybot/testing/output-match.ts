/**
 * Deterministic output matching utilities for test evaluation.
 *
 * These checks are intentionally pure and portable so both client and server
 * can use identical matching logic before/alongside AI validation.
 */

export const MATCH_STRATEGIES = ['exact', 'contains', 'semantic', 'schema', 'structured'] as const;

export type MatchStrategy = (typeof MATCH_STRATEGIES)[number];

export interface OutputMatchResult {
  passed: boolean;
  reason: string;
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function deepEqualStrict(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  if (typeof expected !== typeof actual) return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, i) => deepEqualStrict(item, actual[i]));
  }

  if (typeof expected === 'object' && expected !== null) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const expectedKeys = Object.keys(expectedObj).sort();
    const actualKeys = Object.keys(actualObj).sort();
    if (
      expectedKeys.length !== actualKeys.length ||
      expectedKeys.some((key, i) => key !== actualKeys[i])
    ) {
      return false;
    }
    return expectedKeys.every((key) => deepEqualStrict(expectedObj[key], actualObj[key]));
  }

  return false;
}

function deepSubsetMatch(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  if (typeof expected !== typeof actual) return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) return false;
    return expected.every((item, i) => deepSubsetMatch(item, actual[i]));
  }

  if (typeof expected === 'object' && expected !== null) {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    return Object.keys(expectedObj).every(
      (key) => key in actualObj && deepSubsetMatch(expectedObj[key], actualObj[key])
    );
  }

  return false;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:.!?()[\]{}"'`<>/\\|-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3);
}

export function evaluateOutputMatch(
  actual: string,
  expected: string,
  strategy: MatchStrategy = 'contains'
): OutputMatchResult {
  const trimActual = actual.trim();
  const trimExpected = expected.trim();

  if (!trimExpected) {
    return { passed: true, reason: 'No expected output was defined.' };
  }

  switch (strategy) {
    case 'exact': {
      const expectedJson = parseJson(trimExpected);
      const actualJson = parseJson(trimActual);
      if (expectedJson !== null && actualJson !== null) {
        const passed = deepEqualStrict(expectedJson, actualJson);
        return {
          passed,
          reason: passed
            ? 'Exact JSON match.'
            : 'Exact JSON mismatch (values, array order, or keys differ).',
        };
      }

      const passed = trimActual === trimExpected;
      return {
        passed,
        reason: passed ? 'Exact text match.' : 'Exact text mismatch.',
      };
    }

    case 'contains': {
      const lowerActual = trimActual.toLowerCase();
      const lowerExpected = trimExpected.toLowerCase();

      if (lowerActual.includes(lowerExpected)) {
        return { passed: true, reason: 'Expected text found as a direct substring.' };
      }

      const expectedWords = tokenize(trimExpected);
      if (expectedWords.length === 0) {
        return { passed: true, reason: 'Expected output has no significant keywords.' };
      }

      const matchedWords = expectedWords.filter((w) => lowerActual.includes(w));
      const ratio = matchedWords.length / expectedWords.length;
      const passed = ratio >= 0.8;

      return {
        passed,
        reason: passed
          ? `Keyword overlap passed (${matchedWords.length}/${expectedWords.length}).`
          : `Keyword overlap failed (${matchedWords.length}/${expectedWords.length}).`,
      };
    }

    case 'semantic': {
      const lowerActual = trimActual.toLowerCase();
      const lowerExpected = trimExpected.toLowerCase();
      if (lowerActual.includes(lowerExpected)) {
        return { passed: true, reason: 'Semantic check passed via direct concept inclusion.' };
      }

      const stripped = lowerExpected
        .replace(/should (contain|include|mention|have|be|return|output)/g, '')
        .replace(/must (contain|include|mention|have|be|return|output)/g, '')
        .replace(/the (output|response|result) (should|must|will)/g, '')
        .replace(/expected to/g, '')
        .trim();

      const concepts = tokenize(stripped);
      if (concepts.length === 0) {
        return { passed: true, reason: 'Semantic check passed (no core concepts detected).' };
      }

      const matched = concepts.filter((c) => lowerActual.includes(c));
      const ratio = matched.length / concepts.length;
      const passed = ratio >= 0.6;

      return {
        passed,
        reason: passed
          ? `Semantic concept match passed (${matched.length}/${concepts.length}).`
          : `Semantic concept match failed (${matched.length}/${concepts.length}).`,
      };
    }

    case 'schema': {
      const expectedShapeRaw = parseJson(trimExpected);
      const actualRaw = parseJson(trimActual);
      if (!expectedShapeRaw || !actualRaw || typeof expectedShapeRaw !== 'object' || typeof actualRaw !== 'object') {
        return { passed: false, reason: 'Schema check failed (invalid JSON shape or output).' };
      }

      const expectedShape = expectedShapeRaw as Record<string, string>;
      const actualObj = actualRaw as Record<string, unknown>;

      const typeCheckers: Record<string, (v: unknown) => boolean> = {
        string: (v) => typeof v === 'string',
        number: (v) => typeof v === 'number',
        boolean: (v) => typeof v === 'boolean',
        array: (v) => Array.isArray(v),
        object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      };

      for (const [key, expectedTypeRaw] of Object.entries(expectedShape)) {
        if (!(key in actualObj)) {
          return { passed: false, reason: `Schema check failed (missing key: ${key}).` };
        }
        const expectedType = expectedTypeRaw.toLowerCase();
        const checker = typeCheckers[expectedType];
        if (checker && !checker(actualObj[key])) {
          return {
            passed: false,
            reason: `Schema check failed (key "${key}" expected ${expectedType}).`,
          };
        }
      }

      return { passed: true, reason: 'Schema check passed.' };
    }

    case 'structured': {
      const expectedObj = parseJson(trimExpected);
      const actualObj = parseJson(trimActual);
      if (expectedObj === null || actualObj === null) {
        return { passed: false, reason: 'Structured check failed (invalid JSON).' };
      }

      const passed = deepSubsetMatch(expectedObj, actualObj);
      return {
        passed,
        reason: passed
          ? 'Structured check passed (expected structure found).'
          : 'Structured check failed (expected structure missing).',
      };
    }

    default:
      return { passed: false, reason: `Unknown match strategy: ${strategy}` };
  }
}

