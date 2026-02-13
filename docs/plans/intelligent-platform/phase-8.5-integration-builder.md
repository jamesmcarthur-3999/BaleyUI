# Phase 8.5: Integration Builder

**Status:** Pending Review
**Dependencies:** Phase 6.5, Phase 8
**Estimated Scope:** ~400 LOC across 5 files

## Overview

A guided integration builder powered by internal BaleyBots. Users describe what they want to integrate (e.g., "Send Slack messages when my support bot finishes"), and the builder generates the complete trigger + connection configuration.

---

## 8.5.1 — Internal BaleyBots

### `integration_analyst`

Analyzes the user's integration request and produces a structured integration plan:
- Which BBs to connect
- What trigger type to use
- What data mapping is needed
- Which connections are required

### `integration_tester`

Takes a completed integration configuration and validates it:
- Tests connection reachability
- Validates trigger configuration
- Simulates a test execution with sample data
- Reports any missing permissions or credentials

---

## 8.5.2 — Builder Flow

```
User describes integration
    ↓
integration_analyst BB produces plan
    ↓ (bb_fn_show_options: confirm plan)
User confirms/adjusts
    ↓
Auto-create triggers + connections
    ↓
integration_tester BB validates
    ↓ (bb_fn_show_table: test results)
User reviews and activates
```

The flow uses Phase 6.5's BB-driven UI framework to render inline forms, option cards, and test results.

---

## 8.5.3 — UI Surface

**File:** `apps/web/src/app/dashboard/integrations/builder/page.tsx`

A conversational page (similar to the creator) where the user chats with the integration builder and sees structured output rendered inline.

---

## Files Created/Modified

| Action | File |
|---|---|
| **Create** | Internal BB definitions for `integration_analyst` and `integration_tester` |
| **Create** | `apps/web/src/app/dashboard/integrations/builder/page.tsx` |
| **Create** | `apps/web/src/components/integrations/IntegrationBuilderChat.tsx` |
| **Create** | `apps/web/src/components/integrations/IntegrationPlanCard.tsx` |
| **Create** | `apps/web/src/components/integrations/IntegrationTestResults.tsx` |
