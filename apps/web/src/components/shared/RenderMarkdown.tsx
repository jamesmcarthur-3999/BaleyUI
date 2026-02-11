'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface MarkdownBlock {
  type: 'paragraph' | 'heading' | 'code' | 'list';
  level?: number; // heading level (1-3) or list type (0=bullet, 1=numbered)
  lang?: string;
  content: string;
  items?: string[];
}

// ============================================================================
// PARSING
// ============================================================================

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1]!.length,
        content: headingMatch[2]!,
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', level: 0, content: '', items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', level: 1, content: '', items });
      continue;
    }

    // Empty line (paragraph break)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('```') &&
      !lines[i]!.match(/^#{1,3}\s+/) &&
      !lines[i]!.match(/^\s*[-*]\s+/) &&
      !lines[i]!.match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
    }
  }

  return blocks;
}

export function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match bold, italic, inline code
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`t-${match.index}`}>
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }

    if (match[2]) {
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(<em key={`i-${match.index}`}>{match[3]}</em>);
    } else if (match[4]) {
      nodes.push(
        <code
          key={`c-${match.index}`}
          className="bg-muted px-1 py-0.5 rounded text-xs font-mono"
        >
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`end-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return nodes.length > 0 ? nodes : [<span key="full">{text}</span>];
}

// ============================================================================
// COMPONENTS
// ============================================================================

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [didCopy, setDidCopy] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 1200);
    } catch {
      // Clipboard may be unavailable
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/50 overflow-hidden my-2">
      <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-border/30 bg-muted/30">
        <span className="text-[10px] text-muted-foreground">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy code"
        >
          {didCopy ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {didCopy ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function RenderMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level ?? 1, 3)}` as
              | 'h1'
              | 'h2'
              | 'h3';
            const sizeClass =
              block.level === 1
                ? 'text-lg font-bold'
                : block.level === 2
                  ? 'text-base font-semibold'
                  : 'text-sm font-semibold';
            return (
              <Tag key={i} className={cn(sizeClass, 'mt-3 mb-1')}>
                {renderInlineMarkdown(block.content)}
              </Tag>
            );
          }
          case 'code':
            return <CodeBlock key={i} code={block.content} lang={block.lang} />;
          case 'list': {
            const ListTag = block.level === 1 ? 'ol' : 'ul';
            return (
              <ListTag
                key={i}
                className={cn(
                  'my-1 pl-5 space-y-0.5 text-[15px] leading-7',
                  block.level === 1 ? 'list-decimal' : 'list-disc'
                )}
              >
                {block.items?.map((item, j) => (
                  <li key={j}>{renderInlineMarkdown(item)}</li>
                ))}
              </ListTag>
            );
          }
          case 'paragraph':
          default:
            return (
              <p key={i} className="my-1 whitespace-pre-wrap break-words">
                {renderInlineMarkdown(block.content)}
              </p>
            );
        }
      })}
    </>
  );
}
