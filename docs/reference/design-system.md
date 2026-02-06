# BaleyUI Design System

**Version:** 1.0
**Date:** February 1, 2026
**Status:** Active

This document defines the interaction patterns, component standards, and UX guidelines for BaleyUI. All UI work must follow these patterns to ensure consistency and quality.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Interaction Hierarchy](#2-interaction-hierarchy)
3. [Component Patterns](#3-component-patterns)
4. [Navigation System](#4-navigation-system)
5. [Keyboard Shortcuts](#5-keyboard-shortcuts)
6. [Animation & Transitions](#6-animation--transitions)
7. [Color & State](#7-color--state)
8. [Microcopy Guidelines](#8-microcopy-guidelines)
9. [Accessibility](#9-accessibility)
10. [Component Reference](#10-component-reference)

---

## 1. Core Principles

### 1.1 Invisible UI

> "The best button is one that isn't there."

- Every element must earn its place
- Content is the hero, not chrome
- Reduce cognitive load ruthlessly

### 1.2 Stay in Place

> "Don't take users somewhere else."

- Actions happen where they're triggered
- Preserve context during interactions
- Avoid page navigations for simple operations

### 1.3 Dual-Path Interaction

> "AI-guided and manual paths are both first-class."

- Every task can be done via AI or direct manipulation
- Neither path is a fallback for the other
- Both paths use the same underlying components

### 1.4 Job-Oriented

> "Users come to do jobs, not use features."

- Frame everything as outcomes, not tools
- Navigation reflects user goals
- Labels describe what happens, not what things are

---

## 2. Interaction Hierarchy

When adding any interactive element, choose the **highest level** (smallest footprint) that works.

### Level 1: Inline (Best)

Action completes without any new UI appearing.

**Use for:**
- Toggle states (enable/disable)
- Increment/decrement values
- Star/favorite actions

```
Example: Enable toggle
┌─────────────────────────────────┐
│ Auto-run on schedule   [━━●]   │  ← Click toggles immediately
└─────────────────────────────────┘
```

### Level 2: Transform (Great)

The element transforms to reveal options or confirmation.

**Use for:**
- Delete/destructive actions
- Rename/edit single fields
- Quick selections

```
Example: Delete with confirmation
Before:     [ 🗑️ Delete ]
After:      [ Delete? ✕ ] [ Confirm ]
Completed:  (item removed, toast shown)
```

```
Example: Inline edit
Before:     Conversion Analyzer  [✏️]
Editing:    [Conversion Analyzer____] [✓] [✕]
After:      Conversion Analyzer  [✏️]  (with subtle save flash)
```

### Level 3: Popover (Good)

Small contextual popup anchored to the trigger.

**Use for:**
- Selection from a list (add tool, pick model)
- Additional options menu
- Quick forms (1-3 fields)

```
Example: Add tool popover
[ + Add Tool ]
       │
       ▼
┌─────────────────────────┐
│ 🔍 Search tools...      │
├─────────────────────────┤
│ 📊 query_database       │
│ 📧 send_email           │
│ 📝 write_report         │
└─────────────────────────┘
```

**Popover Rules:**
- Anchored to trigger element
- Click outside or Escape to close
- Max height with scroll if needed
- Arrow pointing to trigger

### Level 4: Slide Panel (Acceptable)

Panel slides in from edge. Main content remains visible but dimmed.

**Use for:**
- Configuration forms (4+ fields)
- Detail views
- Multi-section editing

```
Example: Agent configuration
┌─────────────────────────────────────────┬──────────────────────┐
│                                         │                      │
│  (main content, dimmed)                 │  Configure Agent     │
│                                         │                      │
│                                         │  Name: [___________] │
│                                         │  Goal: [___________] │
│                                         │  Model: [Claude ▼]   │
│                                         │                      │
│                                         │  [Cancel] [Save]     │
└─────────────────────────────────────────┴──────────────────────┘
```

**Slide Panel Rules:**
- Always from right edge
- Width: 400-600px depending on content
- Click outside or Escape to close
- Heading with close button
- Actions at bottom

### Level 5: Modal (Last Resort)

Full modal dialog that blocks interaction with main content.

**Use ONLY for:**
- Multi-step flows requiring focus (onboarding)
- Dangerous bulk operations ("Delete 15 agents")
- Complex creation requiring multiple required fields

**Modal Rules:**
- Centered, max-width 500px for simple, 700px for complex
- Always escapable (Escape key, click outside, X button)
- Clear title stating what the modal does
- Max 2 buttons: Cancel (left), Primary (right)
- Primary button describes action ("Create Agent", not "Submit")

---

## 3. Component Patterns

### 3.1 ConfirmButton

For destructive actions requiring confirmation without a modal.

**States:**
1. **Default:** Shows action label
2. **Confirming:** Transforms to show confirmation
3. **Loading:** Shows spinner during action
4. **Complete:** Button disappears, item removed

**Behavior:**
- First click → transform to confirmation state
- Second click → execute action
- Click elsewhere or wait 3s → revert to default
- Show keyboard shortcut on hover

```tsx
<ConfirmButton
  label="Delete"
  confirmLabel="Confirm"
  onConfirm={handleDelete}
  variant="destructive"
  shortcut="⌘⌫"
/>
```

### 3.2 InlineEdit

For editing single text values without leaving context.

**States:**
1. **Display:** Shows value with edit affordance on hover
2. **Editing:** Input field with save/cancel buttons
3. **Saving:** Input disabled with spinner
4. **Saved:** Flash highlight, return to display

**Behavior:**
- Click text or edit icon → enter editing mode
- Enter → save
- Escape → cancel
- Click outside → save (not cancel)
- Auto-select all text on edit

```tsx
<InlineEdit
  value={name}
  onSave={handleSave}
  placeholder="Enter name..."
/>
```

### 3.3 ActionPopover

For contextual menus and quick selections.

**Structure:**
```
┌─────────────────────────┐
│ 🔍 [Search input]       │  ← Optional, for lists > 5 items
├─────────────────────────┤
│ GROUP LABEL             │  ← Optional grouping
│ ─────────────────────── │
│ 🔧 Action one      ⌘1  │
│ 🔧 Action two      ⌘2  │
├─────────────────────────┤
│ 🗑️ Destructive     ⌘⌫  │  ← Destructive at bottom, separated
└─────────────────────────┘
```

**Rules:**
- Max 8 items visible without scroll
- Show shortcuts aligned right
- Icons for scannability
- Destructive actions separated at bottom
- Search field for lists > 5 items

### 3.4 SlidePanel

For configuration and detail views.

**Structure:**
```
┌────────────────────────────────────────┐
│ Panel Title                       [✕]  │
├────────────────────────────────────────┤
│                                        │
│ Content area with scroll               │
│                                        │
│                                        │
├────────────────────────────────────────┤
│                    [Cancel]  [Save]    │  ← Sticky footer
└────────────────────────────────────────┘
```

**Rules:**
- Fixed header with title and close
- Scrollable content area
- Sticky footer with actions
- Width: 420px (narrow), 560px (standard), 720px (wide)
- Animate in: slide from right, 200ms ease-out
- Backdrop dims main content to 50% opacity

### 3.5 StreamingCard

For showing live execution output inline.

**States:**
1. **Idle:** Collapsed or hidden
2. **Running:** Expanded with streaming content
3. **Complete:** Shows summary with action buttons

```
┌─────────────────────────────────────────────────┐
│ ● Running...                              2.3s  │
├─────────────────────────────────────────────────┤
│ ✓ Queried 847 sessions                         │
│ ✓ Identified 3 patterns                        │
│ ● Generating report...                         │
│ ▊                                              │
└─────────────────────────────────────────────────┘

After completion:
┌─────────────────────────────────────────────────┐
│ ✓ Complete                               12.7s  │
├─────────────────────────────────────────────────┤
│ Generated: Conversion Report                    │
│ [View Report]  [View Timeline]  [Run Again]    │
└─────────────────────────────────────────────────┘
```

### 3.6 Toast

For non-blocking feedback.

**Types:**
- **Success:** Auto-dismiss in 3s, optional undo
- **Error:** Persists until dismissed, includes action
- **Info:** Auto-dismiss in 4s
- **Loading:** Persists until complete

**Structure:**
```
┌────────────────────────────────────────┐
│ ✓ Agent saved                   [Undo] │
└────────────────────────────────────────┘
```

**Rules:**
- Position: bottom-right, above AI companion
- Stack upward if multiple
- Max 3 visible at once (oldest dismissed)
- Include undo for reversible actions
- Include action button for errors

---

## 4. Navigation System

### 4.1 Primary Navigation

The top bar contains only:
- Logo (links to home)
- Command palette trigger (⌘K)
- Theme toggle
- User menu

```
┌─────────────────────────────────────────────────────────────┐
│  BaleyUI                                    [⌘K]  🌓  👤    │
└─────────────────────────────────────────────────────────────┘
```

No other navigation links in the header.

### 4.2 Command Palette

Primary method for navigation and global actions.

**Trigger:** ⌘K (Mac), Ctrl+K (Windows)

**Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│  🔍 What do you want to do?                            ✕   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  QUICK ACTIONS                                              │
│  ➕ Create new agent                                  ⌘N   │
│  ▶️ Run last agent                                    ⌘R   │
│                                                             │
│  RECENT                                                     │
│  🤖 Conversion Analyzer                         edited 2h   │
│  🤖 Support Router                                 ran 1d   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Try: "create", "run", "settings", or ask a question       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Opens instantly (<50ms)
- Fuzzy search across agents, flows, actions, settings
- Results grouped by type
- Arrow keys to navigate, Tab to jump groups
- Enter to select
- Recent items shown by default
- Natural language queries passed to AI companion

### 4.3 Contextual Breadcrumbs

When viewing a specific item, show path:

```
Home  /  Agents  /  Conversion Analyzer
```

- Each segment is clickable
- Only show when depth > 1
- Truncate long names with ellipsis

### 4.4 User Menu

Dropdown from user avatar:

```
┌─────────────────────────┐
│ james@company.com       │
├─────────────────────────┤
│ ⚙️ Settings              │
│ 🔑 API Keys              │
│ 🔗 Connections           │
├─────────────────────────┤
│ 📖 Documentation         │
│ 💬 Feedback              │
├─────────────────────────┤
│ 🚪 Sign out              │
└─────────────────────────┘
```

---

## 5. Keyboard Shortcuts

### 5.1 Global Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K | Open command palette |
| ⌘N | Create new agent |
| ⌘R | Run current/last agent |
| ⌘S | Save current item |
| ⌘, | Open settings |
| Escape | Close any overlay/panel |
| ? | Show keyboard shortcuts |

### 5.2 Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| G then H | Go home |
| G then A | Go to agents |
| G then F | Go to flows |
| G then S | Go to settings |

### 5.3 Item Shortcuts (when item focused)

| Shortcut | Action |
|----------|--------|
| Enter | Open/edit item |
| ⌘Enter | Run item |
| E | Edit item |
| D | Duplicate item |
| ⌘⌫ | Delete item |

### 5.4 Displaying Shortcuts

- Show on hover after 500ms delay
- Show in command palette results
- Show in context menus (right-aligned)
- Use ⌘ symbol for Mac, Ctrl for Windows (detect OS)

---

## 6. Animation & Transitions

### 6.1 Timing

| Type | Duration | Easing |
|------|----------|--------|
| Micro (hover, focus) | 100ms | ease-out |
| Small (popover, toast) | 150ms | ease-out |
| Medium (panel slide) | 200ms | ease-out |
| Large (modal, page) | 250ms | ease-in-out |

### 6.2 Specific Animations

**Popover:**
- Enter: fade in + scale from 95% to 100%
- Exit: fade out

**Slide Panel:**
- Enter: slide from right + fade backdrop
- Exit: slide to right + fade backdrop

**Toast:**
- Enter: slide up from bottom + fade in
- Exit: fade out + slide down

**Delete item:**
- Scale down to 95% + fade out
- Collapse gap (height to 0)

**Save flash:**
- Brief background color pulse (success color at 20% opacity)
- Duration: 400ms

### 6.3 Reduced Motion

Respect `prefers-reduced-motion`:
- Replace slides with fades
- Reduce durations by 50%
- Remove scale transforms

---

## 7. Color & State

### 7.1 Semantic Colors

| Purpose | Variable | Usage |
|---------|----------|-------|
| Primary | `--primary` | Main actions, links, focus |
| Destructive | `--destructive` | Delete, remove, danger |
| Success | `--success` | Completed, saved, connected |
| Warning | `--warning` | Caution, pending, attention |
| Muted | `--muted` | Secondary text, disabled |

### 7.2 Interactive States

**Buttons:**
- Default: Base color
- Hover: 10% darker
- Active/Pressed: 15% darker
- Disabled: 50% opacity, no pointer events
- Focus: Ring outline (2px, primary color, 2px offset)

**Inputs:**
- Default: Border muted
- Hover: Border slightly darker
- Focus: Border primary + ring
- Error: Border destructive
- Disabled: Background muted, 50% opacity

### 7.3 Status Indicators

| Status | Color | Icon |
|--------|-------|------|
| Running | Blue | Animated spinner |
| Completed | Green | Checkmark |
| Failed | Red | X circle |
| Pending | Gray | Clock |
| Paused | Yellow | Pause |

---

## 8. Microcopy Guidelines

### 8.1 Be Direct

| Don't | Do |
|-------|-----|
| "Are you sure you want to delete this item?" | "Delete?" |
| "Successfully saved" | "Saved" |
| "An error has occurred" | "Couldn't save. Try again." |
| "Click here to submit" | "Save" |

### 8.2 Action Labels

Buttons describe what happens when clicked:

| Don't | Do |
|-------|-----|
| "Submit" | "Create Agent" |
| "OK" | "Save Changes" |
| "Yes" | "Delete Agent" |
| "Confirm" | "Run Flow" |

### 8.3 Error Messages

Structure: What happened + What to do

| Don't | Do |
|-------|-----|
| "Error 500" | "Server error. Try again in a moment." |
| "Invalid input" | "Name can't be empty." |
| "Request failed" | "Couldn't connect. Check your internet." |

### 8.4 Empty States

Structure: What this is + How to start

```
No agents yet

Create your first agent to analyze data,
automate tasks, or generate reports.

[Create Agent]
```

### 8.5 Loading States

Use specific language when possible:

| Don't | Do |
|-------|-----|
| "Loading..." | "Loading agents..." |
| "Please wait" | "Analyzing data..." |
| "Processing" | "Generating report..." |

---

## 9. Accessibility

### 9.1 Keyboard Navigation

- All interactive elements focusable via Tab
- Logical tab order (left→right, top→bottom)
- Visible focus indicators (never remove outlines)
- Skip link at start of page
- Escape closes any overlay

### 9.2 Screen Readers

- All images have alt text (or aria-hidden if decorative)
- Icons have aria-label or accompanying text
- Live regions for dynamic content (toasts, streaming)
- Proper heading hierarchy (h1 → h2 → h3)
- Form inputs have associated labels

### 9.3 Color & Contrast

- Minimum 4.5:1 contrast for text
- Minimum 3:1 contrast for UI elements
- Don't rely on color alone (use icons, text)
- Support forced-colors mode

### 9.4 Motion

- Respect prefers-reduced-motion
- No auto-playing animations
- Provide pause controls for continuous motion

---

## 10. Component Reference

### Core Components to Build/Update

| Component | Level | Status | Priority |
|-----------|-------|--------|----------|
| `ConfirmButton` | Transform | New | P0 |
| `InlineEdit` | Transform | New | P0 |
| `ActionPopover` | Popover | New | P0 |
| `SlidePanel` | Panel | New | P0 |
| `CommandPalette` | Modal | Update | P0 |
| `StreamingCard` | Inline | New | P1 |
| `Toast` | Overlay | Update | P1 |
| `Breadcrumbs` | Inline | Update | P1 |
| `StatusBadge` | Inline | Exists | - |
| `EmptyState` | Inline | Exists | - |

### Component File Locations

All new design system components go in:
```
src/components/ui/
├── confirm-button.tsx
├── inline-edit.tsx
├── action-popover.tsx
├── slide-panel.tsx
├── streaming-card.tsx
└── ... (existing components)
```

### Usage Examples

See individual component files for:
- Props interface
- Usage examples
- Variant options
- Accessibility notes

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-01 | Initial design system |

---

*This document is the source of truth for BaleyUI design decisions. All new UI work must follow these patterns.*
