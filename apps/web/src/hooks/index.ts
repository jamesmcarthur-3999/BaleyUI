/**
 * Hooks
 *
 * Barrel export for all custom hooks.
 */

// Streaming hooks
// NOTE: useStreamState is NOT barrel-exported because it imports @baleybots/chat,
// which transitively pulls in @baleybots/auth → express → fs. This breaks any
// 'use client' page that imports from @/hooks. Import it directly when needed:
//   import { streamReducer, ... } from '@/hooks/useStreamState';
export * from './useVisibilityReconnect';
export * from './useExecutionStream';
export * from './useExecutionTimeline';
export * from './use-persisted-date-range';

// Performance hooks
export * from './useVirtualList';
export * from './useAutoSave';
export * from './useDebounce';
export * from './useOptimizedEvents';
export * from './useBalWorker';

// Accessibility hooks
export * from './useKeyboardNavigation';

// State management hooks
export * from './useDirtyState';
export * from './useNavigationGuard';
export * from './useHistory';

// BaleyBot editor hooks
export * from './useBaleybotPersistence';
export * from './useSessionRecovery';
export * from './useEditorNavigation';
export * from './useReadiness';

// File hooks
export * from './useFileReader';

// Accessibility hooks
export * from './useGridNavigation';
export * from './useFocusTrap';
// Note: useAccessibleFocusTrap (options-based, uses accessibility lib) is exported from useKeyboardNavigation
// useFocusTrap (boolean-based, manual Tab handling) is exported from useFocusTrap
