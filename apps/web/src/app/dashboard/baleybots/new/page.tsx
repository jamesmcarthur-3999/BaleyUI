'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ChatPanel } from '@/components/canvas/ChatPanel';
import type { ChatQuickAction } from '@/components/canvas/ChatPanel';
import { CanvasShell } from '@/components/canvas/CanvasShell';
import { useBaleyChat } from '@/hooks/useBaleyChat';
import { useCanvasStore } from '@/stores/canvas';
import { useWebContainer } from '@/hooks/useWebContainer';
import { filesToFileSystemTree } from '@/lib/webcontainer/template';
import { getScaffoldTemplate } from '@/lib/canvas/scaffold-templates';
import type { ChatAttachment } from '@/components/chat';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquare, PanelRight } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

// ============================================================================
// QUICK ACTIONS
// ============================================================================

const QUICK_ACTIONS: ChatQuickAction[] = [
  {
    id: 'dashboard',
    label: 'Analytics Dashboard',
    prompt: 'Build me an analytics dashboard with KPI cards, interactive charts, and a sidebar navigation.',
  },
  {
    id: 'landing',
    label: 'Landing Page',
    prompt: 'Build a modern SaaS landing page with hero section, features grid, and pricing cards.',
  },
  {
    id: 'ecommerce',
    label: 'E-commerce Store',
    prompt: 'Build an e-commerce product catalog with filters, product cards, and a shopping cart.',
  },
  {
    id: 'chat-app',
    label: 'Chat Interface',
    prompt: 'Build a chat application with contacts sidebar, message thread, and emoji picker.',
  },
];

// ============================================================================
// PAGE
// ============================================================================

export default function ChatCanvasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get('prompt');
  const initialPromptSentRef = useRef(false);

  // Stable session ID for this canvas session
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  // Mobile view toggle
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');

  // Canvas store
  const canvasView = useCanvasStore((s) => s.view);
  const showPlan = useCanvasStore((s) => s.showPlan);
  const startLive = useCanvasStore((s) => s.startLive);
  const setSessionId = useCanvasStore((s) => s.setSessionId);
  const writeFileToStore = useCanvasStore((s) => s.writeFile);
  const deleteFileFromStore = useCanvasStore((s) => s.deleteFile);

  // Set session ID on mount
  useEffect(() => {
    setSessionId(sessionId);
  }, [sessionId, setSessionId]);

  // WebContainer — only boot when view is 'live'
  const isLive = canvasView.kind === 'live';
  const scaffoldTree = useMemo(
    () => filesToFileSystemTree(getScaffoldTemplate('nextjs-shadcn')),
    [],
  );
  const webContainer = useWebContainer({
    enabled: isLive,
    fileSystemTree: scaffoldTree,
  });

  // Baley chat hook — canvas builder mode
  const baley = useBaleyChat({
    mode: 'canvas',
    canvasContext: {
      sessionId,
      scaffoldTemplate: 'nextjs-shadcn',
    },
    canvasCallbacks: {
      onFileOp: async (op) => {
        if (op.type === 'write' && op.content) {
          writeFileToStore(op.path, op.content);
          await webContainer.writeFile(op.path, op.content);
        } else if (op.type === 'delete') {
          deleteFileFromStore(op.path);
          await webContainer.deleteFile(op.path);
        }
      },
      onRunCommand: async (command) => {
        await webContainer.runCommand(command);
      },
      onPresentPlan: (plan) => {
        showPlan(plan);
        setMobileView('canvas');
      },
      onDeploy: (_method, _name) => {
        // Handled by DeployView
      },
      onRequestErrors: () => {
        // WebContainer compile errors are tracked via process stderr
      },
    },
    // Also support creator callbacks for plan presentation
    creatorCallbacks: {
      onShowPlan: (plan) => {
        showPlan(plan);
        setMobileView('canvas');
      },
    },
  });

  const { messages, isStreaming, send, stop } = baley;

  // Handle sending messages
  const handleSendMessage = (message: string, attachments?: ChatAttachment[]) => {
    // If we're still in welcome/plan state and user sends a message,
    // transition to live mode to start building
    if (canvasView.kind === 'welcome') {
      // First message — Baley will present a plan or start building
    }
    send(message, attachments);
  };

  // Handle chat-only messages (no attachments, from canvas quick actions)
  const handleCanvasMessage = (message: string) => {
    send(message);
  };

  // "Approve & Build" from PlanView transitions to live mode
  useEffect(() => {
    if (canvasView.kind === 'live' && canvasView.containerStatus === 'booting') {
      // WebContainer hook will handle the boot sequence
    }
  }, [canvasView]);

  // Auto-send initial prompt if provided
  useEffect(() => {
    if (initialPrompt && !initialPromptSentRef.current && messages.length === 0) {
      initialPromptSentRef.current = true;
      send(initialPrompt);
    }
  }, [initialPrompt, messages.length, send]);

  const hasStarted = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-gradient-hero">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 bg-background/80 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(ROUTES.baleybots.list)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-medium">New BaleyBot</h1>

        {/* Status badges */}
        {canvasView.kind !== 'welcome' && (
          <span className="text-xs text-muted-foreground capitalize ml-auto">
            {canvasView.kind === 'live' && canvasView.containerStatus !== 'ready'
              ? `${canvasView.kind} (${canvasView.containerStatus})`
              : canvasView.kind}
          </span>
        )}
      </div>

      {/* Mobile view toggle */}
      <div className="flex md:hidden border-b border-border/30">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm transition-colors relative',
            mobileView === 'chat'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setMobileView('chat')}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
          {isStreaming && mobileView === 'canvas' && (
            <span className="absolute top-1.5 right-[calc(50%-24px)] w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm transition-colors',
            mobileView === 'canvas'
              ? 'border-b-2 border-primary font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setMobileView('canvas')}
        >
          <PanelRight className="h-3.5 w-3.5" />
          Canvas
        </button>
      </div>

      {/* Desktop: resizable two-panel layout */}
      <div className="flex-1 min-h-0 hidden md:block">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              onSend={handleSendMessage}
              onStop={stop}
              quickActions={!hasStarted ? QUICK_ACTIONS : undefined}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={65} minSize={40}>
            <CanvasShell onSendMessage={handleCanvasMessage} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked with toggle */}
      <div className="flex-1 min-h-0 md:hidden">
        {mobileView === 'chat' ? (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSendMessage}
            onStop={stop}
            quickActions={!hasStarted ? QUICK_ACTIONS : undefined}
            className="h-full"
          />
        ) : (
          <CanvasShell onSendMessage={handleCanvasMessage} className="h-full" />
        )}
      </div>
    </div>
  );
}
