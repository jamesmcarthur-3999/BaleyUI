# Code Generation Quick Start

## Basic Usage

### 1. Generate Code from UI

```tsx
import { GenerateCodeDialog } from '@/components/codegen';

<GenerateCodeDialog
  blockId="your-block-id"
  blockName="YourBlockName"
  outputSchema={{ field: 'string' }}
/>
```

### 2. Use tRPC Directly

```tsx
// Generate
const { mutate: generate } = trpc.codegen.generateCode.useMutation({
  onSuccess: (result) => {
    console.log('Generated code:', result.code);
    console.log('Coverage:', result.coveredPatterns, '/', result.totalPatterns);
  }
});

generate({
  blockId: 'block-uuid',
  blockName: 'MyBlock',
  outputSchema: { approved: 'boolean', reason: 'string' },
  minConfidence: 0.5
});

// Test
const { mutate: test } = trpc.codegen.testCode.useMutation({
  onSuccess: (result) => {
    console.log('Accuracy:', result.accuracy, '%');
    console.log('Tested:', result.totalTested);
    console.log('Correct:', result.correctCount);
  }
});

test({
  blockId: 'block-uuid',
  code: generatedCode
});

// Save
const { mutate: save } = trpc.codegen.saveGeneratedCode.useMutation({
  onSuccess: () => {
    console.log('Code saved to block!');
  }
});

save({
  blockId: 'block-uuid',
  code: generatedCode
});
```

### 3. Programmatic Code Generation

```typescript
import { generateCode } from '@/lib/codegen/code-generator';

const patterns = [
  {
    id: 'p1',
    type: 'threshold',
    condition: 'score > 750',
    conditionAst: { field: 'score', operator: '>', threshold: 750 },
    outputValue: { approved: true },
    confidence: 0.92,
    supportCount: 45
  }
];

const result = generateCode(patterns, {
  blockName: 'CreditApproval',
  outputSchema: { approved: 'boolean' },
  includeComments: true,
  minConfidence: 0.5
});

console.log(result.code);
```

## Pattern Types

### Threshold
```typescript
{
  type: 'threshold',
  conditionAst: {
    field: 'age',
    operator: '>',
    threshold: 18
  }
}
// Generates: if (input.age > 18)
```

### Set Membership
```typescript
{
  type: 'set_membership',
  conditionAst: {
    field: 'status',
    values: ['active', 'pending']
  }
}
// Generates: if (['active', 'pending'].includes(input.status))
```

### Exact Match
```typescript
{
  type: 'exact_match',
  conditionAst: {
    field: 'country',
    value: 'US'
  }
}
// Generates: if (input.country === 'US')
```

### Compound
```typescript
{
  type: 'compound',
  conditionAst: {
    operator: '&&',
    conditions: [
      { field: 'age', operator: '>', threshold: 18 },
      { field: 'verified', value: true }
    ]
  }
}
// Generates: if ((input.age > 18) && (input.verified === true))
```

## API Reference

### generateCode()
```typescript
generateCode(
  patterns: DetectedPattern[],
  options: {
    blockName: string;
    outputSchema: object;
    includeComments?: boolean;
    minConfidence?: number;
  }
): GeneratedCodeResult
```

### testGeneratedCode()
```typescript
testGeneratedCode(
  blockId: string,
  code: string,
  db: DrizzleDB
): Promise<HistoricalTestResult>
```

## Common Patterns

### Pattern Confidence Threshold
```typescript
// Only use high-confidence patterns
generateCode(patterns, {
  blockName: 'MyBlock',
  outputSchema: {},
  minConfidence: 0.8 // 80%+ confidence
});
```

### Custom Output Schema
```typescript
generateCode(patterns, {
  blockName: 'MyBlock',
  outputSchema: {
    approved: 'boolean',
    reason: 'string',
    score: 'number',
    metadata: {
      timestamp: 'string',
      reviewer: 'string'
    }
  }
});
```

### Testing with Custom Threshold
```typescript
const result = await testGeneratedCode(blockId, code, db);

if (result.accuracy >= 90) {
  console.log('Excellent! Safe to deploy.');
} else if (result.accuracy >= 70) {
  console.log('Good, but review mismatches.');
} else {
  console.log('Poor accuracy. Extract more patterns.');
}
```

## Workflow

1. **Extract Patterns** (Phase 4.1)
   ```
   Run AI decisions → Patterns detected automatically
   ```

2. **Generate Code**
   ```typescript
   trpc.codegen.generateCode.mutate({ blockId, blockName, outputSchema })
   ```

3. **Test Code**
   ```typescript
   trpc.codegen.testCode.mutate({ blockId, code })
   ```

4. **Review Results**
   ```
   Check accuracy, review mismatches, verify patterns
   ```

5. **Deploy Code**
   ```typescript
   trpc.codegen.saveGeneratedCode.mutate({ blockId, code })
   ```

## Best Practices

1. **Always test** before deploying
2. **Aim for 80%+** accuracy
3. **Review mismatches** to understand edge cases
4. **Use high confidence** patterns (70%+)
5. **Regenerate** as new patterns emerge

## Troubleshooting

**No patterns available**
```typescript
// Check status first
const status = await trpc.codegen.getGenerationStatus.query({ blockId });
console.log('Pattern count:', status.patternCount);
```

**Low accuracy**
```typescript
// Increase confidence threshold
generateCode(patterns, {
  blockName: 'MyBlock',
  outputSchema: {},
  minConfidence: 0.8 // Higher threshold
});
```

**Code validation failed**
```typescript
import { validateGeneratedCode } from '@/lib/codegen/code-generator';

const validation = validateGeneratedCode(code);
if (!validation.valid) {
  console.error('Errors:', validation.errors);
}
```
