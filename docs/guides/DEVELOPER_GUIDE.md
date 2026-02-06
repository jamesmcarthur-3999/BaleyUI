# BaleyUI Developer Guide

This guide covers the core concepts, patterns, and architecture of BaleyUI.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Event Sourcing System](#event-sourcing-system)
3. [Output System](#output-system)
4. [AI Companion](#ai-companion)
5. [Onboarding Agent](#onboarding-agent)
6. [Hooks](#hooks)
7. [Accessibility](#accessibility)
8. [React 19 Patterns](#react-19-patterns)

## Architecture Overview

BaleyUI is built on these core systems:

```
apps/web/src/
├── app/                    # Next.js App Router pages
│   ├── api/events/         # SSE endpoints for real-time events
│   └── dashboard/          # Dashboard pages
├── components/
│   ├── blocks/             # Block components (agents, flows)
│   ├── companion/          # AI companion interface
│   ├── onboarding/         # Onboarding experience
│   └── outputs/            # Output rendering components
├── hooks/                  # Custom React hooks
├── lib/
│   ├── agents/             # Agent definitions and tools
│   ├── events/             # Event sourcing system
│   ├── outputs/            # Output templates and tools
│   └── accessibility/      # A11y utilities
└── stores/                 # Zustand state stores
```

## Event Sourcing System

All builder actions are captured as immutable events for:
- Real-time collaboration ("watch AI build")
- Time-travel debugging
- Undo/redo functionality
- Audit logging

### Event Types

```typescript
// Event schema definition
type BuilderEventType =
  | 'block.created'
  | 'block.updated'
  | 'block.deleted'
  | 'flow.created'
  | 'flow.updated'
  | 'flow.deleted'
  | 'connection.created'
  | 'connection.deleted'
  | 'execution.started'
  | 'execution.completed'
  | 'execution.failed'
  | 'config.updated';
```

### Subscribing to Events

```typescript
import { useBuilderEvents } from '@/hooks';

function MyComponent() {
  const { events, isConnected, error } = useBuilderEvents({
    workspaceId: 'workspace-123',
    eventTypes: ['block.created', 'block.updated'],
    onEvent: (event) => {
      console.log('New event:', event);
    },
  });
}
```

### Emitting Events

Events are automatically emitted through tRPC middleware:

```typescript
import { emitBuilderEvent } from '@/lib/events/with-events';

// In a tRPC procedure
await emitBuilderEvent(ctx, 'block.created', {
  blockId: newBlock.id,
  blockType: 'agent',
  name: newBlock.name,
});
```

### SSE Endpoint

Real-time events are streamed via Server-Sent Events:

```
GET /api/events/[workspaceId]
```

## Output System

AI agents can generate structured outputs using templates.

### Available Templates

1. **Report** - Multi-section documents with metrics, charts, insights
2. **Dashboard** - Grid-based layout for live monitoring
3. **Data Table** - Tabular data with sorting, filtering, pagination

### Using OutputBuilder

```typescript
import { OutputBuilder } from '@/lib/outputs/tools';

const builder = new OutputBuilder();

builder
  .createOutput({
    type: 'report',
    title: 'Monthly Analysis',
    description: 'Performance metrics for January',
  })
  .setCreator({
    type: 'ai-agent',
    id: 'analyst-agent',
    name: 'Analyst',
  })
  .emitMetric({
    id: 'revenue',
    title: 'Total Revenue',
    value: 125000,
    change: { value: 15.2, direction: 'up' },
    color: 'success',
  })
  .emitChart({
    id: 'trend',
    type: 'line',
    title: 'Monthly Trend',
    data: [
      { label: 'Jan', value: 100 },
      { label: 'Feb', value: 120 },
      { label: 'Mar', value: 125 },
    ],
  });

const artifact = builder.build();
```

### Rendering Outputs

```tsx
import { ReportTemplate, DashboardTemplate } from '@/components/outputs';

// Report
<ReportTemplate data={artifact.data} template={reportTemplate} />

// Dashboard
<DashboardTemplate data={artifact.data} template={dashboardTemplate} />
```

## AI Companion

The AI companion provides multiple interaction modes.

### Modes

1. **Collapsed** - Minimal presence, expandable
2. **Orb** - Ambient AI presence with visual states
3. **Chat** - Full conversational interface
4. **Command** - Cmd+K quick actions
5. **Voice** - Speech input/output

### Using the Companion

```tsx
import { CompanionContainer } from '@/components/companion';

<CompanionContainer
  initialMode="collapsed"
  onModeChange={(mode) => console.log('Mode changed:', mode)}
  className="fixed bottom-4 right-4"
/>
```

### Command Palette

```typescript
import { useCommandPalette } from '@/components/companion/CommandPalette';

function MyComponent() {
  const { open, close, isOpen, toggle } = useCommandPalette();

  // Use keyboard shortcut (Cmd+K) to toggle
  // Or call toggle() programmatically
}
```

## Onboarding Agent

The onboarding system guides new users through the platform.

### Agent Definition

```typescript
import { onboardingAgentDefinition } from '@/lib/agents/onboarding';

// Access tools
const tools = onboardingAgentDefinition.tools;
// ['explain_concept', 'show_example', 'start_tutorial', ...]
```

### Tool Functions

```typescript
import {
  explainConcept,
  showExample,
  startTutorial,
  checkProgress,
  createSampleAgent,
  provideFeedback,
} from '@/lib/agents/onboarding';

// Explain a concept
const result = explainConcept('agents', 'detailed');
// { success: true, data: { explanation, relatedConcepts } }

// Show code example
const example = showExample('simple-agent');
// { success: true, data: { title, description, code } }

// Start interactive tutorial
const tutorial = startTutorial('first-agent');
// { success: true, data: { title, steps, currentStep } }
```

### Task System Component

```tsx
import { TaskSystem } from '@/components/onboarding';

<TaskSystem
  completedTaskIds={['welcome', 'concepts']}
  onTaskComplete={(taskId) => saveProgress(taskId)}
  onTaskStart={(taskId) => navigateToTask(taskId)}
/>
```

## Hooks

### Performance Hooks

```typescript
// Virtual list for large datasets
import { useVirtualList } from '@/hooks';

const { containerRef, virtualItems, totalHeight, scrollToIndex } = useVirtualList({
  itemCount: 10000,
  itemHeight: 50,
  overscan: 5,
});

// Auto-save with debounce
import { useAutoSave } from '@/hooks';

const { status, saveNow, hasUnsavedChanges } = useAutoSave({
  data: formData,
  onSave: async (data) => api.save(data),
  debounceMs: 1000,
});

// Optimized event subscription
import { useOptimizedEvents } from '@/hooks';

const { events, isConnected, reconnect } = useOptimizedEvents({
  workspaceId,
  eventTypes: ['block.created'],
  batchInterval: 50,
});
```

### Accessibility Hooks

```typescript
// Keyboard navigation
import { useRovingTabindex, useAccessibleFocusTrap, useEscapeKey } from '@/hooks';

// Roving tabindex for lists
const { activeIndex, getItemProps } = useRovingTabindex(items.length, {
  orientation: 'vertical',
  loop: true,
  onSelect: (index) => handleSelect(index),
});

// Focus trap for modals (uses accessibility library)
const containerRef = useAccessibleFocusTrap({ active: isOpen });

// Escape key handler
useEscapeKey(() => closeModal(), isOpen);
```

## Accessibility

### ARIA Utilities

```typescript
import {
  announce,
  announceProgress,
  trapFocus,
  createKeyboardNavigation,
  getDialogAriaProps,
} from '@/lib/accessibility';

// Screen reader announcements
announce('Item deleted successfully', 'polite');
announceProgress(5, 10, 'Upload progress');

// Dialog ARIA props
const dialogProps = getDialogAriaProps('dialog-title', 'dialog-description');
```

### Reduced Motion

```typescript
import { prefersReducedMotion, getAnimationDuration } from '@/lib/accessibility';

const duration = getAnimationDuration(300); // Returns 0 if reduced motion preferred
```

## React 19 Patterns

BaleyUI follows React 19 best practices:

### No useMemo/useCallback

React 19's compiler handles memoization automatically. Avoid:

```typescript
// DON'T do this
const memoizedValue = useMemo(() => expensiveCalc(data), [data]);
const memoizedCallback = useCallback((x) => doSomething(x), []);

// DO this instead
const value = expensiveCalc(data);
const handler = (x) => doSomething(x);
```

### No React.memo

Components are memoized by the compiler:

```typescript
// DON'T do this
const MyComponent = React.memo(function MyComponent(props) {
  // ...
});

// DO this instead
function MyComponent(props) {
  // ...
}
```

### Event Handlers

Inline event handlers are fine:

```tsx
<button onClick={() => handleClick(id)}>Click</button>
```

### State Updates

Use the functional update pattern for state that depends on previous state:

```typescript
setCount((prev) => prev + 1);
setItems((prev) => [...prev, newItem]);
```

## Testing

See [TESTING.md](./TESTING.md) for testing guidelines.

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm --filter @baleyui/web test

# Watch mode
pnpm --filter @baleyui/web test -- --watch

# Integration tests only
pnpm --filter @baleyui/web test -- --run src/__tests__/integration/
```
