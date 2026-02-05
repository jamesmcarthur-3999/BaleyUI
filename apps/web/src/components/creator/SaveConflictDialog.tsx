'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, RefreshCw, Save } from 'lucide-react';

/**
 * Actions available for resolving save conflicts
 */
export type ConflictAction = 'cancel' | 'reload' | 'force-save';

interface SaveConflictDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when user selects an action */
  onAction: (action: ConflictAction) => void;
  /** Whether an action is in progress */
  isLoading?: boolean;
  /** Name of the BaleyBot for display */
  baleybotName?: string;
}

/**
 * Dialog for resolving save conflicts when optimistic locking fails.
 *
 * Shows when another session has modified the BaleyBot since it was loaded.
 * Offers options to reload (discard local changes) or force save (overwrite remote).
 */
export function SaveConflictDialog({
  open,
  onOpenChange,
  onAction,
  isLoading = false,
  baleybotName,
}: SaveConflictDialogProps) {
  const handleAction = (action: ConflictAction) => {
    if (!isLoading) {
      onAction(action);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle>Save Conflict</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            {baleybotName ? (
              <>
                <strong>{baleybotName}</strong> has been modified elsewhere since you started editing.
              </>
            ) : (
              'This BaleyBot has been modified elsewhere since you started editing.'
            )}
            {' '}Your changes may overwrite those updates.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          {/* Reload option */}
          <button
            onClick={() => handleAction('reload')}
            disabled={isLoading}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
          >
            <RefreshCw className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Reload latest version</p>
              <p className="text-xs text-muted-foreground">
                Discard your local changes and load the current version from the server.
              </p>
            </div>
          </button>

          {/* Force save option */}
          <button
            onClick={() => handleAction('force-save')}
            disabled={isLoading}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
          >
            <Save className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Save anyway</p>
              <p className="text-xs text-muted-foreground">
                Overwrite the server version with your local changes. The other changes will be lost.
              </p>
            </div>
          </button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => handleAction('cancel')} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Check if an error is a save conflict error
 */
export function isSaveConflictError(error: unknown): boolean {
  if (!error) return false;

  // Check for tRPC error with CONFLICT code
  if (typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { code?: string } }).data;
    if (data?.code === 'CONFLICT') return true;
  }

  // Check error message for conflict indicators
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('conflict') ||
      message.includes('version') ||
      message.includes('modified') ||
      message.includes('optimistic') ||
      message.includes('stale')
    );
  }

  return false;
}

export default SaveConflictDialog;
