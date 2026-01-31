# BaleyUI - Phase 3 Agent Task Guide

> This document provides clear, actionable tasks for AI agents building Phase 3: Execution Engine & Real-time Observability.

**Current Phase**: Phase 3 - Execution & Observability
**Status**: Ready to Start
**Prerequisites**: Phase 1 & 2 Complete

---

## Phase 3 Overview

Phase 3 connects the visual flow builder to actual BaleyBots execution with real-time streaming observability.

```
Phase 3 Dependency Graph:

[3.1 Execution Engine] ──────────────────────────────────┐
        │                                                 │
        ▼                                                 │
[3.2 Execution API Routes] ──────────────────────────────┤
        │                                                 │
        ▼                                                 │
[3.3 Execution Timeline UI] ◄─────────────────────────────┤
        │                                                 │
        ▼                                                 │
[3.4 Block Testing Enhancement]                           │
                                                          │
[3.5 Webhook Triggers] ◄──────────────────────────────────┤
        │                                                 │
        ▼                                                 │
[3.6 Pattern Detection Foundation]                        │
                                                          │
[3.7 Error Handling & Resilience] ────────────────────────┘
     (can be done in parallel with 3.4-3.6)

PARALLELIZATION:
- Tasks 3.1-3.3 are sequential (core execution path)
- Tasks 3.4, 3.5, 3.6 can run in parallel after 3.3
- Task 3.7 can run in parallel with 3.4-3.6
```

---

## Task 3.1: Flow Execution Engine

**Status**: [ ] Not Started
**Dependencies**: Phase 2 Complete (Flow Builder, Compiler)
**Estimated Scope**: ~15 files
**Can Parallelize**: No (foundational)

### Objective
Create the server-side execution engine that converts compiled flow graphs into running BaleyBots compositions.

### Deliverables

```
apps/web/src/lib/execution/
├── flow-executor.ts           # Main execution orchestrator
├── node-executors/
│   ├── index.ts               # Executor registry
│   ├── ai-block.ts            # AI block → Baleybot.create()
│   ├── function-block.ts      # Function block → Deterministic.create()
│   ├── router.ts              # Router → BaleybotRouter.create()
│   ├── parallel.ts            # Parallel → ParallelMerge
│   ├── loop.ts                # Loop iteration handler
│   ├── source.ts              # Trigger input handler
│   └── sink.ts                # Output collector
├── state-machine.ts           # Execution state transitions
├── credential-injector.ts     # Runtime credential injection
└── event-emitter.ts           # Execution event broadcasting
```

### Specifications

**Flow Executor** (`lib/execution/flow-executor.ts`):
```typescript
import { compileFlow } from '@/lib/baleybots/compiler';
import { db, flowExecutions, blockExecutions } from '@baleyui/db';
import { ExecutionStateMachine } from './state-machine';
import { nodeExecutors } from './node-executors';
import { injectCredentials } from './credential-injector';
import { ExecutionEventEmitter } from './event-emitter';

export interface ExecutionOptions {
  flowId: string;
  input: unknown;
  triggeredBy: {
    type: 'manual' | 'webhook' | 'schedule';
    userId?: string;
    webhookRequestId?: string;
  };
}

export interface ExecutionResult {
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  output: unknown;
  error?: string;
  metrics: {
    totalDurationMs: number;
    totalTokens: number;
    totalCost: number;
  };
}

export class FlowExecutor {
  private stateMachine: ExecutionStateMachine;
  private eventEmitter: ExecutionEventEmitter;

  constructor(private executionId: string) {
    this.stateMachine = new ExecutionStateMachine(executionId);
    this.eventEmitter = new ExecutionEventEmitter(executionId);
  }

  static async start(options: ExecutionOptions): Promise<FlowExecutor> {
    // 1. Load flow from database
    const flow = await db.query.flows.findFirst({
      where: eq(flows.id, options.flowId),
    });

    if (!flow) throw new Error('Flow not found');

    // 2. Compile flow
    const compilation = await compileFlow({
      id: flow.id,
      name: flow.name,
      nodes: flow.nodes as any[],
      edges: flow.edges as any[],
      triggers: flow.triggers as any[],
      enabled: flow.enabled,
      version: flow.version,
    });

    if (!compilation.success) {
      throw new Error(`Compilation failed: ${compilation.errors[0]?.message}`);
    }

    // 3. Create execution record
    const [execution] = await db.insert(flowExecutions).values({
      flowId: options.flowId,
      flowVersion: flow.version,
      triggeredBy: options.triggeredBy,
      status: 'pending',
      input: options.input,
      startedAt: new Date(),
    }).returning();

    // 4. Create executor and start
    const executor = new FlowExecutor(execution.id);

    // Run async (don't await - execution runs independently)
    executor.execute(compilation.executor, options.input).catch(console.error);

    return executor;
  }

  private async execute(compiledFlow: unknown, input: unknown): Promise<void> {
    try {
      await this.stateMachine.transition('running');
      this.eventEmitter.emit({ type: 'execution_start', input });

      // Execute nodes in topological order
      const nodeResults = new Map<string, unknown>();
      const nodes = (compiledFlow as any).nodes;

      for (const node of nodes) {
        await this.executeNode(node, nodeResults, input);
      }

      // Get final output from sink nodes
      const output = this.collectOutput(nodeResults);

      await this.stateMachine.transition('completed', { output });
      this.eventEmitter.emit({ type: 'execution_complete', output });

    } catch (error) {
      await this.stateMachine.transition('failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.eventEmitter.emit({
        type: 'execution_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async executeNode(
    node: CompiledNode,
    results: Map<string, unknown>,
    flowInput: unknown
  ): Promise<void> {
    const executor = nodeExecutors[node.type];
    if (!executor) {
      throw new Error(`No executor for node type: ${node.type}`);
    }

    // Get input from previous nodes or flow input
    const nodeInput = this.resolveNodeInput(node, results, flowInput);

    // Create block execution record
    const [blockExec] = await db.insert(blockExecutions).values({
      flowExecutionId: this.executionId,
      blockId: node.processable.blockId,
      nodeId: node.nodeId,
      status: 'running',
      input: nodeInput,
      startedAt: new Date(),
    }).returning();

    this.eventEmitter.emit({
      type: 'node_start',
      nodeId: node.nodeId,
      blockExecutionId: blockExec.id
    });

    try {
      // Execute the node
      const output = await executor.execute(node, nodeInput, {
        onStream: (event) => {
          this.eventEmitter.emit({
            type: 'node_stream',
            nodeId: node.nodeId,
            event
          });
        },
      });

      // Update block execution
      await db.update(blockExecutions)
        .set({
          status: 'completed',
          output,
          completedAt: new Date(),
          durationMs: Date.now() - blockExec.startedAt.getTime(),
        })
        .where(eq(blockExecutions.id, blockExec.id));

      results.set(node.nodeId, output);

      this.eventEmitter.emit({
        type: 'node_complete',
        nodeId: node.nodeId,
        output
      });

    } catch (error) {
      await db.update(blockExecutions)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(blockExecutions.id, blockExec.id));

      throw error;
    }
  }

  async cancel(): Promise<void> {
    await this.stateMachine.transition('cancelled');
    this.eventEmitter.emit({ type: 'execution_cancelled' });
  }
}
```

**AI Block Executor** (`lib/execution/node-executors/ai-block.ts`):
```typescript
import { Baleybot } from 'baleybots';
import { db, connections, blocks } from '@baleyui/db';
import { decrypt } from '@/lib/encryption';
import { createLLMClient } from '@/lib/connections/client';

interface ExecuteOptions {
  onStream?: (event: BaleybotStreamEvent) => void;
}

export const aiBlockExecutor = {
  type: 'ai-block' as const,

  async execute(
    node: CompiledNode,
    input: unknown,
    options: ExecuteOptions
  ): Promise<unknown> {
    // 1. Load block configuration
    const block = await db.query.blocks.findFirst({
      where: eq(blocks.id, node.processable.blockId),
    });

    if (!block) throw new Error('Block not found');

    // 2. Load and decrypt connection
    const connection = await db.query.connections.findFirst({
      where: eq(connections.id, block.connectionId),
    });

    if (!connection) throw new Error('Connection not found');

    const apiKey = decrypt(connection.config.apiKey);

    // 3. Create LLM client
    const client = createLLMClient(connection.type, {
      apiKey,
      baseUrl: connection.config.baseUrl,
    });

    // 4. Create Baleybot
    const bot = Baleybot.create({
      name: block.name,
      client,
      model: block.model,
      goal: block.goal,
      systemPrompt: block.systemPrompt,
      outputSchema: block.outputSchema,
      tools: [], // TODO: Load tools
      temperature: parseFloat(block.temperature || '0.7'),
      maxTokens: block.maxTokens,
    });

    // 5. Execute with streaming
    let output: unknown;

    for await (const event of bot.stream(input)) {
      options.onStream?.(event);

      if (event.type === 'done') {
        output = event.output;
      }
    }

    return output;
  },
};
```

**State Machine** (`lib/execution/state-machine.ts`):
```typescript
type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class ExecutionStateMachine {
  private currentStatus: ExecutionStatus = 'pending';

  constructor(private executionId: string) {}

  async transition(
    newStatus: ExecutionStatus,
    data?: { output?: unknown; error?: string }
  ): Promise<void> {
    const validTransitions = VALID_TRANSITIONS[this.currentStatus];

    if (!validTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${this.currentStatus} -> ${newStatus}`
      );
    }

    await db.update(flowExecutions)
      .set({
        status: newStatus,
        output: data?.output,
        error: data?.error,
        completedAt: ['completed', 'failed', 'cancelled'].includes(newStatus)
          ? new Date()
          : undefined,
      })
      .where(eq(flowExecutions.id, this.executionId));

    this.currentStatus = newStatus;
  }

  get status(): ExecutionStatus {
    return this.currentStatus;
  }
}
```

**Event Emitter** (`lib/execution/event-emitter.ts`):
```typescript
import { db, executionEvents } from '@baleyui/db';

export type ExecutionEvent =
  | { type: 'execution_start'; input: unknown }
  | { type: 'execution_complete'; output: unknown }
  | { type: 'execution_error'; error: string }
  | { type: 'execution_cancelled' }
  | { type: 'node_start'; nodeId: string; blockExecutionId: string }
  | { type: 'node_stream'; nodeId: string; event: BaleybotStreamEvent }
  | { type: 'node_complete'; nodeId: string; output: unknown }
  | { type: 'node_error'; nodeId: string; error: string };

export class ExecutionEventEmitter {
  private eventIndex = 0;
  private listeners: Set<(event: ExecutionEvent) => void> = new Set();

  constructor(private executionId: string) {}

  async emit(event: ExecutionEvent): Promise<void> {
    // Store in database for replay
    await db.insert(executionEvents).values({
      executionId: this.executionId,
      eventIndex: this.eventIndex++,
      eventType: event.type,
      eventData: event,
      createdAt: new Date(),
    });

    // Notify listeners
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: ExecutionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async replay(fromIndex: number): Promise<ExecutionEvent[]> {
    const events = await db.query.executionEvents.findMany({
      where: and(
        eq(executionEvents.executionId, this.executionId),
        gte(executionEvents.eventIndex, fromIndex)
      ),
      orderBy: (e) => [asc(e.eventIndex)],
    });

    return events.map((e) => e.eventData as ExecutionEvent);
  }
}
```

### Acceptance Criteria

- [ ] `FlowExecutor.start()` creates execution record and starts async execution
- [ ] AI blocks execute via Baleybot with streaming
- [ ] Function blocks execute deterministic code
- [ ] All events stored in `execution_events` table
- [ ] State machine enforces valid transitions
- [ ] Execution continues even if client disconnects
- [ ] Credentials decrypted at runtime
- [ ] Per-node execution tracked in `block_executions`

---

## Task 3.2: Execution API Routes

**Status**: [ ] Not Started
**Dependencies**: Task 3.1
**Estimated Scope**: ~8 files
**Can Parallelize**: No

### Objective
Create HTTP and SSE endpoints for starting, streaming, and managing executions.

### Deliverables

```
apps/web/src/app/api/
├── flows/
│   └── [id]/
│       └── execute/
│           └── route.ts           # POST - Start flow execution
├── executions/
│   └── [id]/
│       ├── route.ts               # GET - Execution status
│       ├── stream/
│       │   └── route.ts           # GET - SSE stream with reconnection
│       ├── cancel/
│       │   └── route.ts           # POST - Cancel execution
│       └── replay/
│           └── route.ts           # GET - Replay events from index
```

### Specifications

**Start Execution** (`api/flows/[id]/execute/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { FlowExecutor } from '@/lib/execution/flow-executor';
import { db, flows, eq, and, notDeleted } from '@baleyui/db';
import { getCurrentWorkspace } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: flowId } = await params;
    const workspace = await getCurrentWorkspace();
    const body = await request.json();

    // Verify flow exists and belongs to workspace
    const flow = await db.query.flows.findFirst({
      where: and(
        eq(flows.id, flowId),
        eq(flows.workspaceId, workspace.id),
        notDeleted(flows)
      ),
    });

    if (!flow) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    // Start execution
    const executor = await FlowExecutor.start({
      flowId,
      input: body.input,
      triggeredBy: {
        type: 'manual',
        userId,
      },
    });

    return NextResponse.json({
      executionId: executor.executionId,
      status: 'started',
    });

  } catch (error) {
    console.error('Failed to start execution:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 }
    );
  }
}
```

**SSE Stream** (`api/executions/[id]/stream/route.ts`):
```typescript
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db, flowExecutions, executionEvents, flows, eq, and, gte, asc } from '@baleyui/db';
import { getCurrentWorkspace } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: executionId } = await params;
  const workspace = await getCurrentWorkspace();

  // Get lastEventIndex from query for reconnection
  const url = new URL(request.url);
  const lastEventIndex = parseInt(url.searchParams.get('lastEventIndex') || '-1');

  // Verify execution exists and belongs to workspace
  const execution = await db.query.flowExecutions.findFirst({
    where: eq(flowExecutions.id, executionId),
    with: { flow: true },
  });

  if (!execution || execution.flow.workspaceId !== workspace.id) {
    return new Response('Execution not found', { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Replay missed events
      const missedEvents = await db.query.executionEvents.findMany({
        where: and(
          eq(executionEvents.executionId, executionId),
          gte(executionEvents.eventIndex, lastEventIndex + 1)
        ),
        orderBy: (e) => [asc(e.eventIndex)],
      });

      for (const event of missedEvents) {
        const data = JSON.stringify({
          index: event.eventIndex,
          event: event.eventData,
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      // 2. If execution is already complete, close stream
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }

      // 3. Subscribe to new events
      let currentIndex = missedEvents.length > 0
        ? missedEvents[missedEvents.length - 1]!.eventIndex
        : lastEventIndex;

      const pollInterval = setInterval(async () => {
        try {
          const newEvents = await db.query.executionEvents.findMany({
            where: and(
              eq(executionEvents.executionId, executionId),
              gte(executionEvents.eventIndex, currentIndex + 1)
            ),
            orderBy: (e) => [asc(e.eventIndex)],
          });

          for (const event of newEvents) {
            const data = JSON.stringify({
              index: event.eventIndex,
              event: event.eventData,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            currentIndex = event.eventIndex;

            // Check for terminal events
            if (['execution_complete', 'execution_error', 'execution_cancelled']
                .includes((event.eventData as any).type)) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              clearInterval(pollInterval);
              controller.close();
              return;
            }
          }
        } catch (error) {
          console.error('Poll error:', error);
        }
      }, 100); // Poll every 100ms

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Cancel Execution** (`api/executions/[id]/cancel/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db, flowExecutions, eq } from '@baleyui/db';
import { getCurrentWorkspace } from '@/lib/auth';
import { ExecutionEventEmitter } from '@/lib/execution/event-emitter';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: executionId } = await params;
  const workspace = await getCurrentWorkspace();

  // Verify execution
  const execution = await db.query.flowExecutions.findFirst({
    where: eq(flowExecutions.id, executionId),
    with: { flow: true },
  });

  if (!execution || execution.flow.workspaceId !== workspace.id) {
    return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  }

  if (!['pending', 'running'].includes(execution.status)) {
    return NextResponse.json(
      { error: `Cannot cancel execution with status: ${execution.status}` },
      { status: 400 }
    );
  }

  // Update status
  await db.update(flowExecutions)
    .set({
      status: 'cancelled',
      completedAt: new Date(),
    })
    .where(eq(flowExecutions.id, executionId));

  // Emit cancel event
  const emitter = new ExecutionEventEmitter(executionId);
  await emitter.emit({ type: 'execution_cancelled' });

  return NextResponse.json({ status: 'cancelled' });
}
```

### Acceptance Criteria

- [ ] `POST /api/flows/[id]/execute` starts execution and returns executionId
- [ ] `GET /api/executions/[id]/stream` returns SSE stream
- [ ] Reconnection with `?lastEventIndex=N` replays missed events
- [ ] Stream properly closes on terminal events
- [ ] `POST /api/executions/[id]/cancel` cancels running execution
- [ ] All routes verify workspace ownership
- [ ] Proper error responses for invalid states

---

## Task 3.3: Execution Timeline UI

**Status**: [ ] Not Started
**Dependencies**: Task 3.2
**Estimated Scope**: ~12 files
**Can Parallelize**: No

### Objective
Build real-time visualization of flow executions showing per-node status, timing, and outputs.

### Deliverables

```
apps/web/src/
├── app/(dashboard)/executions/
│   ├── page.tsx                   # Executions list
│   └── [id]/
│       └── page.tsx               # Execution detail with timeline
├── components/executions/
│   ├── ExecutionList.tsx          # List of recent executions
│   ├── ExecutionCard.tsx          # Single execution card
│   ├── ExecutionTimeline.tsx      # Main timeline component
│   ├── ExecutionStepper.tsx       # Step-by-step progress
│   ├── NodeExecutionCard.tsx      # Individual node status
│   ├── LiveStreamViewer.tsx       # Real-time output display
│   ├── ExecutionMetrics.tsx       # Duration, tokens, cost
│   └── ExecutionActions.tsx       # Cancel, retry buttons
├── hooks/
│   └── useExecutionTimeline.ts    # Timeline state management
```

### Specifications

**Execution Timeline** (`components/executions/ExecutionTimeline.tsx`):
```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { NodeExecutionCard } from './NodeExecutionCard';
import { LiveStreamViewer } from './LiveStreamViewer';
import { ExecutionMetrics } from './ExecutionMetrics';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface ExecutionTimelineProps {
  executionId: string;
  initialExecution: FlowExecution;
}

export function ExecutionTimeline({
  executionId,
  initialExecution
}: ExecutionTimelineProps) {
  const [execution, setExecution] = useState(initialExecution);
  const [nodeStates, setNodeStates] = useState<Map<string, NodeState>>(new Map());
  const [streamContent, setStreamContent] = useState('');
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const lastEventIndexRef = useRef(-1);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE stream
    const connectStream = () => {
      const url = `/api/executions/${executionId}/stream?lastEventIndex=${lastEventIndexRef.current}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          return;
        }

        const { index, event: execEvent } = JSON.parse(event.data);
        lastEventIndexRef.current = index;
        handleEvent(execEvent);
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Reconnect after delay
        setTimeout(connectStream, 1000);
      };
    };

    connectStream();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [executionId]);

  const handleEvent = (event: ExecutionEvent) => {
    switch (event.type) {
      case 'node_start':
        setActiveNodeId(event.nodeId);
        setNodeStates((prev) => {
          const next = new Map(prev);
          next.set(event.nodeId, { status: 'running', startedAt: new Date() });
          return next;
        });
        break;

      case 'node_stream':
        if (event.event.type === 'text_delta') {
          setStreamContent((prev) => prev + event.event.content);
        }
        break;

      case 'node_complete':
        setNodeStates((prev) => {
          const next = new Map(prev);
          const current = next.get(event.nodeId);
          next.set(event.nodeId, {
            ...current,
            status: 'completed',
            output: event.output,
            completedAt: new Date(),
          });
          return next;
        });
        setStreamContent('');
        break;

      case 'node_error':
        setNodeStates((prev) => {
          const next = new Map(prev);
          next.set(event.nodeId, {
            status: 'failed',
            error: event.error,
            completedAt: new Date(),
          });
          return next;
        });
        break;

      case 'execution_complete':
        setExecution((prev) => ({ ...prev, status: 'completed', output: event.output }));
        break;

      case 'execution_error':
        setExecution((prev) => ({ ...prev, status: 'failed', error: event.error }));
        break;

      case 'execution_cancelled':
        setExecution((prev) => ({ ...prev, status: 'cancelled' }));
        break;
    }
  };

  const getStatusIcon = () => {
    switch (execution.status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <h2 className="text-xl font-semibold">Execution</h2>
          <Badge variant={execution.status === 'completed' ? 'default' : 'secondary'}>
            {execution.status}
          </Badge>
        </div>
        <ExecutionMetrics execution={execution} />
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {(execution.flow.nodes as any[]).map((node) => (
          <NodeExecutionCard
            key={node.id}
            node={node}
            state={nodeStates.get(node.id)}
            isActive={activeNodeId === node.id}
          />
        ))}
      </div>

      {/* Live Stream */}
      {activeNodeId && streamContent && (
        <LiveStreamViewer content={streamContent} nodeId={activeNodeId} />
      )}

      {/* Final Output */}
      {execution.status === 'completed' && execution.output && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">Output</h3>
          <pre className="text-sm bg-muted p-3 rounded overflow-auto">
            {JSON.stringify(execution.output, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {execution.status === 'failed' && execution.error && (
        <div className="border border-destructive rounded-lg p-4 bg-destructive/10">
          <h3 className="font-medium text-destructive mb-2">Error</h3>
          <pre className="text-sm">{execution.error}</pre>
        </div>
      )}
    </div>
  );
}
```

**Node Execution Card** (`components/executions/NodeExecutionCard.tsx`):
```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface NodeExecutionCardProps {
  node: FlowNode;
  state?: NodeState;
  isActive: boolean;
}

export function NodeExecutionCard({ node, state, isActive }: NodeExecutionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    if (!state) return <Clock className="h-4 w-4 text-muted-foreground" />;
    switch (state.status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDuration = () => {
    if (!state?.startedAt) return null;
    const end = state.completedAt || new Date();
    const ms = end.getTime() - state.startedAt.getTime();
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <Card
      className={cn(
        'transition-all',
        isActive && 'ring-2 ring-blue-500',
        state?.status === 'failed' && 'border-destructive'
      )}
    >
      <CardHeader
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {getStatusIcon()}
            <CardTitle className="text-base">{node.data.label || node.data.name}</CardTitle>
            <Badge variant="outline">{node.type}</Badge>
          </div>
          {getDuration() && (
            <span className="text-sm text-muted-foreground">{getDuration()}</span>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {state?.output && (
            <div>
              <h4 className="text-sm font-medium mb-1">Output</h4>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                {JSON.stringify(state.output, null, 2)}
              </pre>
            </div>
          )}
          {state?.error && (
            <div>
              <h4 className="text-sm font-medium text-destructive mb-1">Error</h4>
              <pre className="text-xs text-destructive">{state.error}</pre>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
```

**Executions Page** (`app/(dashboard)/executions/page.tsx`):
```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { ExecutionList } from '@/components/executions/ExecutionList';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function ExecutionsPage() {
  const { data, isLoading, refetch } = trpc.flows.listExecutions.useQuery({
    limit: 50,
  });

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executions</h1>
          <p className="text-muted-foreground">
            Monitor and inspect flow executions
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <ExecutionList
        executions={data || []}
        isLoading={isLoading}
      />
    </div>
  );
}
```

### Acceptance Criteria

- [ ] Executions list shows recent executions with status badges
- [ ] Execution detail shows timeline of all nodes
- [ ] Active node highlighted during execution
- [ ] Streaming text appears in real-time
- [ ] Node cards expandable to show input/output
- [ ] Duration tracked per-node and total
- [ ] Auto-reconnect on disconnect with event replay
- [ ] Proper error display for failed executions
- [ ] Cancel button works for running executions

---

## Task 3.4: Block Testing Enhancement

**Status**: [ ] Not Started
**Dependencies**: Task 3.3
**Estimated Scope**: ~8 files
**Can Parallelize**: Yes (with 3.5, 3.6, 3.7)

### Objective
Enhance the existing block testing interface with streaming output, test history, and schema-aware input builder.

### Deliverables

```
apps/web/src/components/blocks/testing/
├── BlockTestPanel.tsx             # Enhanced test panel
├── StreamingOutput.tsx            # Real-time output display
├── InputBuilder.tsx               # Schema-aware input form
├── TestHistory.tsx                # Test run history
├── ToolCallDisplay.tsx            # Tool execution display
└── TestMetrics.tsx                # TTFT, tokens/sec display
```

### Acceptance Criteria

- [ ] Streaming text appears token-by-token
- [ ] Tool calls display with arguments and results
- [ ] Input form auto-generated from schema
- [ ] Test history stored and viewable
- [ ] Can replay previous test inputs
- [ ] TTFT and tokens/sec displayed
- [ ] Can cancel in-progress tests

---

## Task 3.5: Webhook Triggers

**Status**: [ ] Not Started
**Dependencies**: Task 3.2
**Estimated Scope**: ~10 files
**Can Parallelize**: Yes (with 3.4, 3.6, 3.7)

### Objective
Enable flows to be triggered by external webhooks with authentication and logging.

### Deliverables

```
apps/web/src/
├── app/api/webhooks/
│   └── [flowId]/
│       └── [secret]/
│           └── route.ts           # Webhook trigger endpoint
├── lib/trpc/routers/
│   └── webhooks.ts                # Webhook management
├── components/flows/
│   ├── WebhookConfig.tsx          # Webhook configuration panel
│   ├── WebhookUrl.tsx             # URL display with copy
│   └── WebhookLogs.tsx            # Recent invocations
```

### Specifications

**Webhook Trigger Endpoint** (`api/webhooks/[flowId]/[secret]/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db, flows, eq, and, notDeleted } from '@baleyui/db';
import { FlowExecutor } from '@/lib/execution/flow-executor';
import crypto from 'crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string; secret: string }> }
) {
  const { flowId, secret } = await params;

  // Verify flow and secret
  const flow = await db.query.flows.findFirst({
    where: and(eq(flows.id, flowId), notDeleted(flows)),
  });

  if (!flow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify webhook secret
  const trigger = (flow.triggers as any[])?.find(
    (t) => t.type === 'webhook'
  );

  if (!trigger || !verifySecret(secret, trigger.config.secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  const body = await request.json().catch(() => ({}));

  // Start execution
  const executor = await FlowExecutor.start({
    flowId,
    input: body,
    triggeredBy: {
      type: 'webhook',
      webhookRequestId: crypto.randomUUID(),
    },
  });

  return NextResponse.json({
    executionId: executor.executionId,
    status: 'started',
  });
}

function verifySecret(provided: string, stored: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(stored)
  );
}
```

### Acceptance Criteria

- [ ] Can generate unique webhook URL per flow
- [ ] Secret-based authentication works
- [ ] POST to webhook triggers flow execution
- [ ] Webhook logs stored and viewable
- [ ] Can regenerate webhook secret
- [ ] Rate limiting in place

---

## Task 3.6: Pattern Detection Foundation

**Status**: [ ] Not Started
**Dependencies**: Task 3.3
**Estimated Scope**: ~8 files
**Can Parallelize**: Yes (with 3.4, 3.5, 3.7)

### Objective
Lay groundwork for automatic pattern extraction from decision feedback.

### Deliverables

```
apps/web/src/
├── lib/trpc/routers/
│   └── patterns.ts                # Pattern CRUD
├── components/decisions/
│   ├── FeedbackForm.tsx           # Enhanced feedback UI
│   └── CategoryTags.tsx           # Decision categorization
├── components/analytics/
│   ├── BlockAnalytics.tsx         # Per-block analytics
│   └── AccuracyChart.tsx          # Accuracy over time
```

### Acceptance Criteria

- [ ] Enhanced feedback form with categories
- [ ] Pattern CRUD operations
- [ ] Decision accuracy by block chart
- [ ] Common failure patterns identified
- [ ] Cost analysis by block/model

---

## Task 3.7: Error Handling & Resilience

**Status**: [ ] Not Started
**Dependencies**: Task 3.1
**Estimated Scope**: ~6 files
**Can Parallelize**: Yes (with 3.4, 3.5, 3.6)

### Objective
Production-grade error handling with retry logic, fallbacks, and clear user feedback.

### Deliverables

```
apps/web/src/lib/
├── execution/
│   ├── retry.ts                   # Retry logic with backoff
│   ├── circuit-breaker.ts         # Circuit breaker for APIs
│   └── fallback.ts                # Fallback model selection
├── errors/
│   ├── execution-errors.ts        # Custom error types
│   └── error-handler.ts           # Global error handler
```

### Specifications

**Retry Logic** (`lib/execution/retry.ts`):
```typescript
interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error | null = null;
  let delay = options.initialDelayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if retryable
      const isRetryable = options.retryableErrors.some(
        (msg) => lastError?.message.includes(msg)
      );

      if (!isRetryable || attempt === options.maxRetries) {
        throw error;
      }

      // Exponential backoff with jitter
      await sleep(delay + Math.random() * 100);
      delay = Math.min(delay * 2, options.maxDelayMs);
    }
  }

  throw lastError;
}
```

### Acceptance Criteria

- [ ] Transient failures retried with exponential backoff
- [ ] Circuit breaker prevents cascade failures
- [ ] Fallback models used when primary fails
- [ ] Clear error messages for users
- [ ] Debug mode with full stack traces
- [ ] Error aggregation for monitoring

---

## Execution Plan Summary

### Agent Assignment

| Task | Agent Type | Duration | Notes |
|------|------------|----------|-------|
| 3.1 Flow Execution Engine | Backend Agent | 1 session | Foundational, no parallelization |
| 3.2 Execution API Routes | Backend Agent | 1 session | Depends on 3.1 |
| 3.3 Execution Timeline UI | Frontend Agent | 1 session | Depends on 3.2 |
| 3.4 Block Testing Enhancement | Frontend Agent | 1 session | Parallel with 3.5-3.7 |
| 3.5 Webhook Triggers | Full-stack Agent | 1 session | Parallel with 3.4, 3.6-3.7 |
| 3.6 Pattern Detection | Full-stack Agent | 1 session | Parallel with 3.4-3.5, 3.7 |
| 3.7 Error Handling | Backend Agent | 1 session | Parallel with 3.4-3.6 |

### Optimal Execution Order

```
Session 1: Task 3.1 (Execution Engine)
Session 2: Task 3.2 (API Routes)
Session 3: Task 3.3 (Timeline UI)
Session 4: Tasks 3.4 + 3.5 + 3.6 + 3.7 (in parallel with 4 agents)
```

### Dependencies Visualization

```
3.1 ──► 3.2 ──► 3.3 ──┬──► 3.4 (Block Testing)
                      │
                      ├──► 3.5 (Webhooks)
                      │
                      ├──► 3.6 (Patterns)
                      │
                      └──► 3.7 (Error Handling)
```

---

## Task Completion Checklist

When completing a task:

1. **Run checks**:
   ```bash
   pnpm type-check  # No TypeScript errors
   pnpm lint        # No ESLint errors
   pnpm dev         # App runs without errors
   ```

2. **Test functionality**:
   - Verify all acceptance criteria
   - Test happy path and error cases
   - Test SSE reconnection scenarios

3. **Update this document**:
   - Mark task checkbox as complete
   - Note any deviations or decisions

4. **Commit with clear message**:
   ```bash
   git commit -m "feat(task-3.X): <description>"
   ```
