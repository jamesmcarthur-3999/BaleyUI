'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeft, Save, Loader2, Pencil, Undo2, Redo2, Keyboard } from 'lucide-react';
import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import { ValidationIndicator } from '@/components/review';

export interface BaleybotHeaderProps {
  displayName: string;
  displayIcon: string;
  description: string;
  isNew: boolean;
  isDirty: boolean;
  lifecycleStage: string;
  validationStatus: ValidationStatus;
  canSave: boolean;
  isSaving: boolean;
  isSavePending: boolean;
  saveDisabledReason: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isEditingDescription: boolean;
  showFullDescription: boolean;
  onBack: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenShortcuts: () => void;
  onDescriptionChange: (value: string) => void;
  onEditDescriptionToggle: (editing: boolean) => void;
  onToggleFullDescription: () => void;
}

export function BaleybotHeader({
  displayName,
  displayIcon,
  description,
  isNew,
  isDirty,
  lifecycleStage,
  validationStatus,
  canSave,
  isSaving,
  isSavePending,
  saveDisabledReason,
  canUndo,
  canRedo,
  isEditingDescription,
  showFullDescription,
  onBack,
  onSave,
  onUndo,
  onRedo,
  onOpenShortcuts,
  onDescriptionChange,
  onEditDescriptionToggle,
  onToggleFullDescription,
}: BaleybotHeaderProps) {
  return (
    <header className="animate-fade-slide-down border-b border-border/60 bg-background/85 backdrop-blur-md">
      {/* Main header row */}
      <div className="flex items-center gap-2 sm:gap-3 w-full px-2 sm:px-4 py-2 sm:py-3">
        {/* Back button */}
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 min-h-10 min-w-10 sm:min-h-11 sm:min-w-11" aria-label="Go back to BaleyBots list">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        {/* Icon and name */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <span className="text-xl sm:text-2xl shrink-0">{displayIcon}</span>
          <h1
            className="text-base sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-[400px]"
            title={displayName.length > 15 ? displayName : undefined}
          >
            {displayName}
          </h1>
          {isDirty && (
            <span className="text-amber-500 text-xs font-medium shrink-0" title="Unsaved changes">
              <span className="hidden sm:inline">(unsaved)</span>
              <span className="sm:hidden">&bull;</span>
            </span>
          )}
          {!isNew && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/10 text-primary shrink-0 uppercase tracking-wide">
              {lifecycleStage.replace('_', ' ')}
            </span>
          )}
          {validationStatus !== 'idle' && (
            <ValidationIndicator status={validationStatus} />
          )}
        </div>

        {/* Undo/Redo buttons — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="min-h-11 min-w-11 h-11 w-11"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Undo (Cmd+Z)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="min-h-11 min-w-11 h-11 w-11"
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Redo (Cmd+Shift+Z)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-px h-4 bg-border mx-1" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onOpenShortcuts}
                  className="min-h-11 min-w-11 h-11 w-11"
                  aria-label="Keyboard shortcuts"
                >
                  <Keyboard className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Keyboard shortcuts (?)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Save button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={saveDisabledReason ? 0 : undefined}>
                <Button
                  onClick={onSave}
                  disabled={!canSave || !!saveDisabledReason}
                  size="sm"
                  className="shrink-0 min-h-10 sm:min-h-9"
                >
                  {isSaving || isSavePending ? (
                    <>
                      <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Save</span>
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {saveDisabledReason && (
              <TooltipContent>
                <p>{saveDisabledReason}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Description row — hidden on mobile */}
      {(description || isEditingDescription) && (
        <div className="hidden sm:block w-full px-4 pb-3 pl-14">
          {isEditingDescription ? (
            <div className="flex gap-2">
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Add a description..."
                className="flex-1 text-sm text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onEditDescriptionToggle(false);
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEditDescriptionToggle(false)}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="group flex items-start gap-2">
              <p
                className={`text-sm text-muted-foreground flex-1 ${
                  !showFullDescription && description.length > 100 ? 'line-clamp-1' : ''
                }`}
              >
                {description}
              </p>
              {description.length > 100 && (
                <button
                  onClick={onToggleFullDescription}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  {showFullDescription ? 'Show less' : 'Show more'}
                </button>
              )}
              <button
                onClick={() => onEditDescriptionToggle(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                title="Edit description"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
