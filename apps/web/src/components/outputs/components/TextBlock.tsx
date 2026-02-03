'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { TextBlockConfig } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface TextBlockProps {
  config: TextBlockConfig;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TextBlock({ config, className }: TextBlockProps) {
  const { content, format, variant = 'default' } = config;

  const variantClasses: Record<string, string> = {
    default: '',
    callout: 'bg-muted/50 border-l-4 border-primary pl-4 py-3',
    quote: 'border-l-4 border-muted-foreground/30 pl-4 py-2 italic text-muted-foreground',
    code: 'bg-muted font-mono text-sm p-4 rounded-md overflow-x-auto',
  };

  const renderContent = () => {
    if (format === 'html') {
      // Sanitize HTML in production - here we just render as text for safety
      return <div dangerouslySetInnerHTML={{ __html: content }} />;
    }

    if (format === 'markdown') {
      // Simple markdown rendering for common patterns
      // In production, use a proper markdown renderer like react-markdown
      const lines = content.split('\n');
      return (
        <div className="space-y-2">
          {lines.map((line, index) => {
            // Headers
            if (line.startsWith('### ')) {
              return (
                <h3 key={index} className="text-lg font-semibold mt-4">
                  {line.slice(4)}
                </h3>
              );
            }
            if (line.startsWith('## ')) {
              return (
                <h2 key={index} className="text-xl font-semibold mt-4">
                  {line.slice(3)}
                </h2>
              );
            }
            if (line.startsWith('# ')) {
              return (
                <h1 key={index} className="text-2xl font-bold mt-4">
                  {line.slice(2)}
                </h1>
              );
            }

            // Bold and italic
            let processed = line
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-sm">$1</code>');

            // List items
            if (line.startsWith('- ') || line.startsWith('* ')) {
              return (
                <li
                  key={index}
                  className="ml-4"
                  dangerouslySetInnerHTML={{ __html: processed.slice(2) }}
                />
              );
            }

            // Empty lines
            if (line.trim() === '') {
              return <div key={index} className="h-2" />;
            }

            // Regular paragraphs
            return (
              <p
                key={index}
                dangerouslySetInnerHTML={{ __html: processed }}
              />
            );
          })}
        </div>
      );
    }

    // Plain text - preserve whitespace and line breaks
    return <p className="whitespace-pre-wrap">{content}</p>;
  };

  if (variant === 'default') {
    return (
      <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
        {renderContent()}
      </div>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardContent className={cn('pt-4', variantClasses[variant])}>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
