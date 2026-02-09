import { processCreatorMessage, type CreatorProgressEvent } from './creator-bot';
import {
  getCreatorGuidance,
  type CreatorGuidanceInput,
} from './creator-guidance-service';
import type {
  CreatorGuidanceAction,
  CreatorMessage,
  CreatorOutput,
  CreatorPlanDelta,
  CreatorPlanDecision,
  CreatorPlanLedger,
  CreatorToolActivity,
} from './creator-types';
import type { GeneratorContext } from './types';

export type CreatorOrchestratorEvent =
  | {
      type: 'creator_progress';
      payload: CreatorProgressEvent;
    }
  | {
      type: 'creator_tool_activity';
      payload: CreatorToolActivity;
    }
  | {
      type: 'creator_plan_delta';
      payload: CreatorPlanDelta;
    }
  | {
      type: 'creator_action_suggestions';
      payload: {
        actions: CreatorGuidanceAction[];
      };
    };

export interface CreatorOrchestratorInput {
  workspaceId: string;
  userMessage: string;
  context: GeneratorContext;
  conversationHistory?: CreatorMessage[];
  signal?: AbortSignal;
  onEvent?: (event: CreatorOrchestratorEvent) => void;
}

export interface CreatorOrchestratorResult {
  result: CreatorOutput;
  planDelta: CreatorPlanDelta;
  guidanceActions: CreatorGuidanceAction[];
}

function emit(
  input: CreatorOrchestratorInput,
  event: CreatorOrchestratorEvent
): void {
  try {
    input.onEvent?.(event);
  } catch {
    // Best effort only; orchestration should continue.
  }
}

function inferToolStatusFromProgressMessage(
  message: string
): CreatorToolActivity['status'] {
  const lower = message.toLowerCase();
  if (lower.includes('fail') || lower.includes('error')) return 'error';
  if (lower.includes('complete') || lower.includes('success') || lower.includes('done')) {
    return 'success';
  }
  if (lower.includes('preparing') || lower.includes('queue')) return 'pending';
  return 'running';
}

function dedupeQuestions(
  questions: Array<CreatorPlanDecision>
): Array<CreatorPlanDecision> {
  const seen = new Set<string>();
  const out: CreatorPlanDecision[] = [];
  for (const question of questions) {
    const key = `${question.id}:${question.label}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(question);
  }
  return out;
}

function buildPlanDelta(args: {
  userMessage: string;
  result: CreatorOutput;
  conversationHistory: CreatorMessage[];
}): CreatorPlanDelta {
  const { userMessage, result, conversationHistory } = args;
  const latestLifecycle = [...conversationHistory]
    .reverse()
    .find((message) => message.role === 'assistant')?.metadata?.creatorLifecycle;

  const previousOpen = [
    ...(latestLifecycle?.requiredQuestions ?? []),
    ...(latestLifecycle?.optionalQuestions ?? []),
  ].map((question) => ({
    id: question.id,
    label: question.label,
    description: question.description,
    requiredNow: question.requiredNow ?? false,
  }));

  const openDecisions = dedupeQuestions(
    (result.questions ?? []).map((question) => ({
      id: question.id,
      label: question.label,
      description: question.description,
      requiredNow: question.requiredNow ?? false,
    }))
  );
  const openKeys = new Set(openDecisions.map((question) => question.id));

  const resolvedDecisions = dedupeQuestions(
    previousOpen
      .filter((question) => !openKeys.has(question.id))
      .slice(0, 6)
  );

  const nextQuestion =
    openDecisions.find((question) => question.requiredNow !== false) ??
    openDecisions[0] ??
    null;

  const summary =
    result.status === 'building'
      ? openDecisions.length > 0
        ? `Clarified planning and identified ${openDecisions.length} open setup detail${openDecisions.length === 1 ? '' : 's'}.`
        : 'Clarified planning and prepared to continue generation.'
      : `Locked planning details and generated ${result.entities.length} runnable entit${result.entities.length === 1 ? 'y' : 'ies'}.`;

  const assumptions = (result.assumptions ?? []).map((assumption) => ({
    id: assumption.id,
    label: assumption.label,
    value: assumption.value,
    confidence: assumption.confidence ?? 'medium',
    requiresConfirmation: assumption.requiresConfirmation,
  }));

  const stage = result.status === 'building' ? 'discovery' : 'design';

  const goal =
    latestLifecycle?.planLedger?.goal ||
    result.name ||
    userMessage.replace(/\s+/g, ' ').trim().slice(0, 140);

  const ledger: CreatorPlanLedger = {
    goal,
    stage,
    resolvedDecisions,
    openDecisions,
    assumptions,
    nextQuestion,
    runnableConfidence: result.runnableConfidence,
    updatedAt: Date.now(),
  };

  return {
    summary,
    goal: ledger.goal,
    stage: ledger.stage,
    resolvedDecisions: ledger.resolvedDecisions,
    openDecisions: ledger.openDecisions,
    assumptions: ledger.assumptions,
    nextQuestion: ledger.nextQuestion,
    runnableConfidence: ledger.runnableConfidence,
  };
}

function buildGuidanceInput(args: {
  workspaceId: string;
  status: CreatorGuidanceInput['status'];
  conversationHistory: CreatorMessage[];
  appendedAssistantMessage?: CreatorMessage;
}): CreatorGuidanceInput {
  return {
    workspaceId: args.workspaceId,
    status: args.status,
    messages: [
      ...args.conversationHistory,
      ...(args.appendedAssistantMessage ? [args.appendedAssistantMessage] : []),
    ]
      .slice(-30)
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 4000),
        metadata: message.metadata as Record<string, unknown> | undefined,
      })),
  };
}

function maybeThrowIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error('Creator orchestration aborted');
  }
}

export async function runCreatorOrchestrator(
  input: CreatorOrchestratorInput
): Promise<CreatorOrchestratorResult> {
  maybeThrowIfAborted(input.signal);

  emit(input, {
    type: 'creator_progress',
    payload: {
      phase: 'discovery',
      message: 'Planning the next best step',
      highlightType: 'status',
    },
  });

  // Stage A: fast initial guidance to give users immediate direction while generation starts.
  const preGuidance = await getCreatorGuidance(
    buildGuidanceInput({
      workspaceId: input.workspaceId,
      status: 'building',
      conversationHistory: [
        ...(input.conversationHistory ?? []),
        {
          id: `msg-${Date.now()}-planner`,
          role: 'user',
          content: input.userMessage,
          timestamp: new Date(),
        },
      ],
    })
  );
  if (preGuidance.actions.length > 0) {
    emit(input, {
      type: 'creator_action_suggestions',
      payload: { actions: preGuidance.actions },
    });
  }

  maybeThrowIfAborted(input.signal);

  // Stage B: run primary creator processing and stream progress.
  const result = await processCreatorMessage(
    {
      context: input.context,
      conversationHistory: input.conversationHistory,
      onProgress: (event) => {
        emit(input, {
          type: 'creator_progress',
          payload: event,
        });
        if (!event.toolName) return;
        emit(input, {
          type: 'creator_tool_activity',
          payload: {
            name: event.toolName,
            status: inferToolStatusFromProgressMessage(event.message),
            message: event.highlight ?? event.message,
            timestamp: Date.now(),
          },
        });
      },
    },
    input.userMessage
  );

  maybeThrowIfAborted(input.signal);

  // Stage C: reconcile plan and updated guidance.
  const planDelta = buildPlanDelta({
    userMessage: input.userMessage,
    result,
    conversationHistory: input.conversationHistory ?? [],
  });
  emit(input, {
    type: 'creator_plan_delta',
    payload: planDelta,
  });

  const syntheticAssistantMessage: CreatorMessage = {
    id: `msg-${Date.now()}-assistant-synthetic`,
    role: 'assistant',
    content: result.message?.trim() || result.thinking?.trim() || 'Creator updated the workflow.',
    timestamp: new Date(),
    metadata: {
      creatorLifecycle: {
        stage: result.status === 'building' ? 'discovery' : 'design',
        nextAction: planDelta.nextQuestion
          ? `Answer: ${planDelta.nextQuestion.label}`
          : result.status === 'ready'
            ? 'Review visual design and proceed to Connections.'
            : 'Continue discovery.',
        runnableConfidence: planDelta.runnableConfidence,
        planLedger: {
          goal: planDelta.goal,
          stage: planDelta.stage,
          resolvedDecisions: planDelta.resolvedDecisions ?? [],
          openDecisions: planDelta.openDecisions ?? [],
          assumptions: planDelta.assumptions ?? [],
          nextQuestion: planDelta.nextQuestion,
          runnableConfidence: planDelta.runnableConfidence,
          updatedAt: Date.now(),
        },
        requiredQuestions: (planDelta.openDecisions ?? [])
          .filter((question) => question.requiredNow !== false)
          .map((question) => ({
            ...question,
            requiredNow: true,
          })),
        optionalQuestions: (planDelta.openDecisions ?? [])
          .filter((question) => question.requiredNow === false)
          .map((question) => ({
            ...question,
            requiredNow: false,
          })),
        assumptions: planDelta.assumptions ?? [],
      },
    },
  };

  const postGuidance = await getCreatorGuidance(
    buildGuidanceInput({
      workspaceId: input.workspaceId,
      status: result.status === 'building' ? 'building' : 'ready',
      conversationHistory: [
        ...(input.conversationHistory ?? []),
        {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: input.userMessage,
          timestamp: new Date(),
        },
      ],
      appendedAssistantMessage: syntheticAssistantMessage,
    })
  );

  emit(input, {
    type: 'creator_action_suggestions',
    payload: { actions: postGuidance.actions },
  });

  return {
    result,
    planDelta,
    guidanceActions: postGuidance.actions,
  };
}
