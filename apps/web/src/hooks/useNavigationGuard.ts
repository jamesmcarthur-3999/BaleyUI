/**
 * useNavigationGuard Hook
 *
 * Prevents in-app navigation when there are unsaved changes.
 * Shows a confirmation dialog with options to discard, save, or cancel.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Return type for useNavigationGuard
 */
export interface UseNavigationGuardReturn {
  /** Navigate with guard check - shows dialog if dirty */
  guardedNavigate: (path: string) => void;
  /** Whether the confirmation dialog should be shown */
  showDialog: boolean;
  /** Close the dialog without navigating */
  closeDialog: () => void;
  /** Discard changes and navigate */
  handleDiscard: () => void;
  /** Save then navigate (caller provides save function result) */
  handleSaveAndLeave: () => Promise<void>;
  /** The pending navigation path (for display in dialog) */
  pendingPath: string | null;
}

/**
 * Hook that guards navigation when there are unsaved changes
 *
 * @param isDirty - Whether there are unsaved changes
 * @param onSave - Async function to save changes, returns true if successful
 * @returns Navigation guard controls
 *
 * @example
 * ```tsx
 * const { isDirty } = useDirtyState(state);
 * const { guardedNavigate, showDialog, handleDiscard, handleSaveAndLeave, closeDialog } =
 *   useNavigationGuard(isDirty, handleSave);
 *
 * // Use guardedNavigate instead of router.push
 * const handleBack = () => guardedNavigate('/dashboard/baleybots');
 *
 * // Render dialog
 * <AlertDialog open={showDialog} onOpenChange={(open) => !open && closeDialog()}>
 *   <AlertDialogContent>
 *     <AlertDialogHeader>
 *       <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
 *       <AlertDialogDescription>
 *         You have unsaved changes. What would you like to do?
 *       </AlertDialogDescription>
 *     </AlertDialogHeader>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel onClick={closeDialog}>Cancel</AlertDialogCancel>
 *       <Button variant="destructive" onClick={handleDiscard}>Discard</Button>
 *       <Button onClick={handleSaveAndLeave}>Save & Leave</Button>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>
 * ```
 */
export function useNavigationGuard(
  isDirty: boolean,
  onSave: () => Promise<boolean | string | null>
): UseNavigationGuardReturn {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Navigate with guard check
  const guardedNavigate = (path: string) => {
    if (isDirty) {
      setPendingPath(path);
      setShowDialog(true);
    } else {
      router.push(path);
    }
  };

  // Close dialog without navigating
  const closeDialog = () => {
    setShowDialog(false);
    setPendingPath(null);
  };

  // Discard changes and navigate
  const handleDiscard = () => {
    setShowDialog(false);
    if (pendingPath) {
      router.push(pendingPath);
    }
    setPendingPath(null);
  };

  // Save then navigate
  const handleSaveAndLeave = async () => {
    const saved = await onSave();
    if (saved && pendingPath) {
      setShowDialog(false);
      router.push(pendingPath);
      setPendingPath(null);
    } else {
      // Save failed, keep dialog open or close with error shown elsewhere
      setShowDialog(false);
      setPendingPath(null);
    }
  };

  return {
    guardedNavigate,
    showDialog,
    closeDialog,
    handleDiscard,
    handleSaveAndLeave,
    pendingPath,
  };
}
