'use client';

import { useState } from 'react';
import { Clock, Globe, Zap, Hand, Info, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TriggerConfig, TriggerType } from '@/lib/baleybot/types';

interface TriggerConfigProps {
  value: TriggerConfig | undefined;
  onChange: (config: TriggerConfig | undefined) => void;
  availableBaleybots?: Array<{ id: string; name: string }>;
  className?: string;
}

const TRIGGER_OPTIONS: Array<{
  type: TriggerType;
  label: string;
  description: string;
  Icon: typeof Clock;
}> = [
  {
    type: 'manual',
    label: 'Manual',
    description: 'Triggered by user action',
    Icon: Hand,
  },
  {
    type: 'schedule',
    label: 'Schedule',
    description: 'Run on a cron schedule',
    Icon: Clock,
  },
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Triggered via HTTP endpoint',
    Icon: Globe,
  },
  {
    type: 'other_bb',
    label: 'BB Completion',
    description: 'Triggered when another BaleyBot completes',
    Icon: Zap,
  },
];

const COMMON_SCHEDULES = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Every month on the 1st', value: '0 0 1 * *' },
];

export function TriggerConfig({
  value,
  onChange,
  availableBaleybots = [],
  className,
}: TriggerConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customSchedule, setCustomSchedule] = useState(value?.schedule || '');

  const selectedType = value?.type || 'manual';
  const selectedOption = TRIGGER_OPTIONS.find((opt) => opt.type === selectedType);

  const handleTypeChange = (type: TriggerType) => {
    if (type === 'manual') {
      onChange(undefined); // Manual is default, no config needed
    } else {
      onChange({
        type,
        enabled: true,
        ...(type === 'schedule' && { schedule: '0 9 * * *' }),
        ...(type === 'other_bb' && { completionType: 'success' as const }),
      });
    }
    setIsOpen(false);
  };

  const handleScheduleChange = (schedule: string) => {
    setCustomSchedule(schedule);
    onChange({
      ...value,
      type: 'schedule',
      schedule,
      enabled: true,
    });
  };

  const handleSourceBBChange = (sourceBaleybotId: string) => {
    onChange({
      ...value,
      type: 'other_bb',
      sourceBaleybotId,
      enabled: true,
    });
  };

  const handleCompletionTypeChange = (completionType: 'success' | 'failure' | 'completion') => {
    onChange({
      ...value,
      type: 'other_bb',
      completionType,
      enabled: true,
    });
  };

  const handleWebhookPathChange = (webhookPath: string) => {
    onChange({
      ...value,
      type: 'webhook',
      webhookPath: webhookPath || undefined,
      enabled: true,
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Trigger Type Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Trigger Type
        </label>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              'w-full flex items-center justify-between gap-3 p-3 rounded-xl',
              'border border-border/50 bg-card/50 hover:bg-card/80',
              'transition-all duration-200',
              isOpen && 'ring-2 ring-primary/20'
            )}
          >
            <div className="flex items-center gap-3">
              {selectedOption && (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <selectedOption.Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{selectedOption.label}</div>
                    <div className="text-xs text-muted-foreground">{selectedOption.description}</div>
                  </div>
                </>
              )}
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
              {TRIGGER_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => handleTypeChange(option.type)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors',
                    option.type === selectedType && 'bg-primary/5'
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <option.Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Configuration */}
      {selectedType === 'schedule' && (
        <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Schedule (Cron Expression)
          </label>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {COMMON_SCHEDULES.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleScheduleChange(preset.value)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  value?.schedule === preset.value
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border/50 hover:bg-muted/50'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <input
            type="text"
            value={customSchedule}
            onChange={(e) => handleScheduleChange(e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Cron format: minute hour day-of-month month day-of-week.
              Example: &quot;0 9 * * 1-5&quot; runs at 9am on weekdays.
            </span>
          </div>
        </div>
      )}

      {/* Webhook Configuration */}
      {selectedType === 'webhook' && (
        <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/30">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-500" />
            Webhook Path (Optional)
          </label>

          <input
            type="text"
            value={value?.webhookPath || ''}
            onChange={(e) => handleWebhookPathChange(e.target.value)}
            placeholder="/api/trigger/my-bot"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              A unique webhook URL will be generated for this BaleyBot.
              POST requests to this URL will trigger execution.
            </span>
          </div>
        </div>
      )}

      {/* BB Completion Configuration */}
      {selectedType === 'other_bb' && (
        <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/30">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              Source BaleyBot
            </label>

            {availableBaleybots.length > 0 ? (
              <select
                value={value?.sourceBaleybotId || ''}
                onChange={(e) => handleSourceBBChange(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a BaleyBot...</option>
                {availableBaleybots.map((bb) => (
                  <option key={bb.id} value={bb.id}>
                    {bb.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No other BaleyBots available to trigger from.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Trigger On</label>
            <div className="flex gap-2">
              {(['success', 'failure', 'completion'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleCompletionTypeChange(type)}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs rounded-lg border transition-colors capitalize',
                    value?.completionType === type
                      ? type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                        : type === 'failure'
                          ? 'bg-red-500/10 border-red-500/30 text-red-600'
                          : 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border/50 hover:bg-muted/50'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              This BaleyBot will be triggered automatically when the source BaleyBot
              completes with the selected status.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact trigger badge for display on cards
 */
export function TriggerBadge({
  trigger,
  className,
}: {
  trigger: TriggerConfig | undefined;
  className?: string;
}) {
  if (!trigger || trigger.type === 'manual') {
    return null;
  }

  const config = TRIGGER_OPTIONS.find((opt) => opt.type === trigger.type);
  if (!config) return null;

  const Icon = config.Icon;

  const getLabel = () => {
    switch (trigger.type) {
      case 'schedule':
        return trigger.schedule || 'Scheduled';
      case 'webhook':
        return 'Webhook';
      case 'other_bb':
        return `On ${trigger.completionType || 'completion'}`;
      default:
        return config.label;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full',
        'bg-amber-500/10 text-amber-600 border border-amber-500/20',
        trigger.type === 'webhook' && 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        trigger.type === 'other_bb' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {getLabel()}
    </span>
  );
}
