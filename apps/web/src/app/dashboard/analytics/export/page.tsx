'use client';

import { useState } from 'react';
import { ExportPanel, ExportOptions } from '@/components/analytics/ExportPanel';
import { trpc } from '@/lib/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ROUTES } from '@/lib/routes';
import { FileJson, Info } from 'lucide-react';

export default function ExportPage() {
  const [exportOptions, setExportOptions] = useState<ExportOptions | null>(null);

  // Fetch blocks for selector
  const { data: blocks } = trpc.blocks.list.useQuery();

  // Fetch export data when options are set
  const { data: exportData, isLoading } = trpc.analytics.exportTrainingData.useQuery(
    {
      blockId: exportOptions?.blockId,
      feedbackOnly: exportOptions?.feedbackFilter === 'correct' ||
        exportOptions?.feedbackFilter === 'incorrect',
      startDate: exportOptions?.startDate, // Keep as Date object
      endDate: exportOptions?.endDate, // Keep as Date object
    },
    {
      enabled: !!exportOptions,
    }
  );

  const handleExport = (options: ExportOptions) => {
    setExportOptions(options);
  };

  const blockList = blocks?.map((block) => ({
    id: block.id,
    name: block.name,
  })) || [];

  return (
    <div className="container py-10 max-w-5xl">
      <Breadcrumbs
        items={[
          { label: 'Analytics', href: ROUTES.analytics.overview },
          { label: 'Export' },
        ]}
        className="mb-6"
      />

      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Export Training Data</h1>
          <p className="text-muted-foreground">
            Export AI decisions for fine-tuning models or analysis
          </p>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Export your AI decisions in JSONL format for fine-tuning OpenAI or Anthropic models,
            or CSV format for analysis in spreadsheets. Only decisions with corrected outputs
            (from feedback) will use the corrected version in the export.
          </AlertDescription>
        </Alert>

        {/* Export Format Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Export Formats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-1">JSONL (JSON Lines)</h4>
                <p className="text-sm text-muted-foreground">
                  Use this format for fine-tuning OpenAI models (GPT-3.5, GPT-4) or Anthropic
                  models. Each line contains a training example with input and output messages.
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1">CSV (Comma-Separated Values)</h4>
                <p className="text-sm text-muted-foreground">
                  Use this format for analysis in spreadsheet applications like Excel or Google
                  Sheets. Includes input, output, and reasoning columns.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export Panel */}
        <ExportPanel
          blocks={blockList}
          onExport={handleExport}
          preview={exportData?.preview}
          rowCount={exportData?.rowCount}
          isLoading={isLoading}
        />

        {/* Usage Examples */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage Examples</CardTitle>
            <CardDescription>
              How to use exported training data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">Fine-tuning with OpenAI CLI</h4>
                <div className="bg-muted rounded-md p-3 font-mono text-xs">
                  <div>openai api fine_tunes.create \</div>
                  <div className="ml-4">-t training-data.jsonl \</div>
                  <div className="ml-4">-m gpt-3.5-turbo</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Fine-tuning with Anthropic</h4>
                <div className="bg-muted rounded-md p-3 font-mono text-xs">
                  <div># Upload your JSONL file to Anthropic Console</div>
                  <div># at https://console.anthropic.com/fine-tuning</div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Analysis with Python (CSV)</h4>
                <div className="bg-muted rounded-md p-3 font-mono text-xs">
                  <div>import pandas as pd</div>
                  <div className="mt-1">df = pd.read_csv(&apos;training-data.csv&apos;)</div>
                  <div>df.head()</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
