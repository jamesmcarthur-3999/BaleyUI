# Phase 6: Trigger/Testing UX Redesign

**Status:** Pending Review
**Dependencies:** None
**Estimated Scope:** ~400 LOC across 4 files

## Overview

The test panel currently shows a generic chatbot interface for all trigger types. This phase makes the test UI adapt based on how the BB is actually triggered — file upload BBs get an upload zone, webhook BBs get a JSON editor, schedule BBs get a preview.

**Existing code (DO NOT rebuild):**
- `apps/web/src/components/baleybots/TriggerConfig.tsx` — 95% complete trigger configuration component

---

## 6.1 — Surface TriggerConfig in Integrate Tab

### Current State

`TriggerConfig.tsx` exists and handles trigger type selection and configuration, but may not be fully surfaced in the bot detail integrate tab.

### Integration

**File:** Bot detail integrate tab component

Ensure `TriggerConfig` is prominently displayed in the integrate tab:

```
┌─────────────────────────────────────────────────────┐
│ Triggers                                             │
│                                                      │
│ How should this BaleyBot be triggered?               │
│                                                      │
│ [Manual] [Webhook] [Schedule] [BB Completion]        │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Webhook Configuration                            │ │
│ │ URL: https://.../{id}/webhook                   │ │
│ │ Secret: ••••••••                 [Regenerate]   │ │
│ │ Enabled: [ON]                                    │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Check What's Missing

Review `TriggerConfig.tsx` for:
- Does it handle all 4 trigger types (manual, webhook, schedule, bb_completion)?
- Does it persist configuration to the database?
- Does it show the webhook URL and secret?
- Does it allow schedule cron expression editing?

Fix any gaps found.

---

## 6.2 — Adaptive Test Surface

### Core Idea

The test tab's input interface adapts based on the BB's trigger type and input expectations.

### Trigger Type → Test UI Mapping

| Trigger Type | Test UI | Input Method |
|---|---|---|
| `manual` (chat) | Chatbot interface (current default) | Text input |
| `webhook` | JSON editor with sample payload | JSON textarea + "Send" |
| `schedule` | Preview of next run + manual "Run Now" | No custom input |
| `file_upload` | File upload zone + text context | Drag-and-drop area |
| `bb_completion` | Simulated output from source BB | JSON editor pre-filled with sample |

### Implementation

**File:** Modify test tab component (likely `apps/web/src/components/baleybots/TestPanel.tsx` or similar)

```typescript
function AdaptiveTestInput({ triggerType, baleybot }: Props) {
  switch (triggerType) {
    case 'webhook':
      return <WebhookTestEditor baleybot={baleybot} />;
    case 'schedule':
      return <ScheduleTestPreview baleybot={baleybot} />;
    case 'file_upload':
      return <FileUploadTestZone baleybot={baleybot} />;
    case 'bb_completion':
      return <ChainedInputEditor baleybot={baleybot} />;
    default:
      return <ChatTestInterface baleybot={baleybot} />;
  }
}
```

### Component Details

#### `WebhookTestEditor`
- JSON editor (monospace textarea with syntax highlighting)
- Pre-populated with sample webhook payload based on BB's input schema
- "Send Test Webhook" button
- Shows the actual webhook URL for reference
- HTTP method selector (POST/GET)
- After test: show "Webhook reachable" confirmation + link to execution
- Validate that test payload matches expected schema and show warnings if not
- Show a visible reconnect banner when SSE stream disconnects (network error recovery)

#### `ScheduleTestPreview`
- Shows cron expression in human-readable form ("Every day at 9am")
- Shows next 5 scheduled run times
- "Run Now" button to test immediately with no input
- Shows last run result if available

#### `FileUploadTestZone`
- Drag-and-drop file upload area
- Accepts file types based on BB configuration (or all files by default)
- Optional text context field below the upload zone
- Shows uploaded file name and size before execution
- Sends file content as base64 in the input

#### `ChainedInputEditor`
- JSON editor pre-filled with sample output from the source BB
- Dropdown to select which source BB to simulate
- "Simulate Chain" button
- Shows the input mapping configuration for reference

### Detecting Trigger Type

Read from the BB's trigger configuration:
```typescript
const triggerType = baleybot.webhookEnabled
  ? 'webhook'
  : baleybot.triggers?.[0]?.type
  ?? 'manual';
```

If the BB has an `output` block in its BAL with file-related tools, suggest `file_upload` mode.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
```

### Manual Testing
1. Create BB with webhook trigger → test tab shows JSON editor
2. Create BB with schedule trigger → test tab shows schedule preview + "Run Now"
3. Create BB with no trigger (manual) → test tab shows chatbot interface (default)
4. Switch trigger type → test tab UI updates accordingly

## Files Created/Modified

| Action | File |
|---|---|
| **Modify** | Bot detail integrate tab — ensure TriggerConfig is surfaced |
| **Modify** | `TriggerConfig.tsx` — fix any gaps found during review |
| **Create** | `components/baleybots/test/AdaptiveTestInput.tsx` — test UI switcher |
| **Create** | `components/baleybots/test/WebhookTestEditor.tsx` |
| **Create** | `components/baleybots/test/ScheduleTestPreview.tsx` |
| **Create** | `components/baleybots/test/FileUploadTestZone.tsx` |
| **Create** | `components/baleybots/test/ChainedInputEditor.tsx` |
| **Modify** | Test tab/panel component — use AdaptiveTestInput |
