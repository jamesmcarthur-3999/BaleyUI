'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExternalLink, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface FallbackLogEntry {
  id: string;
  input: unknown;
  reason: string;
  confidence?: number;
  createdAt: Date;
}

interface FallbackLogProps {
  blockId: string;
  entries: FallbackLogEntry[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function FallbackLog({
  blockId,
  entries,
  isLoading = false,
  onLoadMore,
  hasMore = false,
}: FallbackLogProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const truncateInput = (input: unknown): string => {
    const str = typeof input === 'string' ? input : JSON.stringify(input);
    return str.length > 100 ? str.substring(0, 100) + '...' : str;
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined) return null;

    const variant = confidence >= 75 ? 'default' : confidence >= 50 ? 'secondary' : 'destructive';

    return (
      <Badge variant={variant} className="text-xs">
        {confidence.toFixed(0)}% confidence
      </Badge>
    );
  };

  if (entries.length === 0 && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fallback Log</CardTitle>
          <CardDescription>
            Track when hybrid execution falls back to AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Fallbacks Recorded</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              When this block falls back from code to AI execution, the details will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fallback Log</CardTitle>
        <CardDescription>
          Recent fallbacks from code to AI execution ({entries.length} total)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="w-[150px]">Time</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-[100px]">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Loading fallback logs...
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const isExpanded = expandedRows.has(entry.id);

                  return (
                    <>
                      <TableRow key={entry.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleRow(entry.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-xs truncate">
                          {truncateInput(entry.input)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{entry.reason}</span>
                            {getConfidenceBadge(entry.confidence)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/dashboard/executions/${entry.id}`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30">
                            <div className="py-4 px-2 space-y-3">
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Full Input</h4>
                                <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
                                  {JSON.stringify(entry.input, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Fallback Details</h4>
                                <div className="text-sm space-y-1">
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Reason:</span>
                                    <span>{entry.reason}</span>
                                  </div>
                                  {entry.confidence !== undefined && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Match Confidence:</span>
                                      <span>{entry.confidence.toFixed(1)}%</span>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Timestamp:</span>
                                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {hasMore && onLoadMore && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
