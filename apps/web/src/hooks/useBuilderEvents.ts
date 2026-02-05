/**
 * useBuilderEvents Hook
 *
 * React hook for subscribing to real-time builder events via SSE.
 * Provides automatic reconnection and event accumulation.
 * Follows React 19 patterns - no manual memoization.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { type StoredEvent } from '@/lib/events/event-store';
import { RECONNECTION } from '@/lib/constants';

interface UseBuilderEventsOptions {
  workspaceId: string;
  onEvent?: (event: StoredEvent) => void;
  enabled?: boolean;
}

// Circular buffer limit to prevent memory issues
const MAX_EVENTS = 200;

interface UseBuilderEventsResult {
  events: StoredEvent[];
  isConnected: boolean;
  lastSequence: number;
}

export function useBuilderEvents({
  workspaceId,
  onEvent,
  enabled = true,
}: UseBuilderEventsOptions): UseBuilderEventsResult {
  const [lastSequence, setLastSequence] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Use refs for values that change frequently to avoid tearing down the connection
  const lastSequenceRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    function connect() {
      // Clean up existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/events/${workspaceId}?lastSequence=${lastSequenceRef.current}`;
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const event: StoredEvent = JSON.parse(e.data);
          // Add event with circular buffer limit
          setEvents((prev) => {
            const combined = [...prev, event];
            return combined.length > MAX_EVENTS
              ? combined.slice(-MAX_EVENTS)
              : combined;
          });
          lastSequenceRef.current = event.sequenceNumber;
          setLastSequence(event.sequenceNumber);
          onEventRef.current?.(event);
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECTION.DEFAULT_DELAY_MS);
      };

      eventSourceRef.current = eventSource;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      eventSourceRef.current?.close();
    };
  }, [workspaceId, enabled]);

  return {
    events,
    isConnected,
    lastSequence,
  };
}
