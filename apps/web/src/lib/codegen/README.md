# Code Generation System

This directory contains the code generation system that converts detected patterns from AI decisions into TypeScript Deterministic blocks.

## Overview

The code generation system analyzes patterns extracted from historical AI decisions and generates optimized TypeScript code that can handle common cases deterministically, falling back to AI only when patterns don't match.

## Architecture

### Core Components

#### 1. Types (`types.ts`)
Defines the core types used throughout the code generation system:
- `PatternType`: Enum of supported pattern types (threshold, set_membership, compound, exact_match)
- `DetectedPattern`: Structure for detected patterns from AI decisions
- `GeneratedCodeResult`: Result of code generation with metadata
- `HistoricalTestResult`: Results from testing generated code against historical data
- `CodeGenerationOptions`: Configuration options for code generation

#### 2. Template Builder (`template-builder.ts`)
Converts pattern ASTs into TypeScript code:
- `buildConditionCode()`: Converts pattern conditions to JavaScript expressions
- `buildOutputCode()`: Generates return statements from output values
- `buildPatternBlock()`: Creates complete if-statement blocks for patterns
- `buildZodSchema()`: Infers and generates Zod schemas from sample outputs

**Pattern Types Supported:**
- **Threshold**: `input.field > value`
- **Set Membership**: `['a', 'b'].includes(input.field)`
- **Compound**: `(condition1) && (condition2)`
- **Exact Match**: `input.field === value`

#### 3. Code Generator (`code-generator.ts`)
Main service that orchestrates code generation:
- `generateCode()`: Main entry point for generating code from patterns
- `calculateCoverage()`: Calculates pattern coverage percentage
- `validateGeneratedCode()`: Basic syntax validation
- `getPatternStats()`: Analyzes pattern statistics

**Generated Code Structure:**
```typescript
/**
 * AUTO-GENERATED CODE - DO NOT EDIT MANUALLY
 * Generated from X AI decisions
 * Coverage: Y historical cases
 * Average confidence: Z%
 */

import { Deterministic } from '@baleybots/core';
import { z } from 'zod';

const outputSchema = z.object({ ... });

export const blockName = Deterministic.create({
  name: 'blockName-generated',
  processFn: (input: any) => {
    // Pattern 1: condition (confidence%, supportCount cases)
    if (condition1) {
      return { ... };
    }

    // Pattern 2: condition (confidence%, supportCount cases)
    if (condition2) {
      return { ... };
    }

    // No pattern matched - return null to trigger AI fallback
    return null;
  },
  schema: outputSchema
});
```

#### 4. Historical Tester (`historical-tester.ts`)
Tests generated code against historical decisions:
- `testGeneratedCode()`: Runs generated code against past decisions
- `calculateAccuracyMetrics()`: Computes accuracy metrics
- `analyzeMismatches()`: Categorizes mismatch types

**Testing Process:**
1. Fetches up to 1000 recent historical decisions for the block
2. Creates a sandboxed function from the generated code
3. Runs each historical input through the function
4. Compares actual output with expected output
5. Returns accuracy percentage and detailed mismatches

## Usage

### From tRPC Router

```typescript
// Generate code
const result = await trpc.codegen.generateCode.mutate({
  blockId: 'block-uuid',
  blockName: 'MyBlock',
  outputSchema: { field1: 'string', field2: 'number' },
  minConfidence: 0.5,
  includeComments: true
});

// Test code
const testResult = await trpc.codegen.testCode.mutate({
  blockId: 'block-uuid',
  code: result.code
});

// Save code
await trpc.codegen.saveGeneratedCode.mutate({
  blockId: 'block-uuid',
  code: result.code,
  patternIds: ['pattern-1', 'pattern-2']
});
```

### From UI Components

```tsx
import { GenerateCodeDialog } from '@/components/codegen';

<GenerateCodeDialog
  blockId={blockId}
  blockName={blockName}
  outputSchema={outputSchema}
  onCodeSaved={() => console.log('Code saved!')}
/>
```

## UI Components

### CodePreview
Displays generated code with syntax highlighting and metadata:
- Line numbers
- Copy to clipboard button
- Pattern coverage badges
- Generation timestamp

### AccuracyReport
Shows test results with detailed metrics:
- Large accuracy percentage display
- Correct vs mismatch counts
- Expandable mismatch viewer
- Color-coded accuracy indicators

### GenerateCodeDialog
Complete workflow dialog:
1. Shows generation status (available patterns, decisions)
2. Generates code on demand
3. Tests code against history
4. Displays results in tabs
5. Saves code to block

## Configuration

### Minimum Confidence
Set the minimum confidence threshold for patterns to include:
```typescript
minConfidence: 0.5 // Only patterns with 50%+ confidence
```

### Pattern Filtering
Patterns are automatically:
- Filtered by confidence threshold
- Sorted by confidence (highest first)
- Validated for completeness

## Best Practices

1. **Pattern Quality**: Ensure you have high-quality patterns (70%+ confidence) before generating code
2. **Testing**: Always test generated code against historical data before deployment
3. **Coverage**: Aim for 80%+ coverage of historical cases
4. **Accuracy**: Target 90%+ accuracy in historical tests
5. **Review**: Manually review generated code, especially for critical decision logic

## Error Handling

The system handles various error cases:
- No patterns available
- Invalid pattern ASTs
- Code generation failures
- Testing execution errors
- Syntax validation errors

All errors are surfaced through tRPC with descriptive messages.

## Performance

- Code generation is fast (< 1 second for typical cases)
- Historical testing may take longer depending on decision count (up to 1000 decisions tested)
- Generated code executes significantly faster than AI inference (milliseconds vs seconds)

## Future Enhancements

Potential improvements:
- Support for more pattern types (regex, range, nested objects)
- Advanced optimization (pattern merging, dead code elimination)
- Better sandbox execution (vm2, isolated-vm)
- Pattern visualization
- A/B testing framework
- Automatic retraining based on new decisions
