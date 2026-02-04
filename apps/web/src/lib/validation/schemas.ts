import { z } from 'zod';

// ============================================================================
// Common Patterns
// ============================================================================

export const uuidSchema = z.string().uuid();
export const slugSchema = z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens');
export const nameSchema = z.string().min(1).max(255).trim();
export const descriptionSchema = z.string().max(5000).optional();
export const urlSchema = z.string().url();
export const emailSchema = z.string().email();

// ============================================================================
// BAL Code Validation
// ============================================================================

const FORBIDDEN_BAL_PATTERNS = [
  'process.',
  'require(',
  'import(',
  '__proto__',
  'constructor',
  'eval(',
  'Function(',
];

export const balCodeSchema = z.string()
  .min(1, 'BAL code is required')
  .max(100000, 'BAL code exceeds maximum size') // 100KB max
  .refine(
    (code) => !FORBIDDEN_BAL_PATTERNS.some(pattern => code.includes(pattern)),
    'BAL code contains forbidden patterns'
  );

// ============================================================================
// Execution Schemas
// ============================================================================

export const executionTriggerSchema = z.enum(['manual', 'api', 'webhook', 'schedule']);

export const executionInputSchema = z.object({
  input: z.unknown().optional(),
  triggeredBy: executionTriggerSchema.default('manual'),
  triggerSource: z.string().max(1000).optional(),
});

// ============================================================================
// Webhook Schemas
// ============================================================================

export const webhookPayloadSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.unknown(),
  timestamp: z.string().datetime().optional(),
});

export const webhookHeadersSchema = z.record(z.string()).optional();

// ============================================================================
// Flow Schemas
// ============================================================================

export const flowNodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: flowNodePositionSchema,
  data: z.record(z.unknown()),
});

export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

export const flowDefinitionSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});

// ============================================================================
// BaleyBot Schemas
// ============================================================================

export const baleybotCreateSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  icon: z.string().max(50).optional(),
  balCode: balCodeSchema.optional(),
});

export const baleybotUpdateSchema = z.object({
  id: uuidSchema,
  name: nameSchema.optional(),
  description: descriptionSchema,
  icon: z.string().max(50).optional(),
  balCode: balCodeSchema.optional(),
  status: z.enum(['draft', 'active', 'paused']).optional(),
});

// ============================================================================
// Connection Schemas
// ============================================================================

export const connectionTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'azure',
  'custom',
]);

export const connectionCreateSchema = z.object({
  name: nameSchema,
  type: connectionTypeSchema,
  config: z.record(z.unknown()),
  isDefault: z.boolean().default(false),
});

// ============================================================================
// Pagination Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Filter/Sort Schemas
// ============================================================================

export const sortOrderSchema = z.enum(['asc', 'desc']);

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
