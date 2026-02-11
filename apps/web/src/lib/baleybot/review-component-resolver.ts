/**
 * Review Component Resolver
 *
 * Determines which interactive components to show on the Review page
 * based on bot metadata (entities, triggers, topology).
 */

import type { TriggerConfig } from './types';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewComponentType =
  | 'chat_interface'
  | 'file_upload'
  | 'structured_form'
  | 'result_view'
  | 'execution_flow'
  | 'webhook_tester';

export interface ReviewComponentConfig {
  type: ReviewComponentType;
  id: string;
  label: string;
  props: Record<string, unknown>;
  priority: number;
}

// ============================================================================
// RESOLVER
// ============================================================================

export function resolveReviewComponents(args: {
  entities: Array<{ name: string; tools: string[]; purpose: string }>;
  triggerConfig?: TriggerConfig;
  topology: string; // 'single' | 'chain' | 'parallel' | 'complex'
}): ReviewComponentConfig[] {
  const components: ReviewComponentConfig[] = [];

  // Always show chat interface as primary interaction
  components.push({
    type: 'chat_interface',
    id: 'chat-main',
    label: 'Chat',
    props: {},
    priority: 10,
  });

  // File upload for file_upload triggers
  if (args.triggerConfig?.type === 'file_upload') {
    components.push({
      type: 'file_upload',
      id: 'file-upload',
      label: 'File Upload',
      props: {
        acceptedMimeTypes: args.triggerConfig.acceptedMimeTypes,
        maxFileSizeMb: args.triggerConfig.maxFileSizeMb,
        multiple: args.triggerConfig.multiple,
        payloadMode: args.triggerConfig.payloadMode,
      },
      priority: 20,
    });
  }

  // Webhook tester for webhook triggers
  if (args.triggerConfig?.type === 'webhook' && args.triggerConfig.webhookPath) {
    components.push({
      type: 'webhook_tester',
      id: 'webhook-tester',
      label: 'Webhook Tester',
      props: {
        webhookPath: args.triggerConfig.webhookPath,
      },
      priority: 25,
    });
  }

  // Structured form if any entity has output schema (indicating structured I/O)
  const hasOutputSchema = args.entities.some(
    (e) => e.tools.includes('store_memory') || e.purpose.toLowerCase().includes('form')
  );
  if (hasOutputSchema) {
    components.push({
      type: 'structured_form',
      id: 'structured-form',
      label: 'Structured Input',
      props: {},
      priority: 30,
    });
  }

  // Execution flow for multi-entity bots
  if (args.topology !== 'single' && args.entities.length > 1) {
    components.push({
      type: 'execution_flow',
      id: 'execution-flow',
      label: 'Execution Flow',
      props: {},
      priority: 70,
    });
  }

  // Always show result view
  components.push({
    type: 'result_view',
    id: 'result-main',
    label: 'Result',
    props: {},
    priority: 80,
  });

  // Sort by priority (lowest first = highest priority)
  return components.sort((a, b) => a.priority - b.priority);
}
