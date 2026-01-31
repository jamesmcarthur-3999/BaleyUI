'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PatternDistributionChartProps {
  outputDistribution: Record<string, number>;
  totalDecisions: number;
}

/**
 * Horizontal bar chart showing output value distribution.
 */
export function PatternDistributionChart({
  outputDistribution,
  totalDecisions,
}: PatternDistributionChartProps) {
  // Sort by count descending
  const sortedEntries = Object.entries(outputDistribution).sort(
    ([, a], [, b]) => b - a
  );

  if (sortedEntries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Output Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No decisions available for analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Output Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedEntries.map(([output, count], index) => {
          const percentage = (count / totalDecisions) * 100;
          let displayValue: string;

          try {
            const parsed = JSON.parse(output);
            displayValue =
              typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          } catch {
            displayValue = output;
          }

          // Truncate long values
          if (displayValue.length > 50) {
            displayValue = displayValue.substring(0, 47) + '...';
          }

          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate flex-1 mr-4">
                  {displayValue}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {count} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
