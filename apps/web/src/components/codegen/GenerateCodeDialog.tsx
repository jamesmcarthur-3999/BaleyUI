'use client';

import React, { useState } from 'react';
import { Sparkles, Code, Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { CodePreview } from './CodePreview';
import { AccuracyReport } from './AccuracyReport';
import { GeneratedCodeResult, HistoricalTestResult } from '@/lib/codegen/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

interface GenerateCodeDialogProps {
  blockId: string;
  blockName: string;
  outputSchema?: Record<string, unknown>;
  onCodeSaved?: () => void;
  trigger?: React.ReactNode;
}

export function GenerateCodeDialog({
  blockId,
  blockName,
  outputSchema,
  onCodeSaved,
  trigger,
}: GenerateCodeDialogProps) {
  const [open, setOpen] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<GeneratedCodeResult | null>(null);
  const [testResult, setTestResult] = useState<HistoricalTestResult | null>(null);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Fetch generation status
  const { data: status } = trpc.codegen.getGenerationStatus.useQuery(
    { blockId },
    { enabled: open }
  );

  // Generate code mutation
  const generateMutation = trpc.codegen.generateCode.useMutation({
    onSuccess: (data) => {
      setGeneratedResult(data);
      toast({
        title: 'Code Generated',
        description: `Generated code from ${data.coveredPatterns} patterns.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Test code mutation
  const testMutation = trpc.codegen.testCode.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      toast({
        title: 'Testing Complete',
        description: `Tested against ${data.totalTested} historical decisions.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Testing Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Save code mutation
  const saveMutation = trpc.codegen.saveGeneratedCode.useMutation({
    onSuccess: () => {
      toast({
        title: 'Code Saved',
        description: 'Generated code has been saved to the block.',
      });
      utils.blocks.getById.invalidate({ id: blockId });
      setOpen(false);
      onCodeSaved?.();
    },
    onError: (error) => {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      blockId,
      blockName,
      outputSchema,
      includeComments: true,
      minConfidence: 0.5, // Only include patterns with 50%+ confidence
    });
  };

  const handleTest = () => {
    if (!generatedResult) return;

    testMutation.mutate({
      blockId,
      code: generatedResult.code,
    });
  };

  const handleSave = () => {
    if (!generatedResult) return;

    saveMutation.mutate({
      blockId,
      code: generatedResult.code,
      accuracy: testResult?.accuracy, // Pass accuracy for codeAccuracy field
    });
  };

  // Error recovery: allow regeneration or going back to start
  const handleRegenerate = () => {
    setGeneratedResult(null);
    setTestResult(null);
    handleGenerate();
  };

  const handleStartOver = () => {
    setGeneratedResult(null);
    setTestResult(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setGeneratedResult(null);
      setTestResult(null);
    }
  };

  const renderTrigger = () => {
    if (trigger) {
      return trigger;
    }

    return (
      <Button variant="outline">
        <Sparkles className="mr-2 h-4 w-4" />
        Generate Code
      </Button>
    );
  };

  const canGenerate = status?.canGenerate && !generateMutation.isPending;
  const canTest = generatedResult && !testMutation.isPending;
  const canSave = generatedResult && testResult && !saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Generate Deterministic Code
          </DialogTitle>
          <DialogDescription>
            Convert detected patterns into TypeScript code for faster execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Section */}
          {status && !generatedResult && (
            <div className="rounded-lg border p-4">
              <h3 className="mb-3 font-semibold">Generation Status</h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available Patterns:</span>
                  <span className="font-medium">{status.patternCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Historical Decisions:</span>
                  <span className="font-medium">{status.decisionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Has Existing Code:</span>
                  <span className="font-medium">{status.hasGeneratedCode ? 'Yes' : 'No'}</span>
                </div>
              </div>

              {!status.canGenerate && (
                <Alert className="mt-4">
                  <AlertDescription>
                    No patterns detected yet. Run some AI decisions and extract patterns first.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Generated Code Section */}
          {generatedResult && (
            <Tabs defaultValue="code" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="code">Generated Code</TabsTrigger>
                <TabsTrigger value="test" disabled={!testResult}>
                  Test Results
                </TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="mt-4">
                <CodePreview
                  code={generatedResult.code}
                  coveredPatterns={generatedResult.coveredPatterns}
                  totalPatterns={generatedResult.totalPatterns}
                  generatedAt={generatedResult.generatedAt}
                />
              </TabsContent>

              <TabsContent value="test" className="mt-4">
                {testResult ? (
                  <AccuracyReport testResult={testResult} />
                ) : (
                  <div className="rounded-lg border p-8 text-center text-muted-foreground">
                    No test results yet. Click &quot;Test Against History&quot; to validate the generated
                    code.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Action Flow */}
          {generatedResult && (
            <>
              <Separator />
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div className="text-sm">
                  {!testResult && (
                    <p className="text-muted-foreground">
                      Test the code against historical decisions to verify accuracy.
                    </p>
                  )}
                  {testResult && testResult.accuracy >= 80 && (
                    <p className="text-green-600">
                      High accuracy! Safe to deploy this code.
                    </p>
                  )}
                  {testResult && testResult.accuracy < 80 && testResult.accuracy >= 60 && (
                    <p className="text-yellow-600">
                      Moderate accuracy. Review mismatches before deploying.
                    </p>
                  )}
                  {testResult && testResult.accuracy < 60 && (
                    <p className="text-red-600">
                      Low accuracy. Consider extracting more patterns or reviewing conditions.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>

          {!generatedResult && (
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="gap-2"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Code
                </>
              )}
            </Button>
          )}

          {/* Error recovery: back button when code is generated */}
          {generatedResult && (
            <Button
              onClick={handleStartOver}
              variant="ghost"
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Start Over
            </Button>
          )}

          {generatedResult && !testResult && (
            <>
              <Button
                onClick={handleRegenerate}
                disabled={generateMutation.isPending}
                variant="ghost"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </Button>
              <Button
                onClick={handleTest}
                disabled={!canTest}
                variant="secondary"
                className="gap-2"
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Against History'
                )}
              </Button>
            </>
          )}

          {generatedResult && testResult && (
            <>
              <Button
                onClick={handleRegenerate}
                disabled={generateMutation.isPending}
                variant="ghost"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Code className="h-4 w-4" />
                    Save to Block
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
