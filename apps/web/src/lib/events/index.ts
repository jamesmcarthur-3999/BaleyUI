/**
 * Event Sourcing
 *
 * Builder event types, storage, and emission.
 */

// Schemas
export {
  ActorSchema,
  UserActorSchema,
  AIActorSchema,
  SystemActorSchema,
  BaseEventSchema,
  BlockCreatedSchema,
  BlockUpdatedSchema,
  BlockDeletedSchema,
  FlowCreatedSchema,
  FlowUpdatedSchema,
  FlowDeletedSchema,
  ConnectionCreatedSchema,
  ConnectionUpdatedSchema,
  ConnectionTestedSchema,
  ConnectionDeletedSchema,
  BuilderEventSchema,
  BUILDER_EVENT_TYPES,
} from './types';

// Types
export type {
  Actor,
  UserActor,
  AIActor,
  SystemActor,
  BaseEvent,
  BlockCreated,
  BlockUpdated,
  BlockDeleted,
  FlowCreated,
  FlowUpdated,
  FlowDeleted,
  ConnectionCreated,
  ConnectionUpdated,
  ConnectionTested,
  ConnectionDeleted,
  BuilderEvent,
  BuilderEventType,
} from './types';

// Type guards
export {
  isBuilderEvent,
  isBlockEvent,
  isFlowEvent,
  isConnectionEvent,
  isToolEvent,
  getEventEntityInfo,
} from './types';

// Event Store
export { eventStore, type StoredEvent, type AppendResult } from './event-store';

// Event Emitter
export { builderEventEmitter } from './event-emitter';

// Middleware
export { emitBuilderEvent, actorFromContext, type EventContext } from './with-events';
