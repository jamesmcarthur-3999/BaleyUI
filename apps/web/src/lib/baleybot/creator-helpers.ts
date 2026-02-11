/**
 * Creator Page Helpers
 *
 * Pure utility functions for the BaleyBot creation and detail page.
 * These have zero React dependencies and can be tested independently.
 */

import type { VisualEntity, CreatorMessage, CreatorGuidanceAction, AdaptiveTab } from './creator-types';
import type { ReadinessState } from './readiness';
import { getVisibleTabs } from './readiness';
import type { ChatQuickPrompt } from '@/components/creator';
import type { BalGraphSidecarMetadata } from './graph/types';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import { sanitizeCreatorConversationHistory } from './creator-sanitization';
import { parseConnectionTool, connectionNameToSlug } from './tools/requirements-scanner';
import { ADVANCED_EDITOR_TABS, POST_DESIGN_TABS, MAX_NAME_LENGTH } from './creator-constants';

export function isAdvancedEditorTab(tab: AdaptiveTab): boolean {
  return ADVANCED_EDITOR_TABS.includes(tab);
}

export function computeAvailableTabs(args: {
  readiness: ReadinessState;
  savedBaleybotId: string | null;
  showAdvancedUI: boolean;
  isDesignReviewRequired: boolean;
}): AdaptiveTab[] {
  const tabs = [...getVisibleTabs(args.readiness)];

  if (args.savedBaleybotId && !tabs.includes('integrate')) {
    tabs.push('integrate');
  }

  const tabsAfterDesignGate = args.isDesignReviewRequired
    ? tabs.filter((tab) => !POST_DESIGN_TABS.includes(tab))
    : tabs;

  return args.showAdvancedUI
    ? tabsAfterDesignGate
    : tabsAfterDesignGate.filter((tab) => !isAdvancedEditorTab(tab));
}

export function truncateName(name: string, maxLength: number = MAX_NAME_LENGTH): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength).trim();
}

export function formatSlugLabel(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function extractSidecarFromStructure(structure: unknown): BalGraphSidecarMetadata | undefined {
  if (!structure || typeof structure !== 'object') return undefined;
  const record = structure as Record<string, unknown>;
  const sidecar = record.sidecar;
  if (!sidecar || typeof sidecar !== 'object') return undefined;
  return sidecar as BalGraphSidecarMetadata;
}

export function buildDerivedGraphSidecar(args: {
  entities: VisualEntity[];
  connections: Array<{ id: string; type: string; name: string; status: string }> | undefined;
  existingSidecar?: BalGraphSidecarMetadata;
}): BalGraphSidecarMetadata | undefined {
  const base = args.existingSidecar;
  const datasourceBindings = [...(base?.datasourceBindings ?? [])];

  const existingBindingKey = new Set(
    datasourceBindings.map(
      (binding) => `${binding.entity}:${binding.connectionId}:${binding.tool}`
    )
  );

  for (const entity of args.entities) {
    for (const tool of entity.tools) {
      const parsed = parseConnectionTool(tool);
      if (!parsed.connectionType || !parsed.connectionSlug) continue;

      const matchingConnection = args.connections?.find(
        (connection) =>
          connection.type === parsed.connectionType &&
          connectionNameToSlug(connection.name) === parsed.connectionSlug
      );

      const connectionId = matchingConnection?.id ?? `${parsed.connectionType}:${parsed.connectionSlug}`;
      const key = `${entity.name}:${connectionId}:${tool}`;
      if (existingBindingKey.has(key)) continue;
      existingBindingKey.add(key);

      datasourceBindings.push({
        entity: entity.name,
        connectionId,
        tool,
        mode: 'read',
        connectionLabel: matchingConnection?.name ?? formatSlugLabel(parsed.connectionSlug),
        connectionType: parsed.connectionType,
      });
    }
  }

  const storageParticipants = args.entities
    .filter((entity) => entity.tools.includes('shared_storage'))
    .map((entity) => entity.name);

  const sharedStorageLinks = [...(base?.sharedStorageLinks ?? [])];
  const existingSharedKey = new Set(
    sharedStorageLinks.map((link) => `${link.producer}:${link.consumer}:${link.keyPattern ?? '*'}`)
  );

  for (const producer of storageParticipants) {
    for (const consumer of storageParticipants) {
      if (producer === consumer) continue;
      const key = `${producer}:${consumer}:*`;
      if (existingSharedKey.has(key)) continue;
      existingSharedKey.add(key);
      sharedStorageLinks.push({
        producer,
        consumer,
        keyPattern: '*',
        required: false,
      });
    }
  }

  const hasAny =
    datasourceBindings.length > 0 ||
    sharedStorageLinks.length > 0 ||
    (base?.spawnBindings?.length ?? 0) > 0;

  if (!hasAny) return undefined;

  return {
    ...base,
    datasourceBindings,
    sharedStorageLinks,
  };
}

export function appendGraphRuntimeEvent(
  events: GraphRuntimeEvent[],
  event: GraphRuntimeEvent,
  maxEvents = 300
): GraphRuntimeEvent[] {
  const next = [...events, event];
  return next.slice(-maxEvents);
}

export function isSameReadiness(a: ReadinessState, b: ReadinessState): boolean {
  return (
    a.designed === b.designed &&
    a.connected === b.connected &&
    a.tested === b.tested &&
    a.integrated === b.integrated &&
    a.monitored === b.monitored
  );
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildCreatorHistoryPayload(messages: CreatorMessage[]) {
  return sanitizeCreatorConversationHistory(
    messages.filter((m) => m.role !== 'system')
  ).map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: message.timestamp,
    metadata: message.metadata as Record<string, unknown> | undefined,
  }));
}

export function buildGuidanceQuickPrompts(
  actions: CreatorGuidanceAction[]
): ChatQuickPrompt[] {
  return actions.slice(0, 3).map((action, index) => ({
    id: `guidance-${index}-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: action.label,
    prompt: action.prompt,
    mode: action.mode ?? 'send',
  }));
}
