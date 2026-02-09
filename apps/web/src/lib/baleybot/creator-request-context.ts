import {
  and,
  baleybots,
  connections,
  eq,
  notDeleted,
  tools,
  type Database,
} from '@baleyui/db';
import { getBuiltInToolDefinitions } from '@/lib/baleybot';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import type { GeneratorContext } from '@/lib/baleybot/types';
import { sanitizeCreatorText } from '@/lib/baleybot/creator-sanitization';

const CREATOR_HISTORY_MAX_MESSAGES = 40;
const CREATOR_HISTORY_MAX_CHARS = 12000;

export interface CreatorConversationHistoryInput {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date | string;
  metadata?: Record<string, unknown>;
}

export interface CreatorRequestContextResult {
  sanitizedMessage: string;
  conversationHistory: CreatorMessage[];
  context: GeneratorContext;
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function getModelConversationContent(message: {
  content: string;
  metadata?: Record<string, unknown>;
}): string {
  const discoveryIntake = message.metadata?.discoveryIntake;
  if (discoveryIntake && typeof discoveryIntake === 'object') {
    const modelMessage = (discoveryIntake as Record<string, unknown>).modelMessage;
    if (typeof modelMessage === 'string' && modelMessage.trim().length > 0) {
      return modelMessage;
    }
  }
  return message.content;
}

function truncateModelContent(value: string): string {
  const sanitized = sanitizeCreatorText(value);
  if (sanitized.length <= CREATOR_HISTORY_MAX_CHARS) {
    return sanitized;
  }
  return `${sanitized.slice(0, CREATOR_HISTORY_MAX_CHARS - 1).trimEnd()}...`;
}

export async function buildCreatorRequestContext(args: {
  db: Database;
  workspaceId: string;
  message: string;
  conversationHistory?: CreatorConversationHistoryInput[];
}): Promise<CreatorRequestContextResult> {
  const { db, workspaceId, message } = args;

  const [workspaceConnections, existingBaleybots, workspaceCustomTools] =
    await Promise.all([
      db.query.connections.findMany({
        where: and(eq(connections.workspaceId, workspaceId), notDeleted(connections)),
      }),
      db.query.baleybots.findMany({
        where: and(eq(baleybots.workspaceId, workspaceId), notDeleted(baleybots)),
        columns: {
          id: true,
          name: true,
          description: true,
          icon: true,
        },
      }),
      db.query.tools.findMany({
        where: and(eq(tools.workspaceId, workspaceId), notDeleted(tools)),
        columns: { name: true, description: true, inputSchema: true },
      }),
    ]);

  const builtInTools = getBuiltInToolDefinitions();

  const allAvailableTools = [
    ...builtInTools,
    ...workspaceCustomTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool.inputSchema as Record<string, unknown>) || {},
      category: 'custom' as const,
    })),
  ];

  const formattedConnections = workspaceConnections.map((connection) => ({
    id: connection.id,
    type: connection.type,
    name: connection.name,
    status: connection.status ?? 'unknown',
    isDefault: connection.isDefault ?? false,
    availableModels: connection.availableModels,
  }));

  const formattedBaleybots = existingBaleybots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    description: bot.description ?? null,
    icon: bot.icon ?? null,
    status: 'active' as const,
    executionCount: 0,
    lastExecutedAt: null,
  }));

  const recentConversation = (args.conversationHistory ?? []).slice(
    -CREATOR_HISTORY_MAX_MESSAGES
  );

  const conversationHistory: CreatorMessage[] = recentConversation.map(
    (historyMessage) => ({
      id: historyMessage.id,
      role: historyMessage.role,
      content: truncateModelContent(getModelConversationContent(historyMessage)),
      timestamp: toDate(historyMessage.timestamp),
      ...(historyMessage.metadata
        ? { metadata: historyMessage.metadata as CreatorMessage['metadata'] }
        : {}),
    })
  );

  return {
    sanitizedMessage: sanitizeCreatorText(message),
    conversationHistory,
    context: {
      workspaceId,
      availableTools: allAvailableTools,
      workspacePolicies: null,
      connections: formattedConnections,
      existingBaleybots: formattedBaleybots,
    },
  };
}
