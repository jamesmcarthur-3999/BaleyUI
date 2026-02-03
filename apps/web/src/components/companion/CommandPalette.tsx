'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { KeyboardShortcut } from '@/components/ui/kbd';
import { ROUTES } from '@/lib/routes';
import { trpc } from '@/lib/trpc/client';
import {
  Search,
  Sparkles,
  Settings,
  ArrowRight,
  Clock,
  Plus,
  MessageCircle,
  Bot,
  Workflow,
  Key,
  Plug,
  FileText,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon?: typeof Sparkles;
  category: 'quick' | 'recent' | 'agents' | 'flows' | 'settings' | 'help';
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskAI?: (query: string) => void;
  className?: string;
}

// ============================================================================
// CATEGORY CONFIG
// ============================================================================

const categoryConfig: Record<Command['category'], { label: string; icon: React.ReactNode }> = {
  quick: { label: 'Quick Actions', icon: <Sparkles className="h-3.5 w-3.5" /> },
  recent: { label: 'Recent', icon: <Clock className="h-3.5 w-3.5" /> },
  agents: { label: 'Agents', icon: <Bot className="h-3.5 w-3.5" /> },
  flows: { label: 'Flows', icon: <Workflow className="h-3.5 w-3.5" /> },
  settings: { label: 'Settings', icon: <Settings className="h-3.5 w-3.5" /> },
  help: { label: 'Help', icon: <MessageCircle className="h-3.5 w-3.5" /> },
};

// ============================================================================
// COMMAND ITEM
// ============================================================================

function CommandItem({
  command,
  isSelected,
  onSelect,
}: {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = command.icon || Sparkles;

  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'text-left transition-all duration-150',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-muted/80'
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
          isSelected ? 'bg-primary/20 text-primary' : 'bg-muted'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{command.title}</p>
        {command.description && (
          <p className="text-xs text-muted-foreground truncate">
            {command.description}
          </p>
        )}
      </div>

      {command.shortcut && (
        <KeyboardShortcut
          shortcut={command.shortcut}
          className={cn(
            isSelected
              ? 'bg-primary/20 text-primary border-primary/30'
              : ''
          )}
        />
      )}

      <ArrowRight
        className={cn(
          'h-4 w-4 shrink-0 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommandPalette({
  open,
  onOpenChange,
  onAskAI,
  className,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch real data from tRPC
  const { data: blocks } = trpc.blocks.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: flows } = trpc.flows.list.useQuery(undefined, {
    enabled: open,
  });

  // Build commands dynamically (React 19 handles optimization automatically)
  const commands: Command[] = [
    // Quick Actions
    {
      id: 'create-agent',
      title: 'Create new agent',
      description: 'Build a new AI agent from scratch',
      icon: Plus,
      category: 'quick',
      shortcut: 'mod+n',
      action: () => router.push(ROUTES.blocks.create),
      keywords: ['agent', 'new', 'create', 'build', 'block'],
    },
    {
      id: 'create-flow',
      title: 'Create new flow',
      description: 'Design a new workflow composition',
      icon: Plus,
      category: 'quick',
      shortcut: 'mod+shift+n',
      action: () => router.push(ROUTES.flows.create),
      keywords: ['flow', 'workflow', 'new', 'create'],
    },
    // Agents (first 5 from blocks)
    ...(blocks?.slice(0, 5).map((block) => ({
      id: `agent-${block.id}`,
      title: block.name,
      description: block.description || `${block.type} block`,
      icon: Bot,
      category: 'agents' as const,
      action: () => router.push(ROUTES.blocks.detail(block.id)),
      keywords: ['agent', 'block', block.type, block.name.toLowerCase()],
    })) || []),
    // Flows (first 5)
    ...(flows?.slice(0, 5).map((flow) => ({
      id: `flow-${flow.id}`,
      title: flow.name,
      description: flow.description || 'Workflow',
      icon: Workflow,
      category: 'flows' as const,
      action: () => router.push(ROUTES.flows.detail(flow.id)),
      keywords: ['flow', 'workflow', flow.name.toLowerCase()],
    })) || []),
    // Settings
    {
      id: 'settings',
      title: 'Settings',
      description: 'Configure preferences',
      icon: Settings,
      category: 'settings',
      shortcut: 'mod+,',
      action: () => router.push(ROUTES.settings.root),
      keywords: ['settings', 'preferences', 'config'],
    },
    {
      id: 'connections',
      title: 'Connections',
      description: 'Manage AI provider connections',
      icon: Plug,
      category: 'settings',
      action: () => router.push(ROUTES.settings.connections),
      keywords: ['connections', 'providers', 'api', 'openai', 'anthropic'],
    },
    {
      id: 'api-keys',
      title: 'API Keys',
      description: 'Manage your API keys',
      icon: Key,
      category: 'settings',
      action: () => router.push(ROUTES.settings.apiKeys),
      keywords: ['api', 'keys', 'tokens', 'authentication'],
    },
    // Help
    {
      id: 'documentation',
      title: 'Documentation',
      description: 'View API documentation and guides',
      icon: FileText,
      category: 'help',
      shortcut: 'mod+/',
      action: () => router.push(ROUTES.apiDocs),
      keywords: ['docs', 'documentation', 'help', 'guide', 'api'],
    },
  ];

  // Filter commands based on query
  const filteredCommands = query
    ? commands.filter((cmd) => {
        const searchText = `${cmd.title} ${cmd.description || ''} ${cmd.keywords?.join(' ') || ''}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      })
    : commands.filter((cmd) => cmd.category === 'quick' || cmd.category === 'recent');

  // Group by category
  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      const category = cmd.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(cmd);
      return acc;
    },
    {} as Record<Command['category'], Command[]>
  );

  // Flatten for keyboard navigation
  const flatCommands = Object.values(groupedCommands).flat();

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          flatCommands[selectedIndex].action();
          onOpenChange(false);
        } else if (query.trim() && onAskAI) {
          // Natural language passthrough when no commands match
          onAskAI(query.trim());
          onOpenChange(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  };

  const handleSelect = (command: Command) => {
    command.action();
    onOpenChange(false);
  };

  // Track current index across groups
  let currentIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-lg p-0 gap-0 overflow-hidden',
          'glass elevation-3 border-border/50',
          className
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Type a command or search..."
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-base"
          />
          {query && (
            <Badge variant="secondary" className="shrink-0">
              {filteredCommands.length} results
            </Badge>
          )}
        </div>

        {/* Commands List */}
        <ScrollArea className="max-h-[400px]">
          <div className="p-2">
            {Object.entries(groupedCommands).length === 0 ? (
              <div className="py-8 text-center">
                {query.trim() && onAskAI ? (
                  <>
                    <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Press <KeyboardShortcut shortcut="Enter" className="mx-1" /> to ask AI: &quot;{query}&quot;
                    </p>
                  </>
                ) : (
                  <>
                    <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No commands found</p>
                  </>
                )}
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, cmds]) => {
                const config = categoryConfig[category as Command['category']];

                return (
                  <div key={category} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {config.icon}
                      {config.label}
                    </div>
                    <div className="space-y-0.5">
                      {cmds.map((command) => {
                        const index = currentIndex;
                        currentIndex++;
                        return (
                          <CommandItem
                            key={command.id}
                            command={command}
                            isSelected={selectedIndex === index}
                            onSelect={() => handleSelect(command)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border">esc</kbd>
              close
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI-powered
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// HOOK FOR KEYBOARD SHORTCUT
// ============================================================================

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}
