'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Loader2, CheckCircle2 } from 'lucide-react';
import { ToolCallChip } from './ToolCallChip';
import { isGroupComplete, type ToolGroup } from '../utils/group-tool-blocks';
import type { ChatConfig } from '../types';

interface ToolCallGroupProps {
  group: ToolGroup;
  detail?: ChatConfig['toolDetail'];
  className?: string;
}

export function ToolCallGroup({ group, detail, className }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const allDone = isGroupComplete(group);
  const activeCount = group.tools.filter(t => t.status === 'running').length;

  const label = allDone
    ? `Used ${group.tools.length} tools`
    : activeCount > 0
      ? `Running ${activeCount} of ${group.tools.length} tools`
      : `${group.tools.length} tools`;

  return (
    <div className={cn('my-1', className)}>
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs w-full text-left transition-colors',
          'bg-foreground/[0.03] hover:bg-foreground/[0.05]',
        )}
      >
        {allDone
          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          : <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-primary" />
        }
        <span className="font-medium text-muted-foreground">{label}</span>
        <ChevronDown className={cn(
          'h-3 w-3 ml-auto shrink-0 text-muted-foreground/50 transition-transform',
          expanded && 'rotate-180',
        )} />
      </button>

      {/* Expanded tool list */}
      {expanded && (
        <div className="ml-3 border-l border-foreground/[0.06] pl-2 mt-1 space-y-0.5 animate-content-enter">
          {group.tools.map((tool) => (
            <ToolCallChip key={tool.id} segment={tool} detail={detail} />
          ))}
        </div>
      )}
    </div>
  );
}
