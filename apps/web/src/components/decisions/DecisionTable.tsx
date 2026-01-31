'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCost, formatDuration } from '@/lib/format';

interface Decision {
  id: string;
  blockId: string;
  blockName: string;
  blockExecutionId: string;
  input: any;
  output: any;
  reasoning: string | null;
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  latencyMs: number | null;
  cost: string | null;
  feedbackCorrect: boolean | null;
  feedbackNotes: string | null;
  feedbackCorrectedOutput: any;
  feedbackAt: Date | null;
  createdAt: Date;
}

interface DecisionTableProps {
  decisions: Decision[];
  isLoading?: boolean;
  onDecisionSelect?: (decision: Decision) => void;
}

export function DecisionTable({ decisions, isLoading, onDecisionSelect }: DecisionTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateId = (id: string) => {
    return `${id.slice(0, 8)}...`;
  };

  const getFeedbackBadge = (feedbackCorrect: boolean | null) => {
    if (feedbackCorrect === null) {
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          No Feedback
        </Badge>
      );
    }
    if (feedbackCorrect) {
      return (
        <Badge variant="default" className="gap-1 bg-green-500 hover:bg-green-600">
          <CheckCircle2 className="h-3 w-3" />
          Correct
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Incorrect
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-muted-foreground">Loading decisions...</div>
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-4">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">No decisions found</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          Decisions will appear here after AI blocks are executed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Block</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Feedback</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {decisions.map((decision) => {
            const isExpanded = expandedIds.has(decision.id);
            return (
              <TableRow
                key={decision.id}
                className={cn('cursor-pointer', isExpanded && 'bg-muted/50')}
                onClick={() => {
                  toggleExpanded(decision.id);
                  onDecisionSelect?.(decision);
                }}
              >
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(decision.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-mono text-xs">{truncateId(decision.id)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{decision.blockName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs">{decision.model || '-'}</span>
                </TableCell>
                <TableCell>{formatDuration(decision.latencyMs)}</TableCell>
                <TableCell>{formatCost(decision.cost ? parseFloat(decision.cost) : null)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(decision.createdAt)}
                </TableCell>
                <TableCell>{getFeedbackBadge(decision.feedbackCorrect)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
