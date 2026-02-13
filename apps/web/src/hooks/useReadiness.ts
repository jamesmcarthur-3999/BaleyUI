/**
 * useReadiness Hook
 *
 * Encapsulates readiness computation, design confirmation, and specialist
 * signal tracking for the BaleyBot editor.
 *
 * Owns: readiness state, specialistSignals state, isDesignConfirmed state,
 * isDesignReviewRequired derivation, readiness computation effect (E9),
 * design auto-confirm effect (E10).
 *
 * Note: Uses a ref for resetDesignGateReminder to break a circular dependency
 * with useEditorNavigation (which needs readiness from this hook). The ref is
 * populated by the page after both hooks return, but before effects fire.
 */

import { useState, useEffect, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { computeReadiness, createInitialReadiness } from '@/lib/baleybot/readiness';
import type { ReadinessState, SpecialistSignals } from '@/lib/baleybot/readiness';
import { isSameReadiness } from '@/lib/baleybot/creator-helpers';
import { getConnectionSummary } from '@/lib/baleybot/tools/requirements-scanner';
import type { VisualEntity } from '@/lib/baleybot/creator-types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseReadinessArgs {
  entities: VisualEntity[];
  balCode: string;
  testCases: Array<{ status: string }>;
  triggerConfig: unknown;
  workspaceConnections: Array<{ type: string; status: string | null }> | undefined;
  analyticsData: { total?: number } | undefined;
  isNew: boolean;
  /** Status derived from component state */
  status: string;
  /**
   * Ref to resetDesignGateReminder from useEditorNavigation.
   * Uses a ref to break the circular dependency: useReadiness provides
   * readiness → useEditorNavigation, and useEditorNavigation provides
   * resetDesignGateReminder → useReadiness. The ref is populated after
   * both hooks return but before effects fire.
   */
  resetDesignGateReminderRef: RefObject<(() => void) | null>;
}

export interface UseReadinessResult {
  readiness: ReadinessState;
  isDesignConfirmed: boolean;
  setIsDesignConfirmed: (confirmed: boolean) => void;
  isDesignReviewRequired: boolean;
  specialistSignals: SpecialistSignals;
  setSpecialistSignals: Dispatch<SetStateAction<SpecialistSignals>>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function useReadiness(args: UseReadinessArgs): UseReadinessResult {
  const {
    entities,
    balCode,
    testCases,
    triggerConfig,
    workspaceConnections,
    analyticsData,
    isNew,
    status,
    resetDesignGateReminderRef,
  } = args;

  // -- State --
  const [readiness, setReadiness] = useState(createInitialReadiness());
  const [specialistSignals, setSpecialistSignals] = useState<SpecialistSignals>({});
  const [isDesignConfirmed, setIsDesignConfirmed] = useState(!isNew);

  // -- Derived --
  const isDesignReviewRequired =
    status === 'ready' && entities.length > 0 && !isDesignConfirmed;

  // -------------------------------------------------------------------------
  // Compute readiness whenever relevant state changes (Effect E9)
  // -------------------------------------------------------------------------

  useEffect(() => {
    const allTools = entities.flatMap(e => e.tools);
    const wsConns = workspaceConnections ?? [];
    const connectedTypes = new Set(wsConns.filter(c => c.status === 'connected').map(c => c.type));
    const hasAiProvider = connectedTypes.has('openai') || connectedTypes.has('anthropic') || connectedTypes.has('ollama');

    // Check tool-specific connection requirements
    const summary = getConnectionSummary(allTools);
    const toolRequirementsMet = summary.required.every(req =>
      wsConns.some(c => c.type === req.connectionType && (c.status === 'connected' || c.status === 'unconfigured'))
    );
    const allConnectionsMet = hasAiProvider && (summary.required.length === 0 || toolRequirementsMet);

    const newReadiness = computeReadiness({
      hasBalCode: balCode.length > 0,
      hasEntities: entities.length > 0,
      tools: allTools,
      connectionsMet: allConnectionsMet,
      hasConnections: wsConns.length > 0,
      testsPassed: testCases.length > 0 && testCases.every(t => t.status === 'passed'),
      hasTestRuns: testCases.filter(t => t.status !== 'pending').length,
      hasTrigger: !!triggerConfig,
      hasMonitoring: (analyticsData?.total ?? 0) >= 1,
      specialist: specialistSignals,
    });
    setReadiness((prev) => (isSameReadiness(prev, newReadiness) ? prev : newReadiness));
  }, [
    balCode,
    entities,
    testCases,
    triggerConfig,
    workspaceConnections,
    analyticsData,
    isDesignConfirmed,
    specialistSignals,
  ]);

  // -------------------------------------------------------------------------
  // Once user has progressed past design, don't block stage tabs again (E10)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isDesignConfirmed) return;
    const hasProgressedBeyondDesign =
      readiness.connected === 'complete' ||
      readiness.tested !== 'incomplete' ||
      readiness.integrated === 'complete' ||
      readiness.monitored === 'complete';
    if (hasProgressedBeyondDesign) {
      setIsDesignConfirmed(true);
      resetDesignGateReminderRef.current?.();
    }
  // resetDesignGateReminderRef is a stable ref — no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesignConfirmed, readiness]);

  return {
    readiness,
    isDesignConfirmed,
    setIsDesignConfirmed,
    isDesignReviewRequired,
    specialistSignals,
    setSpecialistSignals,
  };
}
