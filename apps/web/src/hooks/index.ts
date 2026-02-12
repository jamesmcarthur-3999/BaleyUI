/**
 * Hooks
 *
 * Barrel export for all custom hooks.
 */

// Streaming hooks
export * from './useStreamState';
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

// Accessibility hooks
export * from './useGridNavigation';
export * from './useFocusTrap';
// Note: useAccessibleFocusTrap (options-based, uses accessibility lib) is exported from useKeyboardNavigation
// useFocusTrap (boolean-based, manual Tab handling) is exported from useFocusTrap
