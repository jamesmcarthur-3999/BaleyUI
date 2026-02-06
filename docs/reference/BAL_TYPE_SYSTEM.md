# BAL Type System Reference

This document provides a detailed reference for the BAL type system, including type specifications, Zod schema generation, and validation behavior.

## Overview

BAL uses a TypeSpec system to define output schemas. These schemas are:
1. Used to generate structured output constraints for LLMs
2. Converted to Zod schemas for runtime validation
3. Displayed in the visual schema builder UI

## TypeSpec Syntax

### Primitive Types

| TypeSpec | Description | Zod Equivalent |
|----------|-------------|----------------|
| `string` | Text value | `z.string()` |
| `number` | Numeric value | `z.number()` |
| `boolean` | True/false | `z.boolean()` |

### String Enum

Restrict a string to specific values.

**Syntax:**
```
enum('value1', 'value2', 'value3')
```

**Examples:**
```bal
"status": "enum('active', 'inactive', 'pending')"
"priority": "enum('low', 'medium', 'high', 'critical')"
"color": "enum('red', 'green', 'blue')"
```

**Zod Equivalent:**
```typescript
z.enum(['active', 'inactive', 'pending'])
```

### Number with Range

Constrain a number to a specific range.

**Syntax:**
```
number                    # Any number
number(min, max)          # Positional: min and max
number(min: X)            # Named: minimum only
number(max: Y)            # Named: maximum only
number(min: X, max: Y)    # Named: both bounds
```

**Examples:**
```bal
"score": "number(0, 100)"
"percentage": "number(0, 1)"
"temperature": "number(min: -40, max: 120)"
"count": "number(min: 0)"
"rating": "number(1, 5)"
```

**Zod Equivalent:**
```typescript
z.number().min(0).max(100)
```

### Array Type

A list of elements of a specific type.

**Syntax:**
```
array                     # Array of any type (defaults to string)
array<elementType>        # Array of specified element type
```

**Examples:**
```bal
"tags": "array<string>"
"scores": "array<number>"
"flags": "array<boolean>"
"items": "array<object { id: string, name: string }>"
"nested": "array<array<number>>"
```

**Zod Equivalent:**
```typescript
z.array(z.string())
z.array(z.number())
z.array(z.object({ id: z.string(), name: z.string() }))
```

### Object Type

A structured object with named fields.

**Syntax:**
```
object                    # Empty object
object { field: type, ... }
```

**Examples:**
```bal
"user": "object { name: string, email: string }"
"address": "object {
  street: string,
  city: string,
  zip: string,
  country: ?string
}"
"metadata": "object {
  created: string,
  tags: array<string>,
  stats: object { views: number, likes: number }
}"
```

**Zod Equivalent:**
```typescript
z.object({
  name: z.string(),
  email: z.string()
})
```

### Optional Type

Mark a field as optional (may be undefined/null).

**Syntax:**
```
?type                     # Prefix notation
optional(type)            # Function notation
```

**Examples:**
```bal
"nickname": "?string"
"age": "?number"
"metadata": "?object { source: string }"
"tags": "?array<string>"
"status": "optional(enum('active', 'inactive'))"
```

**Zod Equivalent:**
```typescript
z.string().optional()
z.object({ source: z.string() }).optional()
```

## Complex Type Examples

### Nested Objects

```bal
"output": {
  "user": "object {
    profile: object {
      name: string,
      bio: ?string,
      avatar: ?string
    },
    settings: object {
      notifications: boolean,
      theme: enum('light', 'dark', 'system')
    }
  }"
}
```

### Array of Objects

```bal
"output": {
  "results": "array<object {
    id: string,
    score: number(0, 1),
    metadata: ?object {
      source: string,
      timestamp: string
    }
  }>"
}
```

### Mixed Complex Types

```bal
"output": {
  "analysis": "object {
    sentiment: object {
      score: number(-1, 1),
      label: enum('positive', 'negative', 'neutral'),
      confidence: number(0, 1)
    },
    entities: array<object {
      type: enum('person', 'organization', 'location'),
      name: string,
      mentions: number(min: 1)
    }>,
    keywords: array<string>,
    summary: ?string
  }"
}
```

## Zod Schema Generation

BAL TypeSpecs are converted to Zod schemas at runtime for validation.

### Conversion Rules

| TypeSpec | Zod Schema |
|----------|------------|
| `string` | `z.string()` |
| `number` | `z.number()` |
| `number(min, max)` | `z.number().min(min).max(max)` |
| `boolean` | `z.boolean()` |
| `enum('a', 'b')` | `z.enum(['a', 'b'])` |
| `array<T>` | `z.array(zodSchema(T))` |
| `object { f: T }` | `z.object({ f: zodSchema(T) })` |
| `?T` | `zodSchema(T).optional()` |

### Generated Schema Example

For this BAL:
```bal
analyzer {
  "goal": "Analyze text",
  "output": {
    "sentiment": "enum('positive', 'negative', 'neutral')",
    "confidence": "number(0, 1)",
    "keywords": "array<string>",
    "summary": "?string"
  }
}
```

The generated Zod schema is:
```typescript
z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
  summary: z.string().optional()
})
```

## Validation Behavior

### Lenient Mode (Default)

By default, validation is lenient:
- Invalid outputs are logged as warnings
- Execution continues successfully
- Validation results are recorded in execution history

This approach acknowledges that LLMs may occasionally produce non-conforming output.

### Validation Results

After execution, check `result.schemaValidation`:

```typescript
interface SchemaValidationResult {
  valid: boolean;
  issues: Array<{
    path: PropertyKey[];
    message: string;
    code: string;
  }>;
}
```

### Common Validation Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| `invalid_type` | Wrong type returned | Improve goal clarity |
| `invalid_enum_value` | Value not in enum | Check enum options |
| `too_small` | Number below minimum | Adjust range constraints |
| `too_big` | Number above maximum | Adjust range constraints |
| `unrecognized_keys` | Extra fields in object | Update schema or filter output |

## Visual Schema Builder

The schema builder UI provides visual editing of output schemas.

### Supported Operations

1. **Add Field** - Add a new field with a chosen type
2. **Edit Field** - Change name, type, or constraints
3. **Delete Field** - Remove a field
4. **Reorder** - Drag fields to reorder
5. **Nest** - Add nested fields for objects and arrays

### Type-Specific Controls

| Type | Controls |
|------|----------|
| String | None (simple text) |
| Number | Min/Max range inputs |
| Boolean | None (true/false) |
| Enum | Value list editor |
| Array | Element type selector |
| Object | Nested field editor |

### Bidirectional Sync

Changes in the schema builder automatically:
1. Update the visual representation
2. Generate corresponding TypeSpec
3. Update the BAL code

Similarly, editing BAL code updates the schema builder.

## Type Inference

When no explicit output schema is provided:
1. The LLM returns freeform text/JSON
2. No validation is performed
3. Output is passed as-is to the next step

### When to Define Schemas

**Define schemas when:**
- You need structured, predictable output
- The next step in a chain expects specific fields
- You want runtime validation
- You're building user-facing features

**Skip schemas when:**
- Output is freeform text
- You're prototyping
- The exact structure doesn't matter

## Best Practices

### 1. Start Simple

Begin with basic types and add complexity as needed:

```bal
# Start here
"output": { "result": "string" }

# Evolve to
"output": {
  "result": "string",
  "confidence": "number(0, 1)"
}

# Then to
"output": {
  "result": "string",
  "confidence": "number(0, 1)",
  "alternatives": "?array<string>"
}
```

### 2. Use Enums for Categorical Data

```bal
# Good
"status": "enum('success', 'failure', 'pending')"

# Less predictable
"status": "string"
```

### 3. Constrain Numbers

```bal
# Good - clear bounds
"score": "number(0, 100)"
"probability": "number(0, 1)"

# Less safe - any number
"score": "number"
```

### 4. Make Optional Explicit

```bal
# Clear that bio might be missing
"bio": "?string"

# Unclear if bio could be null
"bio": "string"
```

### 5. Document Complex Schemas

For complex schemas, add comments:

```bal
analyzer {
  "goal": "Analyze customer feedback",
  "output": {
    # Overall sentiment score from -1 (very negative) to 1 (very positive)
    "sentiment": "number(-1, 1)",

    # Key themes identified in the feedback
    "themes": "array<string>",

    # Urgency level for response
    "urgency": "enum('low', 'medium', 'high', 'critical')",

    # Suggested response (if applicable)
    "suggestion": "?string"
  }
}
```

## See Also

- [BAL Language Reference](./BAL_LANGUAGE_REFERENCE.md) - Complete syntax reference
- [Developer Guide](../guides/DEVELOPER_GUIDE.md) - Integration documentation
