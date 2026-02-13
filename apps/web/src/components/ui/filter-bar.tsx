import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  FilterBar (root container)                                         */
/* ------------------------------------------------------------------ */

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-center', className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar.Search                                                   */
/* ------------------------------------------------------------------ */

interface FilterBarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

function FilterBarSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className = 'flex-1',
  'aria-label': ariaLabel,
}: FilterBarSearchProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={ariaLabel}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar.Select                                                   */
/* ------------------------------------------------------------------ */

interface FilterBarSelectOption {
  value: string;
  label: string;
}

interface FilterBarSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: FilterBarSelectOption[];
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

function FilterBarSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  'aria-label': ariaLabel,
}: FilterBarSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar.ViewToggle                                               */
/* ------------------------------------------------------------------ */

interface ViewToggleOption {
  value: string;
  icon: React.ElementType;
  label: string;
}

interface FilterBarViewToggleProps {
  value: string;
  onChange: (value: string) => void;
  options: ViewToggleOption[];
}

function FilterBarViewToggle({ value, onChange, options }: FilterBarViewToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border p-1">
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <Button
            key={opt.value}
            variant={value === opt.value ? 'default' : 'ghost'}
            size="icon"
            onClick={() => onChange(opt.value)}
            aria-label={opt.label}
            className="h-8 w-8"
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar.Results (standalone)                                     */
/* ------------------------------------------------------------------ */

interface FilterBarResultsProps {
  showing: number;
  total: number;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  className?: string;
}

function FilterBarResults({
  showing,
  total,
  hasFilters,
  onClearFilters,
  className,
}: FilterBarResultsProps) {
  return (
    <div className={cn('mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground', className)}>
      <span>
        Showing <span className="font-medium text-foreground">{showing}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </span>
      {hasFilters && onClearFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

FilterBar.Search = FilterBarSearch;
FilterBar.Select = FilterBarSelect;
FilterBar.ViewToggle = FilterBarViewToggle;
FilterBar.Results = FilterBarResults;

export { FilterBar };
export type {
  FilterBarProps,
  FilterBarSearchProps,
  FilterBarSelectProps,
  FilterBarSelectOption,
  FilterBarViewToggleProps,
  ViewToggleOption,
  FilterBarResultsProps,
};
