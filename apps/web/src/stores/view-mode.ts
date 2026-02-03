/**
 * View Mode Store
 *
 * Manages the current view mode for blocks/flows.
 * Supports three views: Profile, Flow, and Timeline.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export type ViewMode = 'profile' | 'flow' | 'timeline';

interface ViewModeState {
  /** Current view mode */
  viewMode: ViewMode;

  /** Whether the view was automatically selected or user-chosen */
  isAutoSelected: boolean;

  /** Set the view mode */
  setViewMode: (mode: ViewMode, isAuto?: boolean) => void;

  /** Determine the default view based on context */
  getDefaultViewMode: (options: {
    blockType: string;
    hasNodes?: boolean;
    hasExecutions?: boolean;
  }) => ViewMode;

  /** Reset to default state */
  reset: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useViewModeStore = create<ViewModeState>()(
  devtools(
    persist(
      (set, get) => ({
        viewMode: 'profile',
        isAutoSelected: true,

        setViewMode: (mode, isAuto = false) =>
          set({ viewMode: mode, isAutoSelected: isAuto }),

        getDefaultViewMode: ({ blockType, hasNodes, hasExecutions }) => {
          // After execution, show timeline
          if (hasExecutions) {
            return 'timeline';
          }

          // For compositions (flows with nodes), show flow view
          if (hasNodes || blockType === 'router' || blockType === 'pipeline') {
            return 'flow';
          }

          // For single agents, show profile view
          return 'profile';
        },

        reset: () => set({ viewMode: 'profile', isAutoSelected: true }),
      }),
      {
        name: 'baleyui-view-mode',
        partialize: (state) => ({
          viewMode: state.viewMode,
          isAutoSelected: state.isAutoSelected,
        }),
      }
    ),
    { name: 'ViewModeStore' }
  )
);
