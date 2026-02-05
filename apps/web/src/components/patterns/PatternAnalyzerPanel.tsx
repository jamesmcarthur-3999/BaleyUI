'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PatternDistributionChart } from './PatternDistributionChart';
import { PatternCard } from './PatternCard';
import { Loader2, AlertCircle, Sparkles, Code } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';
import { GenerateCodeDialog } from '@/components/codegen';

interface PatternAnalyzerPanelProps {
  blockId: string;
  blockVersion: number;
}

/**
 * Main panel for pattern analysis.
 * Shows output distribution, detected patterns, and analysis controls.
 */
export function PatternAnalyzerPanel({ blockId, blockVersion }: PatternAnalyzerPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  // Fetch existing analysis results
  const {
    data: analysisResult,
    isLoading,
    error,
    refetch,
  } = trpc.patterns.getAnalysisResult.useQuery({ blockId });

  // Mutation to trigger new analysis
  const analyzeBlockMutation = trpc.patterns.analyzeBlock.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Patterns Analyzed',
        description: `Detected ${data.savedPatterns?.length || 0} patterns from ${data.totalDecisions || 0} decisions.`,
      });
      refetch();
      setIsAnalyzing(false);
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze patterns.',
        variant: 'destructive',
      });
      setIsAnalyzing(false);
    },
  });

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    analyzeBlockMutation.mutate({ blockId });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load pattern analysis: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const totalDecisions = analysisResult?.totalDecisions || 0;
  const patterns = analysisResult?.patterns || [];
  const outputDistribution = analysisResult?.outputDistribution || {};

  // Calculate edge cases
  const totalCovered = patterns.reduce(
    (sum, p) => sum + (p.supportCount || 0),
    0
  );
  const edgeCaseCount = totalDecisions - totalCovered;

  return (
    <div className="space-y-6">
      {/* Header with analyze button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pattern Analysis</h2>
          <p className="text-muted-foreground">
            Analyze AI decision history to detect repeatable patterns
          </p>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing || totalDecisions === 0}
          size="lg"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Analyze Patterns
            </>
          )}
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDecisions}</div>
            <p className="text-xs text-muted-foreground">
              Available for analysis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Patterns Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patterns.length}</div>
            <p className="text-xs text-muted-foreground">
              {patterns.length === 0
                ? 'Run analysis to detect patterns'
                : 'Repeatable decision rules'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Edge Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{edgeCaseCount}</div>
            <p className="text-xs text-muted-foreground">
              Decisions not matching any pattern
            </p>
          </CardContent>
        </Card>
      </div>

      {/* No decisions message */}
      {totalDecisions === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No decisions available for this block. Execute the block with
            various inputs to collect decision data.
          </AlertDescription>
        </Alert>
      )}

      {/* Output distribution chart */}
      {totalDecisions > 0 && (
        <PatternDistributionChart
          outputDistribution={outputDistribution}
          totalDecisions={totalDecisions}
        />
      )}

      {/* Detected patterns */}
      {patterns.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">Detected Patterns</h3>
              <Badge variant="secondary">{patterns.length} patterns</Badge>
            </div>
            <GenerateCodeDialog
              blockId={blockId}
              blockName="Block"
              blockVersion={blockVersion}
              trigger={
                <Button variant="outline" className="gap-2">
                  <Code className="h-4 w-4" />
                  Generate Code
                </Button>
              }
            />
          </div>
          <div className="space-y-4">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </div>
        </div>
      )}

      {/* No patterns message */}
      {totalDecisions > 0 && patterns.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                No patterns detected yet. Click &quot;Analyze Patterns&quot; to
                start pattern extraction.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
