'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  Database,
  Globe,
  Hand,
  Info,
  Puzzle,
  Upload,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  normalizeTriggerConfig,
  TRIGGER_ADVANCED_TYPES,
  TRIGGER_CORE_TYPES,
  type TriggerConfig,
  type TriggerType,
  validateAndNormalizeTriggerConfig,
} from '@/lib/baleybot/types';
import type {
  BuilderPresentationMode,
  TriggerSetupStep,
} from '@/lib/baleybot/creator-types';

interface TriggerConfigProps {
  value: TriggerConfig | undefined;
  onChange: (config: TriggerConfig | undefined) => void;
  availableBaleybots?: Array<{ id: string; name: string }>;
  availableConnections?: Array<{ id: string; name: string; type: string; status?: string }>;
  workspaceId?: string;
  baleybotId?: string;
  className?: string;
  presentationMode?: BuilderPresentationMode;
  setupStep?: TriggerSetupStep;
  onSetupStepChange?: (step: TriggerSetupStep) => void;
}

interface TriggerOption {
  type: TriggerType;
  label: string;
  description: string;
  Icon: typeof Clock;
}

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    type: 'manual',
    label: 'Manual',
    description: 'You run it whenever you want.',
    Icon: Hand,
  },
  {
    type: 'schedule',
    label: 'Schedule',
    description: 'Runs on a recurring schedule.',
    Icon: Clock,
  },
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Runs when an external app sends data.',
    Icon: Globe,
  },
  {
    type: 'file_upload',
    label: 'File Upload',
    description: 'Runs when files are uploaded.',
    Icon: Upload,
  },
  {
    type: 'other_bb',
    label: 'Another Bot Finishes',
    description: 'Runs after another bot succeeds or fails.',
    Icon: Zap,
  },
  {
    type: 'db_event',
    label: 'Database Event',
    description: 'Runs when a database change happens.',
    Icon: Database,
  },
  {
    type: 'mcp_event',
    label: 'MCP Event',
    description: 'Runs from MCP event signals.',
    Icon: Puzzle,
  },
];

const COMMON_SCHEDULES = [
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every weekday at 9am', value: '0 9 * * 1-5' },
];

const STEP_ORDER: TriggerSetupStep[] = ['start', 'input', 'review'];

function getTriggerOption(type: TriggerType): TriggerOption {
  return TRIGGER_OPTIONS.find((option) => option.type === type) ?? TRIGGER_OPTIONS[0]!;
}

function buildDefaultTrigger(type: TriggerType): TriggerConfig | undefined {
  if (type === 'manual') return undefined;

  if (type === 'schedule') {
    return {
      type,
      enabled: true,
      schedule: '0 9 * * *',
    };
  }

  if (type === 'file_upload') {
    return {
      type,
      enabled: true,
      acceptedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      maxFileSizeMb: 10,
      multiple: false,
      payloadMode: 'metadata',
    };
  }

  if (type === 'other_bb') {
    return {
      type,
      enabled: true,
      completionType: 'completion',
    };
  }

  if (type === 'db_event') {
    return {
      type,
      enabled: true,
      dbEvent: 'insert',
    };
  }

  return {
    type,
    enabled: true,
  };
}

function getOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function TriggerTypeCard({
  option,
  selected,
  onSelect,
}: {
  option: TriggerOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary/60 bg-primary/10'
          : 'border-border/60 bg-background hover:bg-muted/30'
      )}
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <option.Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{option.label}</p>
          <p className="text-xs text-muted-foreground">{option.description}</p>
        </div>
      </div>
    </button>
  );
}

export function TriggerConfig({
  value,
  onChange,
  availableBaleybots = [],
  availableConnections = [],
  workspaceId,
  baleybotId,
  className,
  presentationMode = 'simple',
  setupStep,
  onSetupStepChange,
}: TriggerConfigProps) {
  const [internalStep, setInternalStep] = useState<TriggerSetupStep>('start');
  const [showAdvancedTriggerTypes, setShowAdvancedTriggerTypes] = useState(false);

  const normalized = normalizeTriggerConfig(value) ?? undefined;
  const selectedType: TriggerType = normalized?.type ?? 'manual';
  const selectedOption = getTriggerOption(selectedType);
  const step = setupStep ?? internalStep;
  const setStep = onSetupStepChange ?? setInternalStep;

  const validation = useMemo(
    () => validateAndNormalizeTriggerConfig(normalized ?? { type: 'manual' }),
    [normalized]
  );

  const dbConnections = useMemo(
    () =>
      availableConnections.filter(
        (connection) => connection.type === 'postgres' || connection.type === 'mysql'
      ),
    [availableConnections]
  );

  const hasAdvancedVisible = presentationMode === 'advanced' || showAdvancedTriggerTypes;
  const coreOptions = TRIGGER_OPTIONS.filter((option) => TRIGGER_CORE_TYPES.includes(option.type));
  const advancedOptions = TRIGGER_OPTIONS.filter((option) => TRIGGER_ADVANCED_TYPES.includes(option.type));

  const updateTrigger = (next: Partial<TriggerConfig>) => {
    const candidate = normalizeTriggerConfig({
      ...(normalized ?? buildDefaultTrigger(selectedType)),
      ...next,
      type: next.type ?? selectedType,
    });
    onChange(candidate ?? undefined);
  };

  const chooseTriggerType = (type: TriggerType) => {
    onChange(buildDefaultTrigger(type));
    setStep(type === 'manual' ? 'review' : 'input');
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  const goBack = () => {
    if (stepIndex <= 0) return;
    setStep(STEP_ORDER[stepIndex - 1]!);
  };

  const goNext = () => {
    if (stepIndex >= STEP_ORDER.length - 1) return;
    setStep(STEP_ORDER[stepIndex + 1]!);
  };

  const reviewChecks = [
    {
      label: 'Start condition is selected',
      done: selectedType === 'manual' || Boolean(normalized?.type),
    },
    {
      label: 'Input details are configured',
      done: (() => {
        switch (selectedType) {
          case 'manual':
          case 'webhook':
            return true;
          case 'schedule':
            return Boolean(normalized?.schedule);
          case 'file_upload':
            return Boolean(normalized?.acceptedMimeTypes?.length && normalized.maxFileSizeMb);
          case 'other_bb':
            return Boolean(normalized?.sourceBaleybotId);
          case 'db_event':
            return Boolean(normalized?.dbConnectionId && normalized?.dbTable);
          case 'mcp_event':
            return Boolean(normalized?.mcpServer);
          default:
            return true;
        }
      })(),
    },
    {
      label: 'No setup warnings remain',
      done: validation.issues.length === 0,
    },
  ];

  const showWizardNavigation = true;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
        <p className="text-sm font-medium">Trigger setup</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose what starts this bot, what input it receives, then confirm setup.
        </p>
      </div>

      {showWizardNavigation && (
        <div className="flex items-center gap-2">
          {STEP_ORDER.map((stepName, index) => {
            const active = step === stepName;
            const complete = index < stepIndex;
            const label = stepName === 'start' ? '1. Start' : stepName === 'input' ? '2. Input' : '3. Review';
            return (
              <button
                key={stepName}
                type="button"
                onClick={() => setStep(stepName)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : complete
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {step === 'start' && (
        <div className="space-y-3">
          <div className="grid gap-2">
            {coreOptions.map((option) => (
              <TriggerTypeCard
                key={option.type}
                option={option}
                selected={selectedType === option.type}
                onSelect={() => chooseTriggerType(option.type)}
              />
            ))}
          </div>

          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>Need event-based automation?</span>
            <button
              type="button"
              onClick={() => setShowAdvancedTriggerTypes((previous) => !previous)}
              className="text-primary hover:underline"
            >
              {hasAdvancedVisible ? 'Hide advanced trigger types' : 'Show advanced trigger types'}
            </button>
          </div>

          {hasAdvancedVisible && (
            <div className="grid gap-2 pt-1">
              {advancedOptions.map((option) => (
                <TriggerTypeCard
                  key={option.type}
                  option={option}
                  selected={selectedType === option.type}
                  onSelect={() => chooseTriggerType(option.type)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'input' && (
        <div className="space-y-4 rounded-xl border border-border/60 bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <selectedOption.Icon className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">Input details for {selectedOption.label}</p>
              <p className="text-xs text-muted-foreground">Set the key details this trigger should pass into your bot.</p>
            </div>
          </div>

          {selectedType === 'manual' && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Manual start has no extra setup. You can run this bot directly from the platform.
            </div>
          )}

          {selectedType === 'schedule' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {COMMON_SCHEDULES.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => updateTrigger({ schedule: preset.value, type: 'schedule' })}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                      normalized?.schedule === preset.value
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Cron schedule</label>
                <input
                  type="text"
                  value={normalized?.schedule ?? ''}
                  onChange={(event) => updateTrigger({ type: 'schedule', schedule: event.target.value })}
                  placeholder="0 9 * * *"
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          {selectedType === 'webhook' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Optional path label</label>
                <input
                  type="text"
                  value={normalized?.webhookPath ?? ''}
                  onChange={(event) => updateTrigger({ type: 'webhook', webhookPath: event.target.value })}
                  placeholder="/new-lead"
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {baleybotId ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Webhook URL</p>
                  <code className="text-xs block mt-1 break-all">
                    {workspaceId
                      ? `${getOrigin()}/api/webhooks/baleybots/${workspaceId}/${baleybotId}`
                      : `${getOrigin()}/api/webhooks/baleybots/[workspace-id]/${baleybotId}`}
                  </code>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Save this bot to generate its webhook URL.</p>
              )}
            </div>
          )}

          {selectedType === 'file_upload' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Accepted file types (comma separated)</label>
                <input
                  type="text"
                  value={(normalized?.acceptedMimeTypes ?? []).join(', ')}
                  onChange={(event) =>
                    updateTrigger({
                      type: 'file_upload',
                      acceptedMimeTypes: event.target.value
                        .split(',')
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0),
                    })
                  }
                  placeholder="application/pdf, image/png"
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Max file size (MB)</label>
                  <input
                    type="number"
                    min={1}
                    value={normalized?.maxFileSizeMb ?? 10}
                    onChange={(event) =>
                      updateTrigger({ type: 'file_upload', maxFileSizeMb: Number(event.target.value) || undefined })
                    }
                    className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Payload mode</label>
                  <select
                    value={normalized?.payloadMode ?? 'metadata'}
                    onChange={(event) =>
                      updateTrigger({
                        type: 'file_upload',
                        payloadMode: event.target.value === 'inline_base64' ? 'inline_base64' : 'metadata',
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="metadata">Metadata only</option>
                    <option value="inline_base64">Inline file data (base64)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <span className="text-sm">Allow multiple files</span>
                <button
                  type="button"
                  onClick={() => updateTrigger({ type: 'file_upload', multiple: !(normalized?.multiple ?? false) })}
                  className={cn(
                    'h-6 w-11 rounded-full relative transition-colors',
                    normalized?.multiple ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      normalized?.multiple ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>

              {workspaceId && baleybotId ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Upload endpoint</p>
                  <code className="text-xs block mt-1 break-all">
                    {getOrigin()}/api/triggers/file-upload/{workspaceId}/{baleybotId}
                  </code>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Save this bot to generate its upload endpoint.</p>
              )}
            </div>
          )}

          {selectedType === 'other_bb' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Source bot</label>
                <select
                  value={normalized?.sourceBaleybotId ?? ''}
                  onChange={(event) => updateTrigger({ type: 'other_bb', sourceBaleybotId: event.target.value || undefined })}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select a bot...</option>
                  {availableBaleybots.map((bot) => (
                    <option key={bot.id} value={bot.id}>{bot.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Run when</label>
                <select
                  value={normalized?.completionType ?? 'completion'}
                  onChange={(event) =>
                    updateTrigger({
                      type: 'other_bb',
                      completionType:
                        event.target.value === 'success' ||
                        event.target.value === 'failure' ||
                        event.target.value === 'completion'
                          ? event.target.value
                          : 'completion',
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="completion">Completion (any result)</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </div>
            </div>
          )}

          {selectedType === 'db_event' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Database connection</label>
                <select
                  value={normalized?.dbConnectionId ?? ''}
                  onChange={(event) => updateTrigger({ type: 'db_event', dbConnectionId: event.target.value || undefined })}
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select a database...</option>
                  {dbConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>{connection.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Table or collection</label>
                <input
                  type="text"
                  value={normalized?.dbTable ?? ''}
                  onChange={(event) => updateTrigger({ type: 'db_event', dbTable: event.target.value })}
                  placeholder="users"
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Event type</label>
                <select
                  value={normalized?.dbEvent ?? 'insert'}
                  onChange={(event) =>
                    updateTrigger({
                      type: 'db_event',
                      dbEvent:
                        event.target.value === 'insert' ||
                        event.target.value === 'update' ||
                        event.target.value === 'delete' ||
                        event.target.value === 'change'
                          ? event.target.value
                          : 'insert',
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="insert">Insert</option>
                  <option value="update">Update</option>
                  <option value="delete">Delete</option>
                  <option value="change">Any change</option>
                </select>
              </div>
            </div>
          )}

          {selectedType === 'mcp_event' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">MCP server</label>
                <input
                  type="text"
                  value={normalized?.mcpServer ?? ''}
                  onChange={(event) => updateTrigger({ type: 'mcp_event', mcpServer: event.target.value })}
                  placeholder="workspace-mcp"
                  className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tool</label>
                  <input
                    type="text"
                    value={normalized?.mcpTool ?? ''}
                    onChange={(event) => updateTrigger({ type: 'mcp_event', mcpTool: event.target.value })}
                    placeholder="tool_name"
                    className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Resource</label>
                  <input
                    type="text"
                    value={normalized?.mcpResource ?? ''}
                    onChange={(event) => updateTrigger({ type: 'mcp_event', mcpResource: event.target.value })}
                    placeholder="resource://path"
                    className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
          <p className="text-sm font-medium">Setup check</p>

          <div className="space-y-2">
            {reviewChecks.map((checkItem) => (
              <div key={checkItem.label} className="flex items-center gap-2 text-sm">
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border flex items-center justify-center',
                    checkItem.done
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'border-border/70 text-muted-foreground'
                  )}
                >
                  {checkItem.done ? <Check className="h-3 w-3" /> : <span className="text-[10px]">•</span>}
                </div>
                <span className={checkItem.done ? 'text-foreground' : 'text-muted-foreground'}>{checkItem.label}</span>
              </div>
            ))}
          </div>

          {validation.issues.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Needs attention</p>
              <ul className="mt-1 space-y-1">
                {validation.issues.map((issue) => (
                  <li key={issue} className="text-xs text-amber-700/90 dark:text-amber-200">{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              Trigger setup looks good.
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            This setup is saved automatically when you save the bot.
          </div>
        </div>
      )}

      {showWizardNavigation && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0}
            className={cn(
              'text-xs rounded-lg border px-3 py-1.5 transition-colors',
              stepIndex === 0
                ? 'border-border/40 text-muted-foreground/60 cursor-not-allowed'
                : 'border-border/60 hover:bg-muted/30'
            )}
          >
            Back
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={stepIndex === STEP_ORDER.length - 1}
            className={cn(
              'text-xs rounded-lg border px-3 py-1.5 inline-flex items-center gap-1 transition-colors',
              stepIndex === STEP_ORDER.length - 1
                ? 'border-border/40 text-muted-foreground/60 cursor-not-allowed'
                : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
            )}
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact trigger badge for display on cards.
 */
export function TriggerBadge({
  trigger,
  className,
}: {
  trigger: TriggerConfig | undefined;
  className?: string;
}) {
  const normalized = normalizeTriggerConfig(trigger);
  if (!normalized) return null;

  const option = getTriggerOption(normalized.type);
  const Icon = option.Icon;

  const label = (() => {
    if (normalized.type === 'schedule') return normalized.schedule || 'Schedule';
    if (normalized.type === 'webhook') return 'Webhook';
    if (normalized.type === 'other_bb') return `When bot ${normalized.completionType || 'completes'}`;
    if (normalized.type === 'db_event') return `Database ${normalized.dbEvent || 'change'}`;
    if (normalized.type === 'mcp_event') return 'MCP event';
    if (normalized.type === 'file_upload') return 'File upload';
    return option.label;
  })();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
        'bg-primary/10 border-primary/25 text-primary',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
