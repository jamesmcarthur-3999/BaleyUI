'use client';

import { useState } from 'react';
import type { RuntimeInterfaceSpec } from '@/lib/baleybot/types';
import { useReviewExecution } from './ReviewExecutionContext';
import { ChatInterface } from './ChatInterface';
import { ResultView } from './ResultView';
import { ExecutionFlowReview } from './ExecutionFlowReview';
import { JsonFormInput } from './JsonFormInput';
import { WebhookSimulator } from './WebhookSimulator';
import { FileInput } from './FileInput';
import { UrlInput } from './UrlInput';
import { RunButton } from './RunButton';
import { ContextSetup } from './ContextSetup';
import { cn } from '@/lib/utils';

interface DynamicTestRendererProps {
  spec: RuntimeInterfaceSpec;
  balCode: string;
  className?: string;
}

type InputComponent = RuntimeInterfaceSpec['components'][number] & {
  type: 'chat_input' | 'json_form' | 'file_input' | 'webhook_simulator' | 'url_input' | 'run_button' | 'context_setup';
};

function isInputComponent(c: RuntimeInterfaceSpec['components'][number]): c is InputComponent {
  return ['chat_input', 'json_form', 'file_input', 'webhook_simulator', 'url_input', 'run_button', 'context_setup'].includes(c.type);
}

function renderInputComponent(component: RuntimeInterfaceSpec['components'][number], className?: string) {
  switch (component.type) {
    case 'chat_input':
      return <ChatInterface key={component.id} className={className} />;
    case 'json_form': {
      const c = component as Extract<RuntimeInterfaceSpec['components'][number], { type: 'json_form' }>;
      return <JsonFormInput key={c.id} samplePayload={c.samplePayload} className={className} />;
    }
    case 'file_input': {
      const c = component as Extract<RuntimeInterfaceSpec['components'][number], { type: 'file_input' }>;
      return <FileInput key={c.id} accept={c.accept} maxSizeMb={c.maxSizeMb} className={className} />;
    }
    case 'webhook_simulator': {
      const c = component as Extract<RuntimeInterfaceSpec['components'][number], { type: 'webhook_simulator' }>;
      return <WebhookSimulator key={c.id} samplePayload={c.samplePayload} className={className} />;
    }
    case 'url_input': {
      const c = component as Extract<RuntimeInterfaceSpec['components'][number], { type: 'url_input' }>;
      return <UrlInput key={c.id} placeholder={c.placeholder} className={className} />;
    }
    case 'run_button':
      return <RunButton key={component.id} label={component.label} className={className} />;
    case 'context_setup': {
      const c = component as Extract<RuntimeInterfaceSpec['components'][number], { type: 'context_setup' }>;
      return <ContextSetup key={c.id} fields={c.fields} className={className} />;
    }
    default:
      return null;
  }
}

export function DynamicTestRenderer({ spec, balCode, className }: DynamicTestRendererProps) {
  const { execute, state } = useReviewExecution();
  const inputComponents = spec.components.filter(isInputComponent);
  const hasClusterTrace = spec.components.some(c => c.type === 'cluster_trace');
  const hasResultView = spec.components.some(c => c.type === 'result_view');

  // For hybrid mode with multiple input components, use tabs
  const [activeInputIdx, setActiveInputIdx] = useState(0);
  const useTabs = inputComponents.length > 1;

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveInputIdx((idx + 1) % inputComponents.length);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveInputIdx((idx - 1 + inputComponents.length) % inputComponents.length);
    }
  };

  return (
    <div className={cn('h-full flex flex-col gap-3', className)}>
      {/* Test suggestions banner */}
      {spec.testSuggestions && spec.testSuggestions.length > 0 && (
        <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2">
          <p className="text-[11px] font-medium text-primary mb-1">Suggested tests</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.testSuggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => {
                  if (!state.isExecuting) {
                    execute(suggestion);
                  }
                }}
                disabled={state.isExecuting}
                className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,40%)] gap-4">
        {/* Left: Input surface */}
        <div className="h-full flex flex-col gap-2 min-h-0">
          {useTabs && (
            <div
              className="shrink-0 flex gap-1 border-b border-border/50 pb-1"
              role="tablist"
              aria-label="Input method"
            >
              {inputComponents.map((c, idx) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={activeInputIdx === idx}
                  aria-controls={`tabpanel-${c.id}`}
                  tabIndex={activeInputIdx === idx ? 0 : -1}
                  onClick={() => setActiveInputIdx(idx)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-t-lg transition-colors',
                    activeInputIdx === idx
                      ? 'bg-background border border-b-0 border-border/50 font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {inputComponents.length > 0 ? (
            useTabs ? (
              <div role="tabpanel" id={`tabpanel-${inputComponents[activeInputIdx]!.id}`} className="flex-1 min-h-0">
                {renderInputComponent(inputComponents[activeInputIdx]!, 'h-full')}
              </div>
            ) : (
              renderInputComponent(inputComponents[0]!, 'flex-1 min-h-0')
            )
          ) : (
            <ChatInterface className="flex-1 min-h-0" />
          )}
        </div>

        {/* Right: Execution visualization + result */}
        <div className="h-full flex flex-col gap-3 min-h-0">
          {hasClusterTrace && (
            <ExecutionFlowReview
              balCode={balCode}
              className="flex-1 min-h-0"
            />
          )}
          {hasResultView && (
            <ResultView className={hasClusterTrace ? 'h-[200px] shrink-0' : 'flex-1 min-h-0'} />
          )}
          {!hasResultView && !hasClusterTrace && (
            <ResultView className="flex-1 min-h-0" />
          )}
        </div>
      </div>
    </div>
  );
}
