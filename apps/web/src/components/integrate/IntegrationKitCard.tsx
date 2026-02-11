'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Code2, Globe, Webhook, Clock, Database, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegrationKitCardProps {
  type: 'embed' | 'api' | 'webhook' | 'schedule' | 'db_trigger' | 'chain';
  title: string;
  code: string;
  language?: string;
  description?: string;
  className?: string;
}

const TYPE_ICONS = {
  embed: Globe,
  api: Code2,
  webhook: Webhook,
  schedule: Clock,
  db_trigger: Database,
  chain: Link2,
};

export function IntegrationKitCard({
  type,
  title,
  code,
  language = 'typescript',
  description,
  className,
}: IntegrationKitCardProps) {
  const [copied, setCopied] = useState(false);
  const Icon = TYPE_ICONS[type] ?? Code2;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('rounded-xl border bg-background overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 text-xs gap-1.5"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Description */}
      {description && (
        <p className="px-3.5 py-2 text-xs text-muted-foreground border-b">
          {description}
        </p>
      )}

      {/* Code block */}
      <pre className="p-3.5 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words bg-muted/10 max-h-[200px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
