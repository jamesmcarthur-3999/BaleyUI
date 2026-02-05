'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, FileJson, FileText, Calendar } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { TrainingDataItem } from '@/lib/types/execution';

type ExportPreviewItem = TrainingDataItem & {
  input?: string;
  output?: string;
};

interface ExportPanelProps {
  blocks: Array<{ id: string; name: string }>;
  onExport: (options: ExportOptions) => void;
  preview?: ExportPreviewItem[];
  rowCount?: number;
  isLoading?: boolean;
}

export interface ExportOptions {
  blockId?: string;
  startDate?: Date;
  endDate?: Date;
  feedbackFilter: 'all' | 'correct' | 'incorrect';
  format: 'jsonl' | 'csv';
}

export function ExportPanel({
  blocks,
  onExport,
  preview,
  rowCount,
  isLoading,
}: ExportPanelProps) {
  const [selectedBlock, setSelectedBlock] = useState<string>('all');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [format, setFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleExport = () => {
    onExport({
      blockId: selectedBlock === 'all' ? undefined : selectedBlock,
      feedbackFilter,
      format,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  };

  const handleDownload = () => {
    if (!preview || preview.length === 0) return;

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'jsonl') {
      content = preview.map((item) => JSON.stringify(item)).join('\n');
      filename = 'training-data.jsonl';
      mimeType = 'application/jsonl';
    } else {
      // CSV format - with defensive checks for edge cases
      const headers = ['input', 'output', 'reasoning'];
      const rows = preview.map((item) => {
        // Safely extract input/output with fallbacks for missing messages
        const messages = item.messages || [];
        const inputContent = messages[0]?.content ?? item.input ?? '';
        const outputContent = messages[1]?.content ?? item.output ?? '';
        const reasoning = item.reasoning || '';

        // Proper CSV escaping: double quotes inside values, wrap in quotes
        const escapeCSV = (str: string) => {
          const escaped = JSON.stringify(str);
          // Remove outer quotes from JSON.stringify, we'll add our own
          return escaped.slice(1, -1).replace(/"/g, '""');
        };

        return `"${escapeCSV(typeof inputContent === 'string' ? inputContent : JSON.stringify(inputContent))}","${escapeCSV(typeof outputContent === 'string' ? outputContent : JSON.stringify(outputContent))}","${escapeCSV(reasoning)}"`;
      });
      content = [headers.join(','), ...rows].join('\n');
      filename = 'training-data.csv';
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filter Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export Configuration</CardTitle>
          <CardDescription>
            Configure filters and format for exporting training data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Block Selector */}
          <div className="space-y-2">
            <Label htmlFor="block-select">Block</Label>
            <Select value={selectedBlock} onValueChange={setSelectedBlock}>
              <SelectTrigger id="block-select">
                <SelectValue placeholder="Select a block" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Blocks</SelectItem>
                {blocks.map((block) => (
                  <SelectItem key={block.id} value={block.id}>
                    {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Start Date
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                End Date
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Feedback Filter */}
          <div className="space-y-2">
            <Label htmlFor="feedback-filter">Feedback Filter</Label>
            <Select
              value={feedbackFilter}
              onValueChange={(value) => setFeedbackFilter(value as 'all' | 'correct' | 'incorrect')}
            >
              <SelectTrigger id="feedback-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="correct">Correct Only</SelectItem>
                <SelectItem value="incorrect">Incorrect Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format Selector */}
          <div className="space-y-2">
            <Label htmlFor="format-select">Export Format</Label>
            <Select value={format} onValueChange={(value) => setFormat(value as 'jsonl' | 'csv')}>
              <SelectTrigger id="format-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jsonl">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    <span>JSONL (for fine-tuning)</span>
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>CSV (for analysis)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleExport}
            disabled={isLoading}
            className="w-full"
          >
            Generate Preview
          </Button>
        </CardContent>
      </Card>

      {/* Preview and Download */}
      {preview && preview.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Export Preview</CardTitle>
                <CardDescription>
                  {rowCount?.toLocaleString()} total rows (showing first 3)
                </CardDescription>
              </div>
              <Badge variant="outline">
                {format.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview */}
            <div className="bg-muted/50 rounded-md p-4 font-mono text-xs overflow-x-auto">
              <pre className="whitespace-pre-wrap">
                {format === 'jsonl'
                  ? preview.map((item) => JSON.stringify(item, null, 2)).join('\n\n')
                  : `input,output,reasoning\n${preview.map((item) => {
                      const messages = item.messages || [];
                      const inputContent = messages[0]?.content ?? item.input ?? '';
                      const outputContent = messages[1]?.content ?? item.output ?? '';
                      const reasoning = item.reasoning || '';
                      const escapeCSV = (str: string) => JSON.stringify(str).slice(1, -1).replace(/"/g, '""');
                      return `"${escapeCSV(typeof inputContent === 'string' ? inputContent : JSON.stringify(inputContent))}","${escapeCSV(typeof outputContent === 'string' ? outputContent : JSON.stringify(outputContent))}","${escapeCSV(reasoning)}"`;
                    }).join('\n')}`}
              </pre>
            </div>

            {/* Download Button */}
            <Button
              onClick={handleDownload}
              className="w-full"
              variant="default"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Full Export ({rowCount} rows)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {preview && preview.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-muted-foreground">
              <FileJson className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No data to export</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
