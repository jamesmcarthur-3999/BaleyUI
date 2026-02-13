'use client';

import { useState, type ReactNode } from 'react';
import { Rocket, CirclePlay, PauseCircle, RefreshCw, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RuntimeSelector } from './RuntimeSelector';
import { ReadinessChecklist } from './ReadinessChecklist';
import { ExportCard } from './ExportCard';
import { cn } from '@/lib/utils';
import type { ReadinessState, ReadinessDimension } from '@/lib/baleybot/readiness';
import type { LaunchKit } from '@/lib/baleybot/types';

/* ------------------------------------------------------------------ */
/*  Inline subcomponents                                               */
/* ------------------------------------------------------------------ */

function DeploymentStatus({
  stage,
  lastDeployedAt,
}: {
  stage: string;
  lastDeployedAt?: Date | null;
}) {
  const dotColor =
    stage === 'live'
      ? 'bg-emerald-500'
      : stage === 'launch_prep'
        ? 'bg-amber-500 animate-pulse-soft'
        : stage === 'paused'
          ? 'bg-muted-foreground/50'
          : 'bg-muted-foreground/30';

  const label =
    stage === 'live'
      ? 'Live'
      : stage === 'launch_prep'
        ? 'Preparing'
        : stage === 'paused'
          ? 'Paused'
          : 'Draft';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotColor)} />
      <span className="text-sm font-medium">{label}</span>
      {lastDeployedAt && (
        <span className="text-xs text-muted-foreground">
          {new Date(lastDeployedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function CostPreview({ modelCount }: { modelCount: number }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-3 flex items-start gap-3">
      <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-medium">Estimated cost per run</p>
        <p className="text-sm tabular-nums text-muted-foreground">~$0.003 - $0.012</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Based on {modelCount} model{modelCount === 1 ? '' : 's'} in this workflow
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ReadinessItemConfig {
  dimension: ReadinessDimension;
  label: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export interface DeployPanelProps {
  // Core state
  lifecycleStage: string;
  launchKit: LaunchKit | null;
  launchBusy: boolean;
  savedBaleybotId: string | null;
  baleybotName: string;

  // Readiness
  readiness: ReadinessState | null;
  readinessItems: ReadinessItemConfig[];
  blockingIssues?: string[];
  readyForLaunchPrep?: boolean;

  // Entity info (for export card)
  entityCount: number;
  toolCount: number;
  providerCount: number;
  localEnabled?: boolean;

  // Mutations (pending state)
  isGeneratingLaunchKit: boolean;
  isPromotingToLive: boolean;

  // Handlers
  onGenerateLaunchKit: () => void;
  onPromoteToLive: () => void;
  onPauseOrResume: () => void;
  onRefreshReadiness: () => void;

  // Inline content slots for trigger/connection setup
  triggerSetupSlot?: ReactNode;
  connectionSetupSlot?: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DeployPanel({
  lifecycleStage,
  launchKit,
  launchBusy,
  savedBaleybotId,
  baleybotName,
  readiness,
  readinessItems,
  blockingIssues,
  readyForLaunchPrep,
  entityCount,
  toolCount,
  providerCount,
  localEnabled = false,
  isGeneratingLaunchKit,
  isPromotingToLive,
  onGenerateLaunchKit,
  onPromoteToLive,
  onPauseOrResume,
  onRefreshReadiness,
  triggerSetupSlot,
  connectionSetupSlot,
}: DeployPanelProps) {
  const [runtimeTarget, setRuntimeTarget] = useState<'cloud' | 'local'>('cloud');

  return (
    <div className="h-full overflow-auto bg-background rounded-lg border p-5 space-y-5">
      {/* Status header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Go Live</h2>
          <DeploymentStatus stage={lifecycleStage} />
        </div>
        <p className="text-sm text-muted-foreground">
          {lifecycleStage === 'live'
            ? 'Your bot is live and running.'
            : lifecycleStage === 'paused'
              ? 'Your bot is paused.'
              : 'Check the status below, then launch when ready.'}
        </p>
      </div>

      {/* Runtime selector */}
      <RuntimeSelector
        value={runtimeTarget}
        onChange={setRuntimeTarget}
        localEnabled={localEnabled}
      />

      {/* Cloud path */}
      {runtimeTarget === 'cloud' && (
        <>
          {/* Readiness checklist */}
          {readiness && (
            <ReadinessChecklist
              readiness={readiness}
              items={readinessItems}
            />
          )}

          {/* Inline trigger setup */}
          {triggerSetupSlot}

          {/* Inline connection setup */}
          {connectionSetupSlot}

          {/* Blocking issues */}
          {blockingIssues && blockingIssues.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Needs attention</p>
              {blockingIssues.map((issue, idx) => (
                <p key={`${issue}-${idx}`} className="text-xs text-amber-800/90 dark:text-amber-200/90">
                  {issue}
                </p>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {lifecycleStage !== 'live' && lifecycleStage !== 'paused' && !launchKit && (
              <Button
                onClick={onGenerateLaunchKit}
                disabled={!savedBaleybotId || (readyForLaunchPrep === false)}
                loading={isGeneratingLaunchKit}
              >
                <Rocket className="h-4 w-4 mr-2" />
                Prepare Launch
              </Button>
            )}
            {launchKit && lifecycleStage !== 'live' && lifecycleStage !== 'paused' && (
              <Button
                onClick={onPromoteToLive}
                disabled={!savedBaleybotId}
                loading={isPromotingToLive}
              >
                <CirclePlay className="h-4 w-4 mr-2" />
                Go Live
              </Button>
            )}
            {(lifecycleStage === 'live' || lifecycleStage === 'paused') && (
              <Button
                variant="outline"
                onClick={onPauseOrResume}
                loading={launchBusy}
              >
                {lifecycleStage === 'live' ? (
                  <PauseCircle className="h-4 w-4 mr-2" />
                ) : (
                  <CirclePlay className="h-4 w-4 mr-2" />
                )}
                {lifecycleStage === 'live' ? 'Pause' : 'Resume'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onRefreshReadiness} disabled={launchBusy}>
              <RefreshCw className={cn('h-3.5 w-3.5', launchBusy && 'animate-spin')} />
            </Button>
          </div>
        </>
      )}

      {/* Local path */}
      {runtimeTarget === 'local' && savedBaleybotId && (
        <>
          <ExportCard
            baleybotId={savedBaleybotId}
            name={baleybotName}
            entityCount={entityCount}
            toolCount={toolCount}
            providerCount={providerCount}
          />
          <CostPreview modelCount={providerCount} />
        </>
      )}
    </div>
  );
}
