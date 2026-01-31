'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { HistoricalTestResult } from '@/lib/codegen/types';

interface AccuracyReportProps {
  testResult: HistoricalTestResult;
  className?: string;
}

export function AccuracyReport({ testResult, className }: AccuracyReportProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { accuracy, totalTested, correctCount, mismatches } = testResult;

  const getAccuracyColor = (acc: number) => {
    if (acc >= 90) return 'text-green-600';
    if (acc >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyVariant = (acc: number): 'default' | 'secondary' | 'destructive' => {
    if (acc >= 90) return 'default';
    if (acc >= 70) return 'secondary';
    return 'destructive';
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="text-lg">Accuracy Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main accuracy display */}
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className={cn('text-6xl font-bold', getAccuracyColor(accuracy))}>
              {accuracy.toFixed(1)}%
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Accuracy on historical data
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Correct</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{correctCount}</p>
            <p className="text-xs text-muted-foreground">
              {totalTested > 0 ? ((correctCount / totalTested) * 100).toFixed(1) : 0}% of total
            </p>
          </div>

          <div className="rounded-md border p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium">Mismatches</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{mismatches.length}</p>
            <p className="text-xs text-muted-foreground">
              {totalTested > 0 ? ((mismatches.length / totalTested) * 100).toFixed(1) : 0}% of total
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm font-medium">Total Tested</span>
          <Badge variant="outline">{totalTested} decisions</Badge>
        </div>

        {/* Mismatches section */}
        {mismatches.length > 0 && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span>View Mismatches ({mismatches.length})</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-2">
              <div className="max-h-96 overflow-y-auto space-y-3">
                {mismatches.map((mismatch, index) => (
                  <div
                    key={mismatch.decisionId}
                    className="rounded-md border p-3 text-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">
                        Mismatch #{index + 1}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {mismatch.decisionId.slice(0, 8)}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Input:</p>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-900">
                          {JSON.stringify(mismatch.input, null, 2)}
                        </pre>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs font-semibold text-green-700 dark:text-green-500">
                            Expected:
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded bg-green-50 p-2 text-xs dark:bg-green-950/30">
                            {JSON.stringify(mismatch.expectedOutput, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-red-700 dark:text-red-500">
                            Actual:
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded bg-red-50 p-2 text-xs dark:bg-red-950/30">
                            {JSON.stringify(mismatch.actualOutput, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* No mismatches message */}
        {mismatches.length === 0 && accuracy === 100 && (
          <div className="rounded-md bg-green-50 p-4 text-center dark:bg-green-950/30">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600" />
            <p className="mt-2 text-sm font-medium text-green-900 dark:text-green-100">
              Perfect accuracy! All tests passed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
