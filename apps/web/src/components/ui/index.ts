/**
 * UI Components
 *
 * shadcn/ui + Radix primitives - the core UI component library.
 */

// Feedback & Alerts
export * from './alert';
export * from './alert-dialog';
export * from './toast';
export * from './toaster';
export { useToast } from './use-toast';

// Buttons & Actions
export { Button, buttonVariants } from './button';
export { ConfirmButton, type ConfirmButtonProps } from './confirm-button';
export { InlineEdit, type InlineEditProps } from './inline-edit';

// Cards & Containers
export * from './card';
export * from './collapsible';
export * from './dialog';
export * from './scroll-area';
export { SlidePanel, SlidePanelFooter, SlidePanelClose, type SlidePanelProps } from './slide-panel';

// Forms & Inputs
export * from './checkbox';
export * from './form';
export * from './input';
export * from './label';
export * from './radio-group';
export * from './select';
export * from './slider';
export * from './switch';
export * from './textarea';
export { SchemaForm } from './schema-form';

// Navigation & Menus
export * from './breadcrumbs';
export * from './dropdown-menu';
export * from './tabs';
export * from './tooltip';
export { ActionPopover, type ActionPopoverProps, type ActionItem, type ActionGroup } from './action-popover';

// Data Display
export * from './badge';
export * from './progress';
export * from './separator';
export * from './table';
export { StatusBadge } from './status-badge';
export { StatusIndicator } from './status-indicator';

// Loading States
export { Skeleton } from './skeleton';
export { ListSkeleton } from './list-skeleton';
export { LoadingDots } from './loading-dots';

// Empty States
export { EmptyState } from './empty-state';

// Date
export { DateRangePicker } from './date-range-picker';
