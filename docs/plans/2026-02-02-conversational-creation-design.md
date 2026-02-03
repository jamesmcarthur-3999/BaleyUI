# Conversational BaleyBot Creation

## Overview

Replace the static 4-step wizard with a live, visual creation experience. Users describe what they need, watch the AI build it in real-time, and can intervene at any point through natural conversation.

**Core principle**: Minimize pages, minimize navigation, maximize flow. The AI does the work - users only provide input when they want to, not when forms demand it.

## The Single-Screen Experience

### One URL, Three States

The creation screen (`/dashboard/baleybots/new`) seamlessly transitions through states:

**1. Empty State**
- Clean canvas with centered input
- Prompt: "What do you need?"
- No forms, no steps, no options - just describe and go

**2. Building State**
- Visual assembly begins on the canvas
- Entities appear, connections draw, tools attach
- Floating chat input slides in at bottom
- User can type to adjust while watching: "Actually, use Slack instead"

**3. Ready State**
- Build completes with subtle celebration
- "Run" button appears
- Input field for test data
- User can run immediately OR continue refining via chat
- This screen IS the bot's home - no redirect needed

After creation, the URL updates to `/dashboard/baleybots/[id]` without a page reload. Coming back to this URL shows the same interface with full conversation history.

## Visual Assembly

### What Users See

The canvas starts empty. As the AI works, elements animate in:

1. **Seed** - A glowing point appears center canvas (bot coming to life)
2. **Entities** - Rounded cards fade/scale in with name, icon, purpose
3. **Connections** - Lines animate between entities showing data flow
4. **Tools** - Small icons dock onto entities (database, notification, etc.)

### Animation Principles

- **Purposeful**: Each animation = a real AI decision
- **Reversible**: "Don't use email" → email icon animates out
- **Timing**: 3-5 seconds for simple bot (snappy but visible)
- **Interruptible**: User can type mid-build, AI adjusts course

### Visual Style

- Soft shadows on entity cards
- Gradient connections matching the playful purple theme
- Subtle grid background on canvas
- Entities auto-arrange but are draggable for manual layout

## Continuous Context

### The AI Remembers Everything

```
User: "Monitor my database for new signups and alert me"
      → Bot builds with database + notification

User: "Actually send to Slack instead"
      → Notification swaps to Slack (AI knows full context)

User: "Check every hour instead of real-time"
      → Schedule entity appears (AI remembers it's signup monitor)

User: "Run it"
      → Executes, shows results inline

User: "Output is too verbose"
      → AI adjusts output schema (knows everything prior)
```

### Persistence

- Conversation history persists with the BaleyBot
- Return tomorrow, context is still there
- Not a wizard you complete - a relationship with this bot

## Implementation Architecture

### The Creator Bot

A special BaleyBot powers the creation experience (dogfooding):

```bal
creator {
  "goal": "Help users build BaleyBots through natural conversation",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["generate_bal", "modify_entity", "add_tool", "remove_tool", "set_schedule"],
  "output": {
    "balCode": "string",
    "entities": "array",
    "connections": "array",
    "status": "building | ready | running"
  }
}
```

### Streaming Architecture

1. User sends message
2. Creator Bot streams structured output
3. As `entities` array grows in stream → UI animates each one in
4. As `connections` appear → lines draw
5. When `status` changes to `ready` → Run button appears

The UI is a pure render of the Creator Bot's output state.

### Data Model

```typescript
interface CreationSession {
  id: string;
  baleybotId: string | null;  // null until first save
  messages: Message[];
  currentState: {
    balCode: string;
    entities: VisualEntity[];
    connections: Connection[];
    status: 'empty' | 'building' | 'ready' | 'running';
  };
}

interface VisualEntity {
  id: string;
  name: string;
  icon: string;
  purpose: string;
  tools: string[];
  position: { x: number; y: number };
}

interface Connection {
  from: string;
  to: string;
  label?: string;
}
```

## UI Components

### Layout

```
┌─────────────────────────────────────────────────┐
│  [BaleyUI logo]  BaleyBots  Activity  Settings  │  ← App header (consistent)
├─────────────────────────────────────────────────┤
│                                                 │
│                                                 │
│              ┌─────────┐                        │
│              │ Entity  │────┐                   │
│              └─────────┘    │                   │  ← Canvas (visual assembly)
│                             ▼                   │
│                       ┌─────────┐               │
│                       │ Entity  │               │
│                       └─────────┘               │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐    │
│  │ What do you need?                    ↵  │    │  ← Chat input (floating)
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Component Breakdown

**1. Canvas**
- Full width/height of content area
- Subtle dot grid background
- Entities rendered as cards
- SVG layer for connection lines
- Auto-layout with manual drag override

**2. Chat Input**
- Floating pill at bottom center
- Always visible across all states
- Placeholder changes contextually:
  - Empty: "What do you need?"
  - Building: "Adjust something..."
  - Ready: "Ask anything or type input to run..."
- Send on Enter, Shift+Enter for newline

**3. Entity Card**
- Rounded corners (xl)
- Icon + name + brief purpose
- Tool badges docked at bottom
- Subtle glow when recently added
- Click to see details (slide-out, not new page)

**4. Action Bar** (appears when ready)
- Integrated with chat input area
- "Run" button with test input field
- Results appear inline below canvas
- "View Code" toggle for BAL inspection

## State Transitions

```
EMPTY ──[user types]──▶ BUILDING ──[complete]──▶ READY
                            │                      │
                            │◀──[user adjusts]─────┤
                            │                      │
                            │                      ▼
                            │                   RUNNING
                            │                      │
                            │◀──[user refines]─────┘
```

All transitions are smooth CSS animations. No hard cuts, no loading spinners blocking the UI.

## What We're Removing

The old wizard had:
- ❌ Step 1: Describe (separate page state)
- ❌ Step 2: Review Plan (cards showing what it will do)
- ❌ Step 3: Connect (data source selection grid)
- ❌ Step 4: Activate (confirmation page)
- ❌ Progress indicator
- ❌ Back/Next buttons
- ❌ "Looks Good" confirmation

**All replaced with**: Describe → Watch → Use

## Migration Path

1. New creation flow at `/dashboard/baleybots/new`
2. Existing BaleyBots get the same interface at `/dashboard/baleybots/[id]`
3. The "detail page" concept merges with creation - it's all one experience
4. Dashboard cards link directly to this unified view

## Success Criteria

- User can create a working BaleyBot in < 30 seconds
- Zero mandatory form fields
- User can interrupt/adjust at any point
- No page navigations during create→test flow
- Context persists across sessions
- Feels like collaborating with an AI, not filling out forms
