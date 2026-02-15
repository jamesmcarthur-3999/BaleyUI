/**
 * Design Calibration Streaming Orchestrator
 *
 * Frontend streaming client for the design calibration SSE endpoint.
 * Uses streamPostSSE to parse events and dispatches to typed callbacks.
 * The wizard component wires callbacks to refs + setState.
 */

import type { DesignPackageData } from './types';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

// ============================================================================
// Config & Callbacks
// ============================================================================

export interface DesignCalibrationStreamConfig {
  message: string;
  conversationHistory?: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
  }>;
  existingPackageData?: DesignPackageData;
  attachmentIds?: string[];
  sessionId?: string;
  controls?: DesignCalibrationControls;
}

export interface DesignCalibrationControls {
  brandAlignment: number;
  contrastTarget: 'aa' | 'aaa';
  layoutDensity: 'compact' | 'comfortable' | 'spacious';
  motionIntensity: 'subtle' | 'moderate' | 'expressive';
  voiceTone: string;
}

export interface DesignCalibrationCallbacks {
  // SDK-standard event handlers
  onTextDelta: (content: string) => void;
  onToolCallStart: (id: string, toolName: string) => void;
  onToolCallArgsDelta: (id: string, delta: string) => void;
  onToolCallComplete: (id: string, toolName: string, args: string) => void;
  onToolExecStart: (id: string, toolName: string) => void;
  onToolExecOutput: (id: string, toolName: string, result?: unknown, error?: string) => void;
  // Design-specific events
  onDesignPreviewUpdate: (data: DesignPackageData) => void;
  onDesignSaved: (packageId: string) => void;
  onBrandDossierStarted?: () => void;
  onBrandDossierReady?: (dossier: Record<string, unknown>) => void;
  onConceptDirectionStarted?: (payload: { id: string; title: string }) => void;
  onConceptDirectionScored?: (payload: {
    id: string;
    title: string;
    score: number;
    rationale: string;
  }) => void;
  onQualityGateRepair?: (payload: { attempt: number; reason: string }) => void;
  onConceptMergePreview?: (payload: Record<string, unknown>) => void;
  onOrchestrationRunStarted?: (payload: {
    runId: string;
    objective: string;
    strategy: Record<string, unknown>;
  }) => void;
  onOrchestrationPlanReady?: (payload: {
    runId: string;
    steps: string[];
  }) => void;
  onOrchestrationTaskStarted?: (payload: {
    runId: string;
    taskId: string;
    parentTaskId?: string | null;
    assignedBot: string;
    expectedArtifact?: string;
    depth: number;
  }) => void;
  onOrchestrationTaskProgress?: (payload: {
    runId: string;
    taskId: string;
    status: string;
    message: string;
    attempt: number;
  }) => void;
  onOrchestrationTaskRetry?: (payload: {
    runId: string;
    taskId: string;
    attempt: number;
    reason: string;
  }) => void;
  onOrchestrationTaskDone?: (payload: {
    runId: string;
    taskId: string;
    status: string;
    durationMs?: number;
  }) => void;
  onOrchestrationTaskFailed?: (payload: {
    runId: string;
    taskId: string;
    error: string;
    recoverable: boolean;
  }) => void;
  onOrchestrationMergeStarted?: (payload: {
    runId: string;
    selectedDirection?: string;
  }) => void;
  onOrchestrationMergeDone?: (payload: {
    runId: string;
    selectedDirection: string;
    degraded: boolean;
  }) => void;
  onOrchestrationDegradedPublish?: (payload: {
    runId: string;
    reasons: string[];
  }) => void;
  onSelfReviewStarted?: (payload: {
    directionId: string;
    directionTitle: string;
    attempt: number;
  }) => void;
  onSelfReviewResult?: (payload: {
    directionId: string;
    directionTitle: string;
    attempt: number;
    status: string;
    score: number;
    issues: Array<Record<string, unknown>>;
  }) => void;
  onSelfRepairStarted?: (payload: {
    directionId: string;
    directionTitle: string;
    attempt: number;
    issues: Array<Record<string, unknown>>;
  }) => void;
  onSelfRepairResult?: (payload: {
    directionId: string;
    directionTitle: string;
    attempt: number;
    status: string;
    issues: Array<Record<string, unknown>>;
  }) => void;
  onSelfRepairExhausted?: (payload: {
    directionId: string;
    directionTitle: string;
    attempt: number;
    issues: Array<Record<string, unknown>>;
  }) => void;
  onDesignConceptsStarted?: () => void;
  onDesignConceptsUpdate?: (concepts: DesignConceptPayload[]) => void;
  // Component generation events
  onComponentGenerationStarted?: () => void;
  onComponentRegistered?: (component: Record<string, unknown>) => void;
  onComponentGenerationComplete?: () => void;
  onComponentGenerationError?: (message: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export interface DesignConceptPayload {
  id: 'directionA' | 'directionB' | 'directionC';
  title: string;
  summary: string;
  score?: number;
  rationale?: string;
  packageData: DesignPackageData;
}

// ============================================================================
// SSE Event Types
// ============================================================================

interface DesignStreamEvent {
  type: string;
  // text_delta
  content?: string;
  // tool_call_*
  id?: string;
  toolName?: string;
  argumentsDelta?: string;
  arguments?: string;
  // tool_execution_*
  result?: unknown;
  error?: string;
  // design_preview_update
  data?: DesignPackageData;
  // design_saved
  packageId?: string;
  // design concepts
  concepts?: DesignConceptPayload[];
  // brand dossier + direction events
  dossier?: Record<string, unknown>;
  directionId?: string;
  directionTitle?: string;
  score?: number;
  rationale?: string;
  attempt?: number;
  reason?: string;
  payload?: Record<string, unknown>;
  runId?: string;
  objective?: string;
  strategy?: Record<string, unknown>;
  steps?: string[];
  taskId?: string;
  parentTaskId?: string | null;
  assignedBot?: string;
  expectedArtifact?: string;
  depth?: number;
  attemptNumber?: number;
  durationMs?: number;
  recoverable?: boolean;
  degraded?: boolean;
  selectedDirection?: string;
  reasons?: string[];
  status?: string;
  issues?: Array<Record<string, unknown>>;
  // component_registered
  component?: Record<string, unknown>;
  // design_error / component_generation_error
  message?: string;
  // timestamp on all events
  timestamp?: number;
}

// ============================================================================
// Stream Runner
// ============================================================================

export async function runDesignCalibrationStream(
  config: DesignCalibrationStreamConfig,
  callbacks: DesignCalibrationCallbacks,
  signal?: AbortSignal
): Promise<void> {
  await streamPostSSE<DesignStreamEvent>({
    url: '/api/design-calibration/stream',
    body: {
      message: config.message,
      conversationHistory: config.conversationHistory,
      existingPackageData: config.existingPackageData,
      attachmentIds: config.attachmentIds,
      sessionId: config.sessionId,
      controls: config.controls,
    },
    signal,
    onEvent: (event) => {
      switch (event.type) {
        case 'text_delta': {
          if (event.content) {
            callbacks.onTextDelta(event.content);
          }
          break;
        }
        case 'tool_call_stream_start': {
          if (event.id && event.toolName) {
            callbacks.onToolCallStart(event.id, event.toolName);
          }
          break;
        }
        case 'tool_call_arguments_delta': {
          if (event.id && event.argumentsDelta) {
            callbacks.onToolCallArgsDelta(event.id, event.argumentsDelta);
          }
          break;
        }
        case 'tool_call_stream_complete': {
          if (event.id && event.toolName) {
            callbacks.onToolCallComplete(
              event.id,
              event.toolName,
              event.arguments ?? ''
            );
          }
          break;
        }
        case 'tool_execution_start': {
          if (event.id && event.toolName) {
            callbacks.onToolExecStart(event.id, event.toolName);
          }
          break;
        }
        case 'tool_execution_output': {
          if (event.id && event.toolName) {
            callbacks.onToolExecOutput(
              event.id,
              event.toolName,
              event.result,
              event.error
            );
          }
          break;
        }
        case 'design_preview_update': {
          if (event.data) {
            callbacks.onDesignPreviewUpdate(event.data as DesignPackageData);
          }
          break;
        }
        case 'design_saved': {
          if (event.packageId) {
            callbacks.onDesignSaved(event.packageId);
          }
          break;
        }
        case 'brand_dossier_started': {
          callbacks.onBrandDossierStarted?.();
          break;
        }
        case 'brand_dossier_ready': {
          callbacks.onBrandDossierReady?.(event.dossier ?? {});
          break;
        }
        case 'concept_direction_started': {
          if (event.directionId && event.directionTitle) {
            callbacks.onConceptDirectionStarted?.({
              id: event.directionId,
              title: event.directionTitle,
            });
          }
          break;
        }
        case 'concept_direction_scored': {
          if (event.directionId && event.directionTitle && typeof event.score === 'number') {
            callbacks.onConceptDirectionScored?.({
              id: event.directionId,
              title: event.directionTitle,
              score: event.score,
              rationale: event.rationale ?? '',
            });
          }
          break;
        }
        case 'quality_gate_repair': {
          callbacks.onQualityGateRepair?.({
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
            reason: event.reason ?? 'Repairing design package quality checks',
          });
          break;
        }
        case 'concept_merge_preview': {
          callbacks.onConceptMergePreview?.(event.payload ?? {});
          break;
        }
        case 'orchestration_run_started': {
          if (event.runId && event.objective) {
            callbacks.onOrchestrationRunStarted?.({
              runId: event.runId,
              objective: event.objective,
              strategy: event.strategy ?? {},
            });
          }
          break;
        }
        case 'orchestration_plan_ready': {
          if (event.runId) {
            callbacks.onOrchestrationPlanReady?.({
              runId: event.runId,
              steps: Array.isArray(event.steps)
                ? event.steps.filter((step): step is string => typeof step === 'string')
                : [],
            });
          }
          break;
        }
        case 'orchestration_task_started': {
          if (event.runId && event.taskId && event.assignedBot) {
            callbacks.onOrchestrationTaskStarted?.({
              runId: event.runId,
              taskId: event.taskId,
              parentTaskId: event.parentTaskId,
              assignedBot: event.assignedBot,
              expectedArtifact: event.expectedArtifact,
              depth: typeof event.depth === 'number' ? event.depth : 0,
            });
          }
          break;
        }
        case 'orchestration_task_progress': {
          if (event.runId && event.taskId) {
            callbacks.onOrchestrationTaskProgress?.({
              runId: event.runId,
              taskId: event.taskId,
              status: event.status ?? 'running',
              message: event.message ?? '',
              attempt: typeof event.attemptNumber === 'number' ? event.attemptNumber : 0,
            });
          }
          break;
        }
        case 'orchestration_task_retry': {
          if (event.runId && event.taskId) {
            callbacks.onOrchestrationTaskRetry?.({
              runId: event.runId,
              taskId: event.taskId,
              attempt: typeof event.attemptNumber === 'number' ? event.attemptNumber : 0,
              reason: event.reason ?? 'Retry requested',
            });
          }
          break;
        }
        case 'orchestration_task_done': {
          if (event.runId && event.taskId) {
            callbacks.onOrchestrationTaskDone?.({
              runId: event.runId,
              taskId: event.taskId,
              status: event.status ?? 'completed',
              durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
            });
          }
          break;
        }
        case 'orchestration_task_failed': {
          if (event.runId && event.taskId) {
            callbacks.onOrchestrationTaskFailed?.({
              runId: event.runId,
              taskId: event.taskId,
              error: event.message ?? 'Task failed',
              recoverable: Boolean(event.recoverable),
            });
          }
          break;
        }
        case 'orchestration_merge_started': {
          if (event.runId) {
            callbacks.onOrchestrationMergeStarted?.({
              runId: event.runId,
              selectedDirection: event.selectedDirection,
            });
          }
          break;
        }
        case 'orchestration_merge_done': {
          if (event.runId && event.selectedDirection) {
            callbacks.onOrchestrationMergeDone?.({
              runId: event.runId,
              selectedDirection: event.selectedDirection,
              degraded: Boolean(event.degraded),
            });
          }
          break;
        }
        case 'orchestration_degraded_publish': {
          if (event.runId) {
            callbacks.onOrchestrationDegradedPublish?.({
              runId: event.runId,
              reasons: Array.isArray(event.reasons)
                ? event.reasons.filter((reason): reason is string => typeof reason === 'string')
                : [],
            });
          }
          break;
        }
        case 'self_review_started': {
          callbacks.onSelfReviewStarted?.({
            directionId: event.directionId ?? '',
            directionTitle: event.directionTitle ?? '',
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
          });
          break;
        }
        case 'self_review_result': {
          callbacks.onSelfReviewResult?.({
            directionId: event.directionId ?? '',
            directionTitle: event.directionTitle ?? '',
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
            status: event.status ?? 'unknown',
            score: typeof event.score === 'number' ? event.score : 0,
            issues: event.issues ?? [],
          });
          break;
        }
        case 'self_repair_started': {
          callbacks.onSelfRepairStarted?.({
            directionId: event.directionId ?? '',
            directionTitle: event.directionTitle ?? '',
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
            issues: event.issues ?? [],
          });
          break;
        }
        case 'self_repair_result': {
          callbacks.onSelfRepairResult?.({
            directionId: event.directionId ?? '',
            directionTitle: event.directionTitle ?? '',
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
            status: event.status ?? 'unknown',
            issues: event.issues ?? [],
          });
          break;
        }
        case 'self_repair_exhausted': {
          callbacks.onSelfRepairExhausted?.({
            directionId: event.directionId ?? '',
            directionTitle: event.directionTitle ?? '',
            attempt: typeof event.attempt === 'number' ? event.attempt : 0,
            issues: event.issues ?? [],
          });
          break;
        }
        case 'design_concepts_started': {
          callbacks.onDesignConceptsStarted?.();
          break;
        }
        case 'design_concepts_update': {
          if (event.concepts && Array.isArray(event.concepts)) {
            callbacks.onDesignConceptsUpdate?.(event.concepts);
          }
          break;
        }
        case 'component_generation_started': {
          callbacks.onComponentGenerationStarted?.();
          break;
        }
        case 'component_registered': {
          if (event.component) {
            callbacks.onComponentRegistered?.(event.component);
          }
          break;
        }
        case 'component_generation_complete': {
          callbacks.onComponentGenerationComplete?.();
          break;
        }
        case 'component_generation_error': {
          callbacks.onComponentGenerationError?.(event.message ?? 'Component generation failed');
          break;
        }
        case 'design_error': {
          callbacks.onError(event.message ?? 'An error occurred');
          break;
        }
        // design_started, heartbeats — no action needed
      }
    },
    onDone: () => {
      callbacks.onDone();
    },
  });
}
