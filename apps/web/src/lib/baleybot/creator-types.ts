/**
 * Creation Session Types
 *
 * Type definitions for the conversational BaleyBot creation experience.
 * These types support the visual assembly canvas, real-time streaming,
 * and the floating chat interface.
 */

import { z } from 'zod';
import type { BalSkillId } from './bal-skills';

// ============================================================================
// VISUAL ENTITY TYPES
// ============================================================================

/**
 * Status of a visual entity on the canvas
 */
export type EntityStatus = 'appearing' | 'stable' | 'removing';

/**
 * Position of an entity on the canvas
 */
export interface EntityPosition {
  x: number;
  y: number;
}

/**
 * A visual entity rendered on the creation canvas.
 * Represents an AI agent within the BaleyBot being built.
 */
export interface VisualEntity {
  /** Unique identifier for the entity */
  id: string;
  /** Display name of the entity */
  name: string;
  /** Icon for the entity (emoji or icon name) */
  icon: string;
  /** Description of what this entity does */
  purpose: string;
  /** Tools assigned to this entity */
  tools: string[];
  /** Position on the canvas */
  position: EntityPosition;
  /** Current animation/display status */
  status: EntityStatus;
}

// ============================================================================
// CONNECTION TYPES
// ============================================================================

/**
 * Status of a connection between entities
 */
export type ConnectionStatus = 'drawing' | 'stable' | 'removing';

/**
 * A connection between two entities on the canvas.
 * Represents data flow or control flow between agents.
 */
export interface Connection {
  /** Unique identifier for the connection */
  id: string;
  /** ID of the source entity */
  from: string;
  /** ID of the target entity */
  to: string;
  /** Optional label describing the connection */
  label?: string;
  /** Current animation/display status */
  status: ConnectionStatus;
}

// ============================================================================
// BUILDER EXPERIENCE TYPES
// ============================================================================

/**
 * Presentation mode for the visual builder.
 * - simple: novice-first labels and guided setup
 * - advanced: exposes low-level and power-user controls
 */
export type BuilderPresentationMode = 'simple' | 'advanced';

/**
 * Guided trigger setup steps for novice-first trigger configuration.
 */
export type TriggerSetupStep = 'start' | 'input' | 'review';

/**
 * UI state snapshot for builder presentation and trigger setup flow.
 */
export interface BuilderExperienceState {
  mode: BuilderPresentationMode;
  triggerStep: TriggerSetupStep;
  showAdvancedTriggerTypes: boolean;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * Role in the creation conversation
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Structured metadata attached to assistant messages for rich rendering
 */
export interface MessageMetadata {
  /** Entities created or modified in this response */
  entities?: Array<{
    id: string;
    name: string;
    icon: string;
    tools: string[];
    isNew: boolean;
  }>;
  /** Whether this is an initial creation or an update */
  isInitialCreation?: boolean;
  /** Whether this message represents an error */
  isError?: boolean;

  /** BAL composition/capability patterns detected in generated code */
  balSkills?: BalSkillId[];

  // -- Rich Chat Components -------------------------------------------------

  /** Interactive option cards for user choices */
  options?: Array<{
    id: string;
    label: string;
    description: string;
    icon?: string;
  }>;

  /** Test plan card with test cases and results */
  testPlan?: {
    tests: Array<{
      id: string;
      name: string;
      level: 'unit' | 'integration' | 'e2e';
      status: 'pending' | 'running' | 'passed' | 'failed';
      input?: string;
      expectedOutput?: string;
      actualOutput?: string;
      error?: string;
    }>;
    summary?: string;
    topology?: string;
  };

  /** Connection status indicators */
  connectionStatus?: {
    connections: Array<{
      name: string;
      type: string;
      status: 'connected' | 'missing' | 'error';
      requiredBy?: string[];
    }>;
  };

  /** Diagnostic card with warnings/suggestions */
  diagnostic?: {
    level: 'info' | 'warning' | 'error' | 'success';
    title: string;
    details?: string;
    suggestions?: string[];
  };

  /** Code block with language and copy support */
  codeBlock?: {
    language: string;
    code: string;
    filename?: string;
  };

  /** Progress indicator for multi-step operations */
  progress?: {
    current: number;
    total: number;
    label: string;
    steps?: Array<{
      name: string;
      status: 'pending' | 'running' | 'complete' | 'error';
    }>;
  };

  /** Creator workflow stage and handoff guidance */
  creatorLifecycle?: {
    stage: 'discovery' | 'design' | 'connections' | 'testing' | 'launch' | 'review';
    whatIDid?: string;
    nextStage?: string;
    nextAction?: string;
    iteration?: number;
    blockerMode?: 'none' | 'soft' | 'hard';
    runnableConfidence?: number;
    assumptions?: Array<{
      id: string;
      label: string;
      value: string;
      confidence: 'low' | 'medium' | 'high';
      requiresConfirmation?: boolean;
    }>;
    requiredQuestions?: Array<{
      id: string;
      label: string;
      description: string;
      requiredNow?: boolean;
    }>;
    optionalQuestions?: Array<{
      id: string;
      label: string;
      description: string;
      requiredNow?: boolean;
    }>;
    /** Adaptive discovery plan ledger for chat-first ideation */
    planLedger?: CreatorPlanLedger;
    /** Open decisions still needed before fully runnable execution */
    openDecisions?: CreatorPlanDecision[];
    /** Decisions already resolved from conversation */
    resolvedDecisions?: CreatorPlanDecision[];
    /** Next focused question the creator will ask */
    nextQuestion?: CreatorPlanDecision | null;
  };

  /** User-submitted discovery intake summary for chat rendering/retry */
  discoveryIntake?: {
    requiredTotal: number;
    requiredProvided: number;
    optionalProvided: number;
    answers: Array<{
      id: string;
      label: string;
      valuePreview: string;
      requiredNow: boolean;
      isSensitive: boolean;
    }>;
    additionalContext?: string;
    modelMessage?: string;
  };

  /** Compact streaming summary after completion */
  streamSummary?: string;
}

// ============================================================================
// CREATOR GUIDANCE + PLAN LEDGER TYPES
// ============================================================================

export interface CreatorGuidanceAction {
  label: string;
  prompt: string;
  mode?: 'send' | 'insert';
  reason?: string;
  priority?: number;
}

export interface CreatorPlanDecision {
  id: string;
  label: string;
  description: string;
  requiredNow?: boolean;
}

export interface CreatorPlanLedger {
  goal?: string;
  stage?: string;
  resolvedDecisions: CreatorPlanDecision[];
  openDecisions: CreatorPlanDecision[];
  assumptions: Array<{
    id: string;
    label: string;
    value: string;
    confidence: 'low' | 'medium' | 'high';
    requiresConfirmation?: boolean;
  }>;
  nextQuestion?: CreatorPlanDecision | null;
  runnableConfidence?: number;
  updatedAt: number;
}

export interface CreatorPlanDelta {
  summary: string;
  goal?: string;
  stage?: string;
  resolvedDecisions?: CreatorPlanDecision[];
  openDecisions?: CreatorPlanDecision[];
  assumptions?: CreatorPlanLedger['assumptions'];
  nextQuestion?: CreatorPlanDecision | null;
  runnableConfidence?: number;
}

export interface CreatorToolActivity {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  timestamp: number;
}

/**
 * A message in the creation session chat history.
 * Used for the floating chat interface during bot creation.
 */
export interface CreatorMessage {
  /** Unique identifier for the message */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message content */
  content: string;
  /** When the message was sent */
  timestamp: Date;
  /** AI reasoning/thought process (expandable) */
  thinking?: string;
  /** Rich metadata for visual rendering */
  metadata?: MessageMetadata;
}

// ============================================================================
// CANVAS STATE TYPES
// ============================================================================

/**
 * Status of the creation session state machine.
 * Tracks the overall state of the bot being built.
 */
export type CreationStatus = 'empty' | 'building' | 'ready' | 'running' | 'error';

/**
 * State of the visual canvas.
 * Contains all entities, connections, and the generated BAL code.
 */
export interface CanvasState {
  /** Entities currently on the canvas */
  entities: VisualEntity[];
  /** Connections between entities */
  connections: Connection[];
  /** Generated BAL code */
  balCode: string;
  /** Current state of the creation */
  status: CreationStatus;
  /** Error message if status is 'error' */
  error?: string;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * A creation session for building a BaleyBot.
 * Persists the conversation and canvas state during the creation process.
 */
export interface CreationSession {
  /** Unique identifier for the session */
  id: string;
  /** ID of the BaleyBot being created/edited (null if new) */
  baleybotId: string | null;
  /** Workspace this session belongs to */
  workspaceId: string;
  /** Conversation history with the AI */
  messages: CreatorMessage[];
  /** Current state of the visual canvas */
  canvasState: CanvasState;
  /** Name of the BaleyBot (null until assigned) */
  name: string | null;
  /** Icon for the BaleyBot (null until assigned) */
  icon: string | null;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last updated */
  updatedAt: Date;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * A streaming chunk from the creator AI.
 * Used to progressively update the canvas as the AI builds the bot.
 * Discriminated union for type-safe streaming.
 */
export type CreatorStreamChunk =
  | { type: 'status'; data: { message: string } }
  | { type: 'thinking'; data: { content: string } }
  | { type: 'entity'; data: Omit<VisualEntity, 'position' | 'status'> }
  | { type: 'entity_remove'; data: { id: string } }
  | { type: 'connection'; data: Omit<Connection, 'status'> }
  | { type: 'connection_remove'; data: { id: string } }
  | { type: 'complete'; data: CreatorOutput }
  | { type: 'error'; data: { message: string; code?: string } };

/**
 * Real-time progress tracking during bot creation.
 * Replaces fake phase cycling with actual creation state.
 */
export interface CreationProgress {
  phase: 'understanding' | 'designing' | 'connecting' | 'generating' | 'complete';
  message: string;
  entitiesCreated?: number;
  connectionsCreated?: number;
}

// ============================================================================
// AI OUTPUT SCHEMA
// ============================================================================

/**
 * Schema for the creator AI's structured output.
 * Defines the shape of data returned when AI generates/updates a BaleyBot.
 */
const creatorEntitySchema = z.object({
  /** Entity identifier — auto-generated if any validation fails */
  id: z.string().min(1).catch(() => crypto.randomUUID()),
  /** Display name — falls back if null/missing */
  name: z.string().min(1).catch('Unnamed Entity'),
  /** Icon (emoji or icon name) — catches null, wrong type, empty */
  icon: z.string().min(1).catch('🤖'),
  /** Purpose/description of the entity */
  purpose: z.string().catch(''),
  /** Tools assigned to this entity */
  tools: z.array(z.string()).catch([]),
});

const creatorConnectionSchema = z.object({
  /** Source entity ID */
  from: z.string().catch(''),
  /** Target entity ID */
  to: z.string().catch(''),
  /** Optional connection label */
  label: z.string().optional().catch(undefined),
});

const creatorDiscoveryQuestionSchema = z.object({
  id: z.string().min(1).catch(() => crypto.randomUUID()),
  label: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional().catch(undefined),
  /** True when this detail is required before generation can continue */
  requiredNow: z.boolean().optional().catch(undefined),
});

const creatorAssumptionSchema = z.object({
  id: z.string().min(1).catch(() => crypto.randomUUID()),
  label: z.string().min(1).catch('Assumption'),
  value: z.string().min(1).catch('Use safe defaults'),
  confidence: z.enum(['low', 'medium', 'high']).optional().catch('medium'),
  requiresConfirmation: z.boolean().optional().catch(undefined),
});

export const creatorOutputSchema = z.object({
  /** AI's thinking/reasoning (shown to user) */
  thinking: z.string().optional().catch(undefined),
  /** Primary assistant message to show in chat */
  message: z.string().optional().catch(undefined),
  /** Follow-up questions when additional discovery is required */
  questions: z.array(creatorDiscoveryQuestionSchema).max(8).optional().catch(undefined),
  /** Assumptions made when proceeding with partial discovery context */
  assumptions: z.array(creatorAssumptionSchema).max(8).optional().catch(undefined),
  /** Estimated confidence that this design is runnable */
  runnableConfidence: z.number().min(0).max(1).optional().catch(undefined),
  /** Whether discovery still has hard blockers vs soft follow-ups */
  blockMode: z.enum(['none', 'soft', 'hard']).optional().catch(undefined),
  /** Entities to create/update */
  entities: z.array(creatorEntitySchema).catch([]),
  /** Connections between entities — defaults to empty if missing/null */
  connections: z.array(creatorConnectionSchema).catch([]),
  /** Generated BAL code (required only when status is ready) */
  balCode: z.string().catch(''),
  /** Suggested name for the BaleyBot */
  name: z.string().catch('Unnamed BaleyBot'),
  /** Auto-generated description of what the bot does */
  description: z.string().max(200).catch(''),
  /** Suggested icon (emoji) — catches invalid values */
  icon: z.string().catch('🤖'),
  /** Creation status — catches unexpected values like "complete" */
  status: z.enum(['building', 'ready']).catch('ready'),
}).superRefine((data, ctx) => {
  if (data.status === 'ready') {
    if (data.entities.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one entity is required when status is ready',
        path: ['entities'],
      });
    }
    if (!data.balCode.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'BAL code is required when status is ready',
        path: ['balCode'],
      });
    }
    if (!data.name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Name is required when status is ready',
        path: ['name'],
      });
    }
  }

  if (data.status === 'building') {
    const hasDiscoveryPrompt =
      Boolean(data.message?.trim()) ||
      Boolean(data.thinking?.trim()) ||
      Boolean(data.questions && data.questions.length > 0);

    if (!hasDiscoveryPrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Building responses must include a prompt, message, or follow-up questions',
        path: ['message'],
      });
    }
  }
});

/**
 * Inferred type from the creator output schema.
 * Used for type-safe handling of AI responses.
 */
export type CreatorOutput = z.infer<typeof creatorOutputSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an initial empty canvas state
 */
export function createInitialCanvasState(): CanvasState {
  return {
    entities: [],
    connections: [],
    balCode: '',
    status: 'empty',
  };
}

/**
 * Create a new creation session
 */
export function createSession(
  workspaceId: string,
  baleybotId: string | null = null
): CreationSession {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    baleybotId,
    workspaceId,
    messages: [],
    canvasState: createInitialCanvasState(),
    name: null,
    icon: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Re-export readiness types for convenience
export type { ReadinessState, ReadinessDimension, DimensionStatus, AdaptiveTab, RecommendedAction } from './readiness';
export { computeReadiness, createInitialReadiness, countCompleted, getVisibleTabs, getRecommendedAction } from './readiness';
