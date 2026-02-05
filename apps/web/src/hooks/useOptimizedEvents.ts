/**
 * Optimized Event Subscription Hook
 *
 * Provides efficient real-time event subscription with:
 * - Automatic reconnection with exponential backoff
 * - Batched updates to reduce re-renders
 * - Event deduplication
 * - Selective subscription filtering
 */

import { useState, useEffect, useRef } from 'react';
import { type BuilderEvent } from '@/lib/events/types';

export interface EventSubscriptionOptions {
  /** Workspace ID to subscribe to */
  workspaceId: string;
  /** Optional event types to filter */
  eventTypes?: BuilderEvent['type'][];
  /** Whether subscription is enabled */
  enabled?: boolean;
  /** Batch interval in ms for grouping updates (default: 50) */
  batchInterval?: number;
  /** Max reconnection attempts (default: 10) */
  maxRetries?: number;
  /** Callback for each event */
  onEvent?: (event: BuilderEvent) => void;
  /** Callback for batch of events */
  onBatch?: (events: BuilderEvent[]) => void;
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
}

export interface EventSubscriptionResult {
  /** Whether currently connected */
  isConnected: boolean;
  /** Whether currently reconnecting */
  isReconnecting: boolean;
  /** Recent events (limited buffer) */
  events: BuilderEvent[];
  /** Last event received */
  lastEvent: BuilderEvent | null;
  /** Reconnection attempt count */
  retryCount: number;
  /** Error from last connection attempt */
  error: Error | null;
  /** Manually reconnect */
  reconnect: () => void;
  /** Disconnect and stop reconnecting */
  disconnect: () => void;
  /** Clear event buffer */
  clearEvents: () => void;
}

const MAX_EVENT_BUFFER = 100;

export function useOptimizedEvents({
  workspaceId,
  eventTypes,
  enabled = true,
  batchInterval = 50,
  maxRetries = 10,
  onEvent,
  onBatch,
  onConnectionChange,
}: EventSubscriptionOptions): EventSubscriptionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [events, setEvents] = useState<BuilderEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<BuilderEvent | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const batchRef = useRef<BuilderEvent[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const retryCountRef = useRef(0);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  // Process batched events
  const processBatch = () => {
    if (batchRef.current.length === 0) return;

    const batch = [...batchRef.current];
    batchRef.current = [];

    // Update events buffer
    setEvents((prev) => {
      const combined = [...prev, ...batch];
      return combined.slice(-MAX_EVENT_BUFFER);
    });

    // Set last event
    const last = batch[batch.length - 1];
    if (last) {
      setLastEvent(last);
    }

    // Trigger callbacks
    batch.forEach((event) => onEvent?.(event));
    onBatch?.(batch);
  };

  // Add event to batch
  const addEventToBatch = (event: BuilderEvent) => {
    // Deduplicate by event ID
    if (seenEventsRef.current.has(event.id)) return;
    seenEventsRef.current.add(event.id);

    // Limit seen events set size
    if (seenEventsRef.current.size > MAX_EVENT_BUFFER * 2) {
      const entries = Array.from(seenEventsRef.current);
      seenEventsRef.current = new Set(entries.slice(-MAX_EVENT_BUFFER));
    }

    // Filter by event type if specified
    if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.type)) {
      return;
    }

    batchRef.current.push(event);

    // Schedule batch processing
    if (!batchTimeoutRef.current) {
      batchTimeoutRef.current = setTimeout(() => {
        batchTimeoutRef.current = null;
        processBatch();
      }, batchInterval);
    }
  };

  // Connect to SSE
  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setError(null);
    setIsReconnecting(false);

    try {
      const url = `/api/events/${workspaceId}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0;
        setRetryCount(0);
        setError(null);
        onConnectionChangeRef.current?.(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as BuilderEvent;
          addEventToBatch(event);
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsConnected(false);
        onConnectionChangeRef.current?.(false);

        // Attempt reconnection with exponential backoff
        if (shouldReconnectRef.current && retryCountRef.current < maxRetries) {
          setIsReconnecting(true);
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);

          reconnectTimeoutRef.current = setTimeout(() => {
            retryCountRef.current += 1;
            setRetryCount(retryCountRef.current);
            connect();
          }, delay);
        } else if (retryCountRef.current >= maxRetries) {
          setError(new Error('Max reconnection attempts reached'));
          setIsReconnecting(false);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsConnected(false);
    }
  };

  // Manual reconnect
  const reconnect = () => {
    shouldReconnectRef.current = true;
    setRetryCount(0);
    connect();
  };

  // Disconnect
  const disconnect = () => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    setIsReconnecting(false);
  };

  // Clear events
  const clearEvents = () => {
    setEvents([]);
    setLastEvent(null);
    batchRef.current = [];
    seenEventsRef.current.clear();
  };

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    shouldReconnectRef.current = true;
    connect();

    return () => {
      disconnect();
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, [enabled, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isReconnecting,
    events,
    lastEvent,
    retryCount,
    error,
    reconnect,
    disconnect,
    clearEvents,
  };
}

/**
 * Event Filter Hook
 *
 * Provides efficient filtering of events by type or entity.
 */
export interface EventFilterOptions {
  events: BuilderEvent[];
  types?: BuilderEvent['type'][];
  entityType?: string;
  entityId?: string;
  actorType?: 'user' | 'ai-agent' | 'system';
  since?: Date;
}

export function useEventFilter({
  events,
  types,
  entityType,
  entityId,
  actorType,
  since,
}: EventFilterOptions): BuilderEvent[] {
  // Memoize filtered events
  const [filteredEvents, setFilteredEvents] = useState<BuilderEvent[]>([]);
  const prevResultRef = useRef<BuilderEvent[]>([]);

  useEffect(() => {
    const filtered = events.filter((event) => {
      // Filter by type
      if (types && types.length > 0 && !types.includes(event.type)) {
        return false;
      }

      // Filter by entity type
      if (entityType) {
        const eventData = event.data as Record<string, unknown>;
        const eventEntityType =
          'blockId' in eventData ? 'block' :
          'flowId' in eventData ? 'flow' :
          'connectionId' in eventData ? 'connection' :
          null;

        if (eventEntityType !== entityType) {
          return false;
        }
      }

      // Filter by entity ID
      if (entityId) {
        const eventData = event.data as Record<string, unknown>;
        const eventEntityId =
          eventData.blockId || eventData.flowId || eventData.connectionId;

        if (eventEntityId !== entityId) {
          return false;
        }
      }

      // Filter by actor type
      if (actorType && event.actor.type !== actorType) {
        return false;
      }

      // Filter by timestamp
      if (since && new Date(event.timestamp) < since) {
        return false;
      }

      return true;
    });

    // Only update if result changed (efficient comparison by length + last element)
    const prev = prevResultRef.current;
    const changed = prev.length !== filtered.length
      || (filtered.length > 0 && prev[prev.length - 1]?.id !== filtered[filtered.length - 1]?.id);
    if (changed) {
      prevResultRef.current = filtered;
      setFilteredEvents(filtered);
    }
  }, [events, types, entityType, entityId, actorType, since]);

  return filteredEvents;
}
