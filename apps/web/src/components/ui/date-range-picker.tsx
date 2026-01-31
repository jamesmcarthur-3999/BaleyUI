'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (range: { startDate: Date; endDate: Date }) => void;
  presets?: Array<{ label: string; days: number }>;
  className?: string;
}

const defaultPresets = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  presets = defaultPresets,
  className,
}: DateRangePickerProps) {
  const [isCustom, setIsCustom] = React.useState(false);
  const [tempStartDate, setTempStartDate] = React.useState(format(startDate, 'yyyy-MM-dd'));
  const [tempEndDate, setTempEndDate] = React.useState(format(endDate, 'yyyy-MM-dd'));

  // Check if current range matches a preset
  const getCurrentPreset = () => {
    const now = new Date();
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const matchedPreset = presets.find((preset) => {
      const presetStart = new Date(now);
      presetStart.setDate(presetStart.getDate() - preset.days);
      const presetDiffDays = Math.ceil((now.getTime() - presetStart.getTime()) / (1000 * 60 * 60 * 24));
      return Math.abs(diffDays - presetDiffDays) <= 1; // Allow 1 day tolerance
    });

    return matchedPreset ? matchedPreset.label : null;
  };

  const currentPreset = getCurrentPreset();

  const handlePresetClick = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    onChange({ startDate: start, endDate: end });
    setIsCustom(false);
  };

  const handleCustomClick = () => {
    setIsCustom(true);
    setTempStartDate(format(startDate, 'yyyy-MM-dd'));
    setTempEndDate(format(endDate, 'yyyy-MM-dd'));
  };

  const handleApplyCustom = () => {
    const start = new Date(tempStartDate);
    const end = new Date(tempEndDate);

    if (start <= end) {
      onChange({ startDate: start, endDate: end });
      setIsCustom(false);
    }
  };

  const handleCancelCustom = () => {
    setIsCustom(false);
    setTempStartDate(format(startDate, 'yyyy-MM-dd'));
    setTempEndDate(format(endDate, 'yyyy-MM-dd'));
  };

  const formatDateRange = () => {
    const start = format(startDate, 'MMM d');
    const end = format(endDate, 'MMM d, yyyy');
    return `${start} - ${end}`;
  };

  if (isCustom) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={tempStartDate}
          onChange={(e) => setTempStartDate(e.target.value)}
          className="w-[140px] h-9"
        />
        <span className="text-muted-foreground">to</span>
        <Input
          type="date"
          value={tempEndDate}
          onChange={(e) => setTempEndDate(e.target.value)}
          className="w-[140px] h-9"
        />
        <Button size="sm" onClick={handleApplyCustom}>
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={handleCancelCustom}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      <div className="flex items-center gap-1 border border-input rounded-md p-1">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant={currentPreset === preset.label ? 'default' : 'ghost'}
            onClick={() => handlePresetClick(preset.days)}
            className="h-7 px-3"
          >
            {preset.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={!currentPreset ? 'default' : 'ghost'}
          onClick={handleCustomClick}
          className="h-7 px-3"
        >
          Custom
        </Button>
      </div>
      <span className="text-sm text-muted-foreground ml-2">{formatDateRange()}</span>
    </div>
  );
}
