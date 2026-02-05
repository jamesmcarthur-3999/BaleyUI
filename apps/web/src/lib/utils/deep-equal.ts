/**
 * Deep equality check for objects with cycle detection.
 * Extracted as shared utility for use across hooks and services.
 */
export function deepEqual(a: unknown, b: unknown, seen = new WeakSet<object>()): boolean {
  // Same reference or primitives
  if (a === b) return true;

  // Different types
  if (typeof a !== typeof b) return false;

  // Handle null
  if (a === null || b === null) return a === b;

  // Primitives
  if (typeof a !== 'object') return a === b;

  // Cycle detection
  if (seen.has(a as object)) return true; // Assume equal for cycles
  seen.add(a as object);

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], seen));
  }

  // Objects
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(key =>
    key in (b as object) &&
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      seen
    )
  );
}
