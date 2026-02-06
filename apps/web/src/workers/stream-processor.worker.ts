/**
 * Stream Processor WebWorker
 *
 * Batches rapid SSE events on a 16ms frame budget to reduce
 * main thread overhead from high-frequency streaming updates.
 *
 * Events like 'done' and 'error' are flushed immediately to
 * ensure terminal states are processed without delay.
 */

// ============================================================================
// TYPES
// ============================================================================

interface BatchedEvent {
  type: string;
  data: unknown;
}

type WorkerInbound =
  | { type: 'event'; raw: string }
  | { type: 'flush' }
  | { type: 'reset' };

// ============================================================================
// BATCHING STATE
// ============================================================================

let batch: BatchedEvent[] = [];
let flushTimerId: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// FLUSH LOGIC
// ============================================================================

function flushBatch() {
  if (batch.length > 0) {
    self.postMessage({ type: 'batch', events: [...batch] });
    batch = [];
  }
  if (flushTimerId !== null) {
    clearTimeout(flushTimerId);
    flushTimerId = null;
  }
}

function scheduleFlush() {
  if (flushTimerId === null) {
    flushTimerId = setTimeout(flushBatch, 16);
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  switch (e.data.type) {
    case 'event': {
      try {
        const event = JSON.parse(e.data.raw) as BatchedEvent;
        batch.push(event);

        // Flush terminal events immediately
        if (event.type === 'done' || event.type === 'error') {
          flushBatch();
          return;
        }

        // Batch other events on a 16ms frame budget
        scheduleFlush();
      } catch {
        // Skip unparseable events
      }
      break;
    }

    case 'flush': {
      // Manual flush request from main thread
      flushBatch();
      break;
    }

    case 'reset': {
      // Clear all pending state
      batch = [];
      if (flushTimerId !== null) {
        clearTimeout(flushTimerId);
        flushTimerId = null;
      }
      break;
    }
  }
};
