/**
 * Schema Validator
 *
 * Validates compatibility between JSON schemas at connection points.
 * Used by the Flow Compiler to ensure data can flow between nodes.
 */

import type {
  JsonSchema,
  SchemaCompatibilityResult,
  SchemaCompatibilityError,
} from './types';

/**
 * Validates that a source schema can provide data compatible with a target schema.
 * The source must provide at least what the target requires.
 */
export function validateSchemaCompatibility(
  source: JsonSchema,
  target: JsonSchema,
  path = ''
): SchemaCompatibilityResult {
  const errors: SchemaCompatibilityError[] = [];

  validateTypes(source, target, path, errors);

  return {
    compatible: errors.length === 0,
    errors,
  };
}

function validateTypes(
  source: JsonSchema,
  target: JsonSchema,
  path: string,
  errors: SchemaCompatibilityError[]
): void {
  // If types don't match, schemas are incompatible
  if (source.type !== target.type) {
    // Allow 'any' type (missing type) to pass through
    if (source.type && target.type) {
      errors.push({
        field: path || 'root',
        sourceType: source.type,
        targetType: target.type,
        message: `Type mismatch at ${path || 'root'}: source is "${source.type}", target expects "${target.type}"`,
      });
      return;
    }
  }

  // For objects, check that source provides all required fields
  if (target.type === 'object' && source.type === 'object') {
    validateObjectSchema(source, target, path, errors);
  }

  // For arrays, check item compatibility
  if (target.type === 'array' && source.type === 'array') {
    validateArraySchema(source, target, path, errors);
  }

  // For enums, check that source enum is a subset of target
  if (target.enum && source.enum) {
    validateEnumSchema(source, target, path, errors);
  }
}

function validateObjectSchema(
  source: JsonSchema,
  target: JsonSchema,
  path: string,
  errors: SchemaCompatibilityError[]
): void {
  const targetProps = target.properties || {};
  const sourceProps = source.properties || {};
  const targetRequired = target.required || [];

  // Check all required target fields exist in source
  for (const field of targetRequired) {
    if (!sourceProps[field]) {
      errors.push({
        field: `${path}.${field}`,
        sourceType: 'undefined',
        targetType: targetProps[field]?.type || 'unknown',
        message: `Missing required field "${field}" at ${path || 'root'}`,
      });
      continue;
    }

    // Recursively validate nested schemas
    const targetProp = targetProps[field];
    const sourceProp = sourceProps[field];
    if (targetProp && sourceProp) {
      validateTypes(
        sourceProp,
        targetProp,
        `${path}.${field}`,
        errors
      );
    }
  }

  // Check optional fields that exist in both for type compatibility
  for (const [field, targetProp] of Object.entries(targetProps)) {
    if (targetRequired.includes(field)) continue; // Already checked

    const sourceProp = sourceProps[field];
    if (sourceProp && targetProp) {
      validateTypes(
        sourceProp,
        targetProp,
        `${path}.${field}`,
        errors
      );
    }
  }
}

function validateArraySchema(
  source: JsonSchema,
  target: JsonSchema,
  path: string,
  errors: SchemaCompatibilityError[]
): void {
  if (target.items && source.items) {
    validateTypes(source.items, target.items, `${path}[]`, errors);
  }
}

function validateEnumSchema(
  source: JsonSchema,
  target: JsonSchema,
  path: string,
  errors: SchemaCompatibilityError[]
): void {
  const sourceValues = new Set(source.enum || []);
  const targetValues = target.enum || [];

  // All source values must be in target values
  for (const value of sourceValues) {
    if (!targetValues.includes(value)) {
      errors.push({
        field: path || 'root',
        sourceType: `enum(${String(value)})`,
        targetType: `enum(${targetValues.join(', ')})`,
        message: `Enum value "${String(value)}" not in target enum at ${path || 'root'}`,
      });
    }
  }
}

/**
 * Checks if a schema is a valid JSON Schema structure.
 */
export function isValidJsonSchema(schema: unknown): schema is JsonSchema {
  if (!schema || typeof schema !== 'object') return false;

  const s = schema as Record<string, unknown>;

  // Must have a type (or be a reference)
  if (!s.type && !s.$ref) return false;

  // Type must be valid if present
  if (s.type) {
    const validTypes = ['object', 'array', 'string', 'number', 'boolean', 'null'];
    if (!validTypes.includes(s.type as string)) return false;
  }

  return true;
}

/**
 * Generates a human-readable description of a schema.
 */
export function describeSchema(schema: JsonSchema | undefined): string {
  if (!schema) return 'any';

  switch (schema.type) {
    case 'object': {
      const props = Object.keys(schema.properties || {});
      if (props.length === 0) return 'object';
      if (props.length <= 3) {
        return `{ ${props.join(', ')} }`;
      }
      return `{ ${props.slice(0, 3).join(', ')}, ... }`;
    }
    case 'array': {
      const itemDesc = schema.items ? describeSchema(schema.items) : 'any';
      return `${itemDesc}[]`;
    }
    case 'string':
      if (schema.enum) {
        return `"${schema.enum.slice(0, 3).join('" | "')}"${schema.enum.length > 3 ? ' | ...' : ''}`;
      }
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

/**
 * Merges two schemas, preferring the source schema for conflicts.
 * Useful for creating derived schemas.
 */
export function mergeSchemas(
  base: JsonSchema,
  override: Partial<JsonSchema>
): JsonSchema {
  const merged: JsonSchema = { ...base };

  if (override.type) {
    merged.type = override.type;
  }

  if (override.properties) {
    merged.properties = {
      ...base.properties,
      ...override.properties,
    };
  }

  if (override.required) {
    merged.required = [
      ...new Set([...(base.required || []), ...override.required]),
    ];
  }

  if (override.items) {
    merged.items = override.items;
  }

  if (override.enum) {
    merged.enum = override.enum;
  }

  if (override.description) {
    merged.description = override.description;
  }

  return merged;
}

/**
 * Extracts the fields that are common to both schemas.
 */
export function getCommonFields(a: JsonSchema, b: JsonSchema): string[] {
  if (a.type !== 'object' || b.type !== 'object') return [];

  const aProps = Object.keys(a.properties || {});
  const bProps = new Set(Object.keys(b.properties || {}));

  return aProps.filter((prop) => bProps.has(prop));
}

/**
 * Creates an empty value that matches a schema.
 */
export function createEmptyValue(schema: JsonSchema): unknown {
  switch (schema.type) {
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties || {})) {
        if (schema.required?.includes(key)) {
          obj[key] = createEmptyValue(prop);
        }
      }
      return obj;
    }
    case 'array':
      return [];
    case 'string':
      return schema.default ?? '';
    case 'number':
      return schema.default ?? 0;
    case 'boolean':
      return schema.default ?? false;
    case 'null':
      return null;
    default:
      return null;
  }
}
