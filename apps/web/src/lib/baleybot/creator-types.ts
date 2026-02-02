/**
 * Creation Session Types
 *
 * Type definitions for the conversational BaleyBot creation experience.
 * These types support the visual assembly canvas, real-time streaming,
 * and the floating chat interface.
 */

import { z } from 'zod';

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
// MESSAGE TYPES
// ============================================================================

/**
 * Role in the creation conversation
 */
export type MessageRole = 'user' | 'assistant';

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
 * Type of streaming chunk from the creator AI
 */
export type CreatorStreamChunkType =
  | 'thinking'
  | 'entity_add'
  | 'entity_remove'
  | 'connection_add'
  | 'connection_remove'
  | 'status'
  | 'complete'
  | 'error';

/**
 * A streaming chunk from the creator AI.
 * Used to progressively update the canvas as the AI builds the bot.
 */
export interface CreatorStreamChunk {
  /** Type of the chunk */
  type: CreatorStreamChunkType;
  /** Payload data (varies by type) */
  data: unknown;
}

// ============================================================================
// AI OUTPUT SCHEMA
// ============================================================================

/**
 * Schema for the creator AI's structured output.
 * Defines the shape of data returned when AI generates/updates a BaleyBot.
 */
export const creatorOutputSchema = z.object({
  /** AI's thinking/reasoning (shown to user) */
  thinking: z.string().optional(),
  /** Entities to create/update */
  entities: z.array(
    z.object({
      /** Entity identifier */
      id: z.string(),
      /** Display name */
      name: z.string(),
      /** Icon (emoji or icon name) */
      icon: z.string(),
      /** Purpose/description of the entity */
      purpose: z.string(),
      /** Tools assigned to this entity */
      tools: z.array(z.string()),
    })
  ),
  /** Connections between entities */
  connections: z.array(
    z.object({
      /** Source entity ID */
      from: z.string(),
      /** Target entity ID */
      to: z.string(),
      /** Optional connection label */
      label: z.string().optional(),
    })
  ),
  /** Generated BAL code */
  balCode: z.string(),
  /** Suggested name for the BaleyBot */
  name: z.string(),
  /** Suggested icon (emoji) */
  icon: z.string(),
  /** Creation status */
  status: z.enum(['building', 'ready']),
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
export function createSession(workspaceId: string, baleybotId?: string): CreationSession {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    baleybotId: baleybotId ?? null,
    workspaceId,
    messages: [],
    canvasState: createInitialCanvasState(),
    name: null,
    icon: null,
    createdAt: now,
    updatedAt: now,
  };
}
