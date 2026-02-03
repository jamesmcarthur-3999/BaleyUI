/**
 * Type definitions for trigger-related data structures.
 */

/**
 * Base trigger configuration.
 */
export interface TriggerConfig {
  type: 'manual' | 'webhook' | 'schedule' | 'api';
  enabled?: boolean;
  createdAt?: string;
}

/**
 * Webhook trigger configuration.
 */
export interface WebhookTrigger extends TriggerConfig {
  type: 'webhook';
  secret?: string;
  signingSecret?: string;
  webhookPath?: string;
}

/**
 * Schedule trigger configuration.
 */
export interface ScheduleTrigger extends TriggerConfig {
  type: 'schedule';
  schedule: string;
  timezone?: string;
}

/**
 * Manual trigger configuration.
 */
export interface ManualTrigger extends TriggerConfig {
  type: 'manual';
  userId?: string;
}

/**
 * API trigger configuration.
 */
export interface ApiTrigger extends TriggerConfig {
  type: 'api';
  apiEndpoint?: string;
}

/**
 * Union type for all trigger types.
 */
export type Trigger = WebhookTrigger | ScheduleTrigger | ManualTrigger | ApiTrigger;

/**
 * Type guard to check if a trigger is a webhook trigger.
 */
export function isWebhookTrigger(trigger: unknown): trigger is WebhookTrigger {
  return (
    typeof trigger === 'object' &&
    trigger !== null &&
    'type' in trigger &&
    (trigger as TriggerConfig).type === 'webhook'
  );
}

/**
 * Type guard to check if a trigger is enabled.
 */
export function isEnabledWebhookTrigger(trigger: unknown): trigger is WebhookTrigger {
  return (
    isWebhookTrigger(trigger) &&
    trigger.enabled === true
  );
}

/**
 * Flow node definition for visual flows.
 * Note: Type is optional to accommodate React Flow node defaults
 */
export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Flow edge definition for visual flows.
 * Note: Handles can be null or undefined (React Flow compatibility)
 */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [key: string]: unknown;
}
