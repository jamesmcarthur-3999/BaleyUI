'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, DollarSign, Zap, ArrowRight } from 'lucide-react';
import { formatCost } from '@/lib/format';

interface SavingsProjectionProps {
  aiOnlyCost: number;
  hybridCost: number;
  aiExecutions: number;
  codeExecutions: number;
  projectionPeriod?: string;
}

export function SavingsProjection({
  aiOnlyCost,
  hybridCost,
  aiExecutions,
  codeExecutions,
  projectionPeriod = '30 days',
}: SavingsProjectionProps) {
  const savings = aiOnlyCost - hybridCost;
  const savingsPercentage = aiOnlyCost > 0 ? (savings / aiOnlyCost) * 100 : 0;
  const totalExecutions = aiExecutions + codeExecutions;
  const codeExecutionPercentage = totalExecutions > 0 ? (codeExecutions / totalExecutions) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Savings Overview */}
      <Card className="border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-green-600" />
                Cost Savings
              </CardTitle>
              <CardDescription>
                Hybrid mode savings over {projectionPeriod}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-600">
              -{savingsPercentage.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Savings Amount */}
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-green-600">
                {formatCost(savings)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Total savings in {projectionPeriod}
              </p>
            </div>

            {/* Comparison */}
            <div className="grid grid-cols-2 gap-4">
              {/* AI Only */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="text-xs text-muted-foreground">AI Only Mode</div>
                <div className="text-2xl font-bold">{formatCost(aiOnlyCost)}</div>
                <div className="text-xs text-muted-foreground">
                  {totalExecutions.toLocaleString()} executions
                </div>
              </div>

              {/* Hybrid Mode */}
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Hybrid Mode
                </div>
                <div className="text-2xl font-bold text-primary">{formatCost(hybridCost)}</div>
                <div className="text-xs text-muted-foreground">
                  {aiExecutions.toLocaleString()} AI + {codeExecutions.toLocaleString()} code
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Code Execution Rate</span>
                <span className="font-semibold">{codeExecutionPercentage.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI Execution Rate</span>
                <span className="font-semibold">
                  {(100 - codeExecutionPercentage).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Avg Cost per Execution</span>
                <span className="font-semibold">
                  {formatCost(totalExecutions > 0 ? hybridCost / totalExecutions : 0)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Projection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Projection</CardTitle>
          <CardDescription>
            Estimated costs at current usage rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Projected Monthly (AI Only)</span>
              </div>
              <span className="font-semibold">{formatCost(aiOnlyCost)}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Projected Monthly (Hybrid)</span>
              </div>
              <span className="font-bold text-primary">{formatCost(hybridCost)}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  Monthly Savings
                </span>
              </div>
              <span className="font-bold text-green-600">{formatCost(savings)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      {codeExecutions === 0 && (
        <Card className="border-primary">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Enable Hybrid Mode</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Start saving costs by automatically using generated code for repeated patterns
                </p>
              </div>
              <Button size="lg" className="gap-2">
                Enable Hybrid Mode
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
