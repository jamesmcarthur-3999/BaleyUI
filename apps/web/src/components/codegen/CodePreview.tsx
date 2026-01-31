'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CodePreviewProps {
  code: string;
  coveredPatterns: number;
  totalPatterns: number;
  generatedAt?: Date;
  className?: string;
}

export function CodePreview({
  code,
  coveredPatterns,
  totalPatterns,
  generatedAt,
  className,
}: CodePreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const coverage = totalPatterns > 0
    ? Math.round((coveredPatterns / totalPatterns) * 100)
    : 0;

  const lines = code.split('\n');

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Generated Code</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {coveredPatterns}/{totalPatterns} patterns
            </Badge>
            <Badge
              variant={coverage >= 80 ? 'default' : coverage >= 50 ? 'secondary' : 'outline'}
            >
              {coverage}% coverage
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8 w-8 p-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {generatedAt && (
          <p className="text-xs text-muted-foreground">
            Generated at {generatedAt.toLocaleString()}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="relative">
          <pre className="overflow-x-auto rounded-md bg-slate-950 p-4 text-sm">
            <code className="text-slate-50">
              {lines.map((line, index) => (
                <div key={index} className="flex">
                  <span className="mr-4 inline-block w-8 select-none text-right text-slate-500">
                    {index + 1}
                  </span>
                  <span className="flex-1">{line || ' '}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
