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

interface UseBuilderEventsOptions {
  workspaceId: string;
  onEvent?: (event: StoredEvent) => void;
  enabled?: boolean;
}

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

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    function connect() {
      // Clean up existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/events/${workspaceId}?lastSequence=${lastSequence}`;
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (e) => {
        try {
          const event: StoredEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);
          setLastSequence(event.sequenceNumber);
          onEvent?.(event);
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
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
  }, [workspaceId, enabled, lastSequence, onEvent]);

  return {
    events,
    isConnected,
    lastSequence,
  };
}
