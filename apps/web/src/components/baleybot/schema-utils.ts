/**
 * Schema Builder Utilities
 *
 * Functions for converting between TypeSpec (AST) and the visual schema builder format.
 */

/**
 * Schema field types supported by the builder
 */
export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'enum'
  | 'optional';

/**
 * A field in the schema builder
 */
export interface SchemaField {
  id: string;
  name: string;
  type: SchemaFieldType;
  /** For enum type: the allowed values */
  enumValues?: string[];
  /** For number type: the range constraints */
  range?: { min?: number; max?: number };
  /** For array type: the element type */
  elementType?: SchemaField;
  /** For object type: the nested properties */
  properties?: SchemaField[];
  /** For optional type: the wrapped inner field */
  innerField?: SchemaField;
  /** Whether this field is marked as optional */
  isOptional?: boolean;
}

/**
 * Generate a unique field ID
 */
export function generateFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a default field of a given type
 */
export function createDefaultField(type: SchemaFieldType, name: string = ''): SchemaField {
  const field: SchemaField = {
    id: generateFieldId(),
    name,
    type,
  };

  switch (type) {
    case 'enum':
      field.enumValues = ['option1', 'option2'];
      break;
    case 'number':
      field.range = {};
      break;
    case 'array':
      field.elementType = createDefaultField('string');
      break;
    case 'object':
      field.properties = [];
      break;
    case 'optional':
      field.innerField = createDefaultField('string');
      break;
  }

  return field;
}

/**
 * Convert a TypeSpec string to a SchemaField
 */
export function typeSpecToSchemaField(
  name: string,
  typeSpec: string
): SchemaField {
  const trimmed = typeSpec.trim();

  // Handle optional prefix: ?type
  if (trimmed.startsWith('?')) {
    const innerTypeSpec = trimmed.slice(1).trim();
    const innerField = typeSpecToSchemaField('', innerTypeSpec);
    return {
      ...innerField,
      id: generateFieldId(),
      name,
      isOptional: true,
    };
  }

  // Handle optional(type) syntax
  if (trimmed.startsWith('optional(') && trimmed.endsWith(')')) {
    const innerTypeSpec = trimmed.slice(9, -1).trim();
    const innerField = typeSpecToSchemaField('', innerTypeSpec);
    return {
      ...innerField,
      id: generateFieldId(),
      name,
      isOptional: true,
    };
  }

  // Handle enum('a', 'b', 'c') syntax
  if (trimmed.startsWith('enum(') && trimmed.endsWith(')')) {
    const enumContent = trimmed.slice(5, -1).trim();
    const enumValues = parseEnumValues(enumContent);
    return {
      id: generateFieldId(),
      name,
      type: 'enum',
      enumValues,
    };
  }

  // Handle number(min, max) or number(min: x, max: y) syntax
  if (trimmed.startsWith('number(') && trimmed.endsWith(')')) {
    const rangeContent = trimmed.slice(7, -1).trim();
    const range = parseNumberRange(rangeContent);
    return {
      id: generateFieldId(),
      name,
      type: 'number',
      range,
    };
  }

  // Handle array<elementType> syntax
  if (trimmed.startsWith('array<') && trimmed.endsWith('>')) {
    const elementTypeSpec = trimmed.slice(6, -1).trim();
    const elementType = typeSpecToSchemaField('', elementTypeSpec);
    return {
      id: generateFieldId(),
      name,
      type: 'array',
      elementType,
    };
  }

  // Handle plain array
  if (trimmed === 'array') {
    return {
      id: generateFieldId(),
      name,
      type: 'array',
      elementType: createDefaultField('string'),
    };
  }

  // Handle object { field: type, ... } syntax
  if (trimmed.startsWith('object {') || trimmed.startsWith('object{')) {
    const startIdx = trimmed.indexOf('{');
    const objectContent = trimmed.slice(startIdx + 1, -1).trim();
    const properties = parseObjectProperties(objectContent);
    return {
      id: generateFieldId(),
      name,
      type: 'object',
      properties,
    };
  }

  // Handle plain object
  if (trimmed === 'object') {
    return {
      id: generateFieldId(),
      name,
      type: 'object',
      properties: [],
    };
  }

  // Handle simple types
  switch (trimmed) {
    case 'string':
      return { id: generateFieldId(), name, type: 'string' };
    case 'number':
      return { id: generateFieldId(), name, type: 'number' };
    case 'boolean':
      return { id: generateFieldId(), name, type: 'boolean' };
    default:
      // Default to string for unknown types
      return { id: generateFieldId(), name, type: 'string' };
  }
}

/**
 * Convert a SchemaField to a TypeSpec string
 */
export function schemaFieldToTypeSpec(field: SchemaField): string {
  let typeSpec = '';

  switch (field.type) {
    case 'string':
      typeSpec = 'string';
      break;

    case 'number':
      if (field.range && (field.range.min !== undefined || field.range.max !== undefined)) {
        const parts: string[] = [];
        if (field.range.min !== undefined) parts.push(`min: ${field.range.min}`);
        if (field.range.max !== undefined) parts.push(`max: ${field.range.max}`);
        typeSpec = `number(${parts.join(', ')})`;
      } else {
        typeSpec = 'number';
      }
      break;

    case 'boolean':
      typeSpec = 'boolean';
      break;

    case 'enum':
      if (field.enumValues && field.enumValues.length > 0) {
        const values = field.enumValues.map((v) => `'${v}'`).join(', ');
        typeSpec = `enum(${values})`;
      } else {
        typeSpec = 'string'; // Fallback if no enum values
      }
      break;

    case 'array':
      if (field.elementType) {
        const elementSpec = schemaFieldToTypeSpec(field.elementType);
        typeSpec = `array<${elementSpec}>`;
      } else {
        typeSpec = 'array';
      }
      break;

    case 'object':
      if (field.properties && field.properties.length > 0) {
        const propSpecs = field.properties
          .map((prop) => `${prop.name}: ${schemaFieldToTypeSpec(prop)}`)
          .join(', ');
        typeSpec = `object { ${propSpecs} }`;
      } else {
        typeSpec = 'object';
      }
      break;

    default:
      typeSpec = 'string';
  }

  // Wrap with optional if needed
  if (field.isOptional) {
    typeSpec = `?${typeSpec}`;
  }

  return typeSpec;
}

/**
 * Convert an array of SchemaFields to a BAL output schema object
 */
export function schemaFieldsToBAL(fields: SchemaField[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (const field of fields) {
    if (field.name) {
      output[field.name] = schemaFieldToTypeSpec(field);
    }
  }
  return output;
}

/**
 * Parse a BAL output schema object to SchemaFields
 */
export function balToSchemaFields(output: Record<string, string>): SchemaField[] {
  return Object.entries(output).map(([name, typeSpec]) =>
    typeSpecToSchemaField(name, typeSpec)
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse enum values from content like "'a', 'b', 'c'"
 */
function parseEnumValues(content: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of content) {
    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (inQuote && char === quoteChar) {
      inQuote = false;
      if (current.length > 0) {
        values.push(current);
      }
      current = '';
      continue;
    }

    if (inQuote) {
      current += char;
    }
  }

  return values;
}

/**
 * Parse number range from content like "0, 100" or "min: 0, max: 100"
 */
function parseNumberRange(content: string): { min?: number; max?: number } {
  const range: { min?: number; max?: number } = {};

  if (content.includes(':')) {
    // Named parameters: "min: 0, max: 100"
    const parts = content.split(',').map((p) => p.trim());
    for (const part of parts) {
      const [key, value] = part.split(':').map((s) => s.trim());
      if (key === 'min' && value !== undefined) range.min = parseFloat(value);
      else if (key === 'max' && value !== undefined) range.max = parseFloat(value);
    }
  } else {
    // Positional: "0, 100"
    const parts = content.split(',').map((p) => p.trim());
    if (parts.length >= 1 && parts[0]) range.min = parseFloat(parts[0]);
    if (parts.length >= 2 && parts[1]) range.max = parseFloat(parts[1]);
  }

  return range;
}

/**
 * Parse object properties from content like "id: string, name: string"
 */
function parseObjectProperties(content: string): SchemaField[] {
  if (!content.trim()) return [];

  const fields = splitByCommaRespectingNesting(content);
  return fields
    .map((field) => {
      const trimmedField = field.trim();
      if (!trimmedField) return null;

      const colonIdx = trimmedField.indexOf(':');
      if (colonIdx === -1) return null;

      const fieldName = trimmedField.slice(0, colonIdx).trim();
      const fieldTypeSpec = trimmedField.slice(colonIdx + 1).trim();

      return typeSpecToSchemaField(fieldName, fieldTypeSpec);
    })
    .filter((f): f is SchemaField => f !== null);
}

/**
 * Split a string by commas, respecting nested structures
 */
function splitByCommaRespectingNesting(content: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of content) {
    if (char === '{' || char === '<' || char === '(') {
      depth++;
      current += char;
    } else if (char === '}' || char === '>' || char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current);
  }

  return result;
}
