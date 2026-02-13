/**
 * Creator Response Handler
 *
 * Pure function that takes a CreatorOutput and previous state, returns a patch
 * describing what to change. The caller applies the patch via setState.
 *
 * This replaces the old `applyCreatorResult` which called 15+ setState calls inline.
 * Now testable without React, and all messages are batched into a single array.
 */

import type {
  CreatorOutput,
  VisualEntity,
  Connection,
  CreatorMessage,
  HistoryState,
} from './creator-types';
import { truncateName } from './creator-helpers';
import { generateChangeSummary, formatChangeSummaryForChat } from './change-summary';

// ============================================================================
// TYPES
// ============================================================================

export interface ApplyResultInput {
  result: CreatorOutput;
  prevEntities: VisualEntity[];
  prevConnections: Connection[];
  prevName: string;
  currentName: string;
  currentIcon: string;
  currentDescription: string;
  streamSummary?: string;
}

export interface ApplyResultPatch {
  /** Only set if changed — undefined means "don't touch" */
  entities?: VisualEntity[];
  connections?: Connection[];
  balCode?: string;
  name?: string;
  icon?: string;
  description?: string;
  /** Messages to APPEND (not replace) to the conversation */
  newMessages: CreatorMessage[];
  /** If set, push this to undo/redo history */
  historyEntry?: { state: HistoryState; label: string };
  /** Whether this was a conversation-only turn (no entities) */
  isConversationOnly: boolean;
  /** Whether this was the first entity creation */
  isInitialCreation: boolean;
  /** Whether to reset design confirmation (triggers design gate) */
  resetDesignConfirmation: boolean;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Pure function: given a CreatorOutput and previous state, returns a patch
 * describing what to change. Caller applies via setState.
 */
export function buildCreatorResultPatch(input: ApplyResultInput): ApplyResultPatch {
  const { result, prevEntities, prevConnections, prevName, currentName, currentIcon, currentDescription, streamSummary } = input;

  // -- Conversation-only turn (building status) --
  if (result.status === 'building') {
    const responseContent = (result.message?.trim() || result.thinking?.trim() || '').replace(
      /\n{3,}/g,
      '\n\n'
    );

    const patch: ApplyResultPatch = {
      newMessages: [],
      isConversationOnly: true,
      isInitialCreation: false,
      resetDesignConfirmation: false,
    };

    // Set name/icon/description only if currently empty
    if (!currentName && result.name && result.name !== 'Unnamed BaleyBot') {
      patch.name = truncateName(result.name);
    }
    if (!currentIcon && result.icon && result.icon !== '\u{1F916}') {
      patch.icon = result.icon;
    }
    if (!currentDescription && result.description) {
      patch.description = result.description;
    }

    if (responseContent) {
      patch.newMessages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(),
        thinking: result.thinking || undefined,
        metadata: {
          streamSummary,
        },
      });
    } else {
      // Model produced nothing — surface as system notice
      patch.newMessages.push({
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: 'No response received. Try rephrasing or simplifying your request.',
        timestamp: new Date(),
        metadata: { isError: true },
      });
    }

    return patch;
  }

  // -- Structured result (ready status) --
  const visualEntities: VisualEntity[] = result.entities.map((entity) => ({
    ...entity,
    position: { x: 0, y: 0 },
    status: 'appearing' as const,
  }));

  const visualConnections: Connection[] = result.connections.map((conn, index) => ({
    id: `conn-${index}`,
    from: conn.from,
    to: conn.to,
    label: conn.label,
    status: 'stable' as const,
  }));

  const truncatedName = truncateName(result.name);
  const isInitialCreation = prevEntities.length === 0;

  // Generate change summary
  const changeSummary = generateChangeSummary(
    prevEntities,
    visualEntities,
    prevConnections,
    visualConnections,
    prevName,
    result.name,
  );
  const summaryText = formatChangeSummaryForChat(changeSummary);

  // Build messages
  const newMessages: CreatorMessage[] = [];

  const modelNarrative = result.message?.trim();
  const responseContent = modelNarrative || summaryText || '';

  const prevEntityIds = new Set(prevEntities.map((entity) => entity.id));
  const entityMetadata = visualEntities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    icon: entity.icon,
    tools: entity.tools,
    isNew: !prevEntityIds.has(entity.id),
  }));

  if (responseContent) {
    newMessages.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: responseContent.trim(),
      timestamp: new Date(),
      thinking: result.thinking || undefined,
      metadata: {
        entities: entityMetadata,
        isInitialCreation,
      },
    });
  }

  // Build notification — "here's what I built" moment
  const entityCount = visualEntities.length;
  const toolCount = new Set(visualEntities.flatMap(e => e.tools ?? [])).size;
  newMessages.push({
    id: crypto.randomUUID(),
    role: 'system' as const,
    content: `Built "${truncateName(result.name)}" \u2014 ${entityCount} step${entityCount !== 1 ? 's' : ''}, ${toolCount} tool${toolCount !== 1 ? 's' : ''}.`,
    timestamp: new Date(),
    metadata: {
      diagnostic: {
        level: 'success',
        title: 'BaleyBot Created',
        details: 'Review in the visual editor or code tab.',
      },
    },
  });

  return {
    entities: visualEntities,
    connections: visualConnections,
    balCode: result.balCode,
    name: truncatedName,
    icon: result.icon,
    description: result.description || undefined,
    newMessages,
    historyEntry: {
      state: {
        entities: visualEntities,
        connections: visualConnections,
        balCode: result.balCode,
        name: truncatedName,
        icon: result.icon,
      },
      label: `AI response: ${truncatedName}`,
    },
    isConversationOnly: false,
    isInitialCreation,
    resetDesignConfirmation: isInitialCreation,
  };
}
