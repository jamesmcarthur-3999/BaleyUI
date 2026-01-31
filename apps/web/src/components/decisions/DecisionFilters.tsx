'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

interface DecisionFiltersProps {
  blockId?: string;
  model?: string;
  startDate?: Date;
  endDate?: Date;
  hasFeedback?: boolean;
  onFilterChange: (filters: {
    blockId?: string;
    model?: string;
    startDate?: Date;
    endDate?: Date;
    hasFeedback?: boolean;
  }) => void;
}

export function DecisionFilters({
  blockId,
  model,
  startDate,
  endDate,
  hasFeedback,
  onFilterChange,
}: DecisionFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  // Fetch blocks for the block selector
  const { data: blocks } = trpc.blocks.list.useQuery();

  // Fetch available models
  const { data: models } = trpc.decisions.getModels.useQuery();

  const handleBlockChange = (value: string) => {
    onFilterChange({
      blockId: value === 'all' ? undefined : value,
      model,
      startDate,
      endDate,
      hasFeedback,
    });
  };

  const handleModelChange = (value: string) => {
    onFilterChange({
      blockId,
      model: value === 'all' ? undefined : value,
      startDate,
      endDate,
      hasFeedback,
    });
  };

  const handleFeedbackChange = (value: string) => {
    let feedbackValue: boolean | undefined;
    if (value === 'with') feedbackValue = true;
    else if (value === 'without') feedbackValue = false;
    else feedbackValue = undefined;

    onFilterChange({
      blockId,
      model,
      startDate,
      endDate,
      hasFeedback: feedbackValue,
    });
  };

  const handleStartDateChange = (value: string) => {
    onFilterChange({
      blockId,
      model,
      startDate: value ? new Date(value) : undefined,
      endDate,
      hasFeedback,
    });
  };

  const handleEndDateChange = (value: string) => {
    onFilterChange({
      blockId,
      model,
      startDate,
      endDate: value ? new Date(value) : undefined,
      hasFeedback,
    });
  };

  const clearFilters = () => {
    onFilterChange({});
    setShowFilters(false);
  };

  const hasActiveFilters = blockId || model || startDate || endDate || hasFeedback !== undefined;

  const feedbackValue = hasFeedback === true ? 'with' : hasFeedback === false ? 'without' : 'all';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && !showFilters && (
            <span className="ml-1 rounded-full bg-primary-foreground text-primary px-2 py-0.5 text-xs font-semibold">
              {[blockId, model, startDate, endDate, hasFeedback !== undefined].filter(Boolean).length}
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
            <X className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Block Filter */}
              <div className="space-y-2">
                <Label htmlFor="block-filter">Block</Label>
                <Select value={blockId || 'all'} onValueChange={handleBlockChange}>
                  <SelectTrigger id="block-filter">
                    <SelectValue placeholder="All Blocks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks?.map((block) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Filter */}
              <div className="space-y-2">
                <Label htmlFor="model-filter">Model</Label>
                <Select value={model || 'all'} onValueChange={handleModelChange}>
                  <SelectTrigger id="model-filter">
                    <SelectValue placeholder="All Models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Models</SelectItem>
                    {models?.map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="font-mono text-xs">{m}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Feedback Filter */}
              <div className="space-y-2">
                <Label htmlFor="feedback-filter">Feedback</Label>
                <Select value={feedbackValue} onValueChange={handleFeedbackChange}>
                  <SelectTrigger id="feedback-filter">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="with">With Feedback</SelectItem>
                    <SelectItem value="without">Without Feedback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate ? startDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate ? endDate.toISOString().split('T')[0] : ''}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
