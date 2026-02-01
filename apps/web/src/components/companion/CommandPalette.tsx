'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Sparkles,
  GitBranch,
  Blocks,
  Play,
  Settings,
  HelpCircle,
  ArrowRight,
  Clock,
  Star,
  Plus,
  Zap,
  FileText,
  MessageCircle,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon?: typeof Sparkles;
  category: 'ai' | 'flow' | 'block' | 'action' | 'recent';
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands?: Command[];
  recentCommands?: string[];
  onSearch?: (query: string) => void;
  className?: string;
}

// ============================================================================
// DEFAULT COMMANDS
// ============================================================================

const defaultCommands: Command[] = [
  {
    id: 'new-agent',
    title: 'Create New Agent',
    description: 'Build a new AI agent from scratch',
    icon: Plus,
    category: 'ai',
    shortcut: 'N',
    action: () => {},
    keywords: ['agent', 'new', 'create', 'build'],
  },
  {
    id: 'new-flow',
    title: 'Create New Flow',
    description: 'Design a new workflow composition',
    icon: GitBranch,
    category: 'flow',
    shortcut: 'F',
    action: () => {},
    keywords: ['flow', 'workflow', 'new', 'create'],
  },
  {
    id: 'run-flow',
    title: 'Run Current Flow',
    description: 'Execute the active workflow',
    icon: Play,
    category: 'action',
    shortcut: 'R',
    action: () => {},
    keywords: ['run', 'execute', 'start'],
  },
  {
    id: 'ask-ai',
    title: 'Ask AI Assistant',
    description: 'Get help from the AI companion',
    icon: MessageCircle,
    category: 'ai',
    shortcut: '/',
    action: () => {},
    keywords: ['ask', 'help', 'assistant', 'chat'],
  },
  {
    id: 'generate-code',
    title: 'Generate Code',
    description: 'Generate code from agent output schema',
    icon: FileText,
    category: 'ai',
    action: () => {},
    keywords: ['code', 'generate', 'export', 'typescript'],
  },
  {
    id: 'quick-action',
    title: 'Quick Action',
    description: 'Perform a one-shot AI task',
    icon: Zap,
    category: 'ai',
    action: () => {},
    keywords: ['quick', 'action', 'task'],
  },
  {
    id: 'browse-blocks',
    title: 'Browse Blocks',
    description: 'View and manage all blocks',
    icon: Blocks,
    category: 'block',
    shortcut: 'B',
    action: () => {},
    keywords: ['blocks', 'browse', 'library'],
  },
  {
    id: 'settings',
    title: 'Open Settings',
    description: 'Configure preferences',
    icon: Settings,
    category: 'action',
    shortcut: ',',
    action: () => {},
    keywords: ['settings', 'preferences', 'config'],
  },
  {
    id: 'help',
    title: 'Help & Documentation',
    description: 'View guides and documentation',
    icon: HelpCircle,
    category: 'action',
    shortcut: '?',
    action: () => {},
    keywords: ['help', 'docs', 'documentation', 'guide'],
  },
];

// ============================================================================
// CATEGORY LABELS
// ============================================================================

const categoryLabels: Record<Command['category'], { label: string; icon: typeof Sparkles }> = {
  ai: { label: 'AI', icon: Sparkles },
  flow: { label: 'Flows', icon: GitBranch },
  block: { label: 'Blocks', icon: Blocks },
  action: { label: 'Actions', icon: Zap },
  recent: { label: 'Recent', icon: Clock },
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
        'text-left transition-colors',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-muted'
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
          isSelected ? 'bg-primary/20' : 'bg-muted'
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
        <kbd
          className={cn(
            'px-2 py-1 rounded text-xs font-mono',
            isSelected
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {command.shortcut}
        </kbd>
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
  commands = defaultCommands,
  recentCommands = [],
  onSearch,
  className,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands based on query
  const filteredCommands = query
    ? commands.filter((cmd) => {
        const searchText = `${cmd.title} ${cmd.description || ''} ${cmd.keywords?.join(' ') || ''}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      })
    : commands;

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
              onSearch?.(e.target.value);
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
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No commands found</p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([category, cmds]) => {
                const { label, icon: CategoryIcon } =
                  categoryLabels[category as Command['category']];

                return (
                  <div key={category} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      <CategoryIcon className="h-3.5 w-3.5" />
                      {label}
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
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
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
