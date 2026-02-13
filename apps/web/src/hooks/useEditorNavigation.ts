/**
 * useEditorNavigation Hook
 *
 * Manages tab navigation, builder mode, mobile view, and design-gate
 * reminders for the BaleyBot editor.
 *
 * Encapsulates: viewMode, builderMode, mobileView, lastAINavigatedTab,
 * navigateToTab function, showAdvancedUI derivation, availableTabs
 * computation, and auto-switch effect.
 */

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AdaptiveTab, BuilderPresentationMode } from '@/lib/baleybot/creator-types';
import type { ReadinessState } from '@/lib/baleybot/readiness';
import { computeAvailableTabs, isAdvancedEditorTab } from '@/lib/baleybot/creator-helpers';
import { POST_DESIGN_TABS } from '@/lib/baleybot/creator-constants';
import { useToast } from '@/components/ui/use-toast';

// ============================================================================
// TYPES
// ============================================================================

export interface UseEditorNavigationArgs {
  readiness: ReadinessState;
  savedBaleybotId: string | null;
  isDesignReviewRequired: boolean;
  /** When plan data exists, the plan tab is visible */
  hasPlanData?: boolean;
}

export interface UseEditorNavigationResult {
  viewMode: AdaptiveTab;
  /** Imperative setter for cases where navigateToTab isn't appropriate (e.g., init from DB) */
  setViewMode: (mode: AdaptiveTab) => void;
  builderMode: BuilderPresentationMode;
  setBuilderMode: Dispatch<SetStateAction<BuilderPresentationMode>>;
  showAdvancedUI: boolean;
  mobileView: 'editor' | 'chat';
  setMobileView: (view: 'editor' | 'chat') => void;
  availableTabs: AdaptiveTab[];
  navigateToTab: (tab: AdaptiveTab, options?: { bypassDesignGate?: boolean }) => boolean;
  lastAINavigatedTab: string | null;
  setLastAINavigatedTab: (tab: string | null) => void;
  /** Reset the design gate reminder (e.g., after design confirmation changes) */
  resetDesignGateReminder: () => void;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function useEditorNavigation(args: UseEditorNavigationArgs): UseEditorNavigationResult {
  const { readiness, savedBaleybotId, isDesignReviewRequired, hasPlanData } = args;
  const { toast } = useToast();

  // -- State --
  const [viewMode, setViewMode] = useState<AdaptiveTab>('visual');
  const [builderMode, setBuilderMode] = useState<BuilderPresentationMode>('simple');
  const [mobileView, setMobileView] = useState<'editor' | 'chat'>('editor');
  const [lastAINavigatedTab, setLastAINavigatedTab] = useState<string | null>(null);
  const designGateReminderShownRef = useRef(false);

  // -- Derived --
  const showAdvancedUI = builderMode === 'advanced';
  const baseTabs = computeAvailableTabs({
    readiness,
    savedBaleybotId,
    showAdvancedUI,
    isDesignReviewRequired,
  });
  // Prepend plan tab when plan data exists
  const availableTabs: AdaptiveTab[] = hasPlanData
    ? ['plan' as AdaptiveTab, ...baseTabs.filter((t) => t !== 'plan')]
    : baseTabs.filter((t) => t !== 'plan');

  // -------------------------------------------------------------------------
  // navigateToTab
  // -------------------------------------------------------------------------

  const requiresDesignReviewForTab = (tab: AdaptiveTab) =>
    isDesignReviewRequired && POST_DESIGN_TABS.includes(tab);

  const navigateToTab = (tab: AdaptiveTab, options?: { bypassDesignGate?: boolean }): boolean => {
    if (!options?.bypassDesignGate && requiresDesignReviewForTab(tab)) {
      // Soft reminder via toast — don't block navigation
      if (!designGateReminderShownRef.current) {
        designGateReminderShownRef.current = true;
        toast({
          title: 'Review your design',
          description: 'Consider confirming the visual layout before proceeding to setup.',
        });
      }
    }

    setViewMode(tab);
    setMobileView('editor');
    return true;
  };

  // -------------------------------------------------------------------------
  // Auto-switch to visible tab if current becomes hidden (Effect E11)
  // -------------------------------------------------------------------------

  useEffect(() => {
    const visibleTabs = computeAvailableTabs({
      readiness,
      savedBaleybotId,
      showAdvancedUI,
      isDesignReviewRequired,
    });
    // Include plan tab in visibility check when data exists
    const effectiveTabs: AdaptiveTab[] = hasPlanData
      ? ['plan' as AdaptiveTab, ...visibleTabs.filter((t) => t !== 'plan')]
      : visibleTabs.filter((t) => t !== 'plan');
    if (!showAdvancedUI && isAdvancedEditorTab(viewMode)) {
      setViewMode('visual');
      return;
    }
    if (!effectiveTabs.includes(viewMode)) {
      setViewMode('visual');
    }
  }, [readiness, viewMode, showAdvancedUI, savedBaleybotId, isDesignReviewRequired, hasPlanData]);

  // -------------------------------------------------------------------------
  // resetDesignGateReminder — called by page when isDesignConfirmed changes
  // -------------------------------------------------------------------------

  const resetDesignGateReminder = () => {
    designGateReminderShownRef.current = false;
  };

  return {
    viewMode,
    setViewMode,
    builderMode,
    setBuilderMode,
    showAdvancedUI,
    mobileView,
    setMobileView,
    availableTabs,
    navigateToTab,
    lastAINavigatedTab,
    setLastAINavigatedTab,
    resetDesignGateReminder,
  };
}
