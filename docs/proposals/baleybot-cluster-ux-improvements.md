# BaleyBot Cluster UX Improvements Proposal

## Executive Summary

BaleyUI has excellent single-BaleyBot creation via AI-powered conversation, but lacks the UX for composing and managing **clusters** - groups of BaleyBots that work together. This proposal addresses that gap with concrete UX improvements.

---

## Current State Analysis

### What Works Well
- **Conversational creation**: Chat with Creator Bot to build a single BaleyBot
- **Visual feedback**: Canvas shows the bot structure as it's being built
- **Code editor**: Monaco editor with BAL syntax highlighting
- **Backend infrastructure**: bb_completion triggers, chain validation, input mapping

### What's Missing
- **Cluster composition UI**: No visual way to connect multiple BBs
- **Cluster-first workflow**: Must create BBs one-by-one, then chain via code
- **Connection management**: No UI to configure triggers between BBs
- **Cluster monitoring**: No dashboard showing cluster execution flow
- **Data flow visibility**: Can't see what data passes between BBs

---

## Proposed UX Improvements

### 1. Cluster Dashboard (New Page)

**Route:** `/dashboard/clusters`

**Purpose:** Single view of all BaleyBot clusters in the workspace.

**Design:**
```
┌─────────────────────────────────────────────────────────────┐
│  Clusters                                    [+ New Cluster] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │ Research Pipeline    │  │ Customer Support     │        │
│  │ ┌───┐→┌───┐→┌───┐   │  │ ┌───┐→┌───┐         │        │
│  │ │ R │ │ A │ │ S │   │  │ │ T │ │ R │         │        │
│  │ └───┘ └───┘ └───┘   │  │ └───┘ └───┘         │        │
│  │ 3 bots • 47 runs    │  │ 2 bots • 128 runs   │        │
│  │ Last: 2 hours ago   │  │ Last: 5 mins ago    │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Mini-graph preview of each cluster
- Execution stats and last run time
- Quick actions: Run, Edit, Clone, Delete
- Filter by status (Active, Disabled, Error)

---

### 2. Visual Cluster Composer (New Feature)

**Route:** `/dashboard/clusters/[id]/edit` or `/dashboard/clusters/new`

**Purpose:** Drag-and-drop interface for composing BaleyBot clusters.

**Design:**
```
┌─────────────────────────────────────────────────────────────┐
│  Cluster: Research Pipeline                    [Save] [Run] │
├──────────────┬──────────────────────────────────────────────┤
│  Available   │                                              │
│  BaleyBots   │     ┌─────────┐      ┌─────────┐            │
│              │     │Researcher│──────│Analyzer │            │
│  ┌────────┐  │     │  📚     │      │   🔬   │            │
│  │ Chat   │  │     └─────────┘      └────┬────┘            │
│  │ Helper │  │                           │                  │
│  └────────┘  │                      ┌────▼────┐            │
│              │                      │Summarizer│            │
│  ┌────────┐  │                      │   📝    │            │
│  │ Data   │  │                      └─────────┘            │
│  │ Fetch  │  │                                              │
│  └────────┘  │  [+] Add new BaleyBot to cluster            │
│              │                                              │
│  [+ Create]  │──────────────────────────────────────────────│
│              │  Connection: Researcher → Analyzer           │
│              │  ┌─────────────────────────────────────────┐ │
│              │  │ Trigger: On Success                     │ │
│              │  │ Input: Pass research.findings           │ │
│              │  │ Condition: (optional)                   │ │
│              │  └─────────────────────────────────────────┘ │
└──────────────┴──────────────────────────────────────────────┘
```

**Interaction Model:**
1. **Drag BBs from sidebar** onto canvas
2. **Draw connections** by dragging from output port to input port
3. **Click connection** to configure trigger type and input mapping
4. **Right-click node** for context menu (edit, remove, duplicate)
5. **Auto-arrange** button for clean layout

**Connection Configuration Panel:**
- Trigger type: On Success / On Failure / On Completion
- Input mapping: Visual field mapper or expression editor
- Conditions: Optional boolean expression for conditional routing

---

### 3. Cluster-First Creation Flow

**Current Flow:**
1. Create Bot A
2. Create Bot B
3. Edit Bot B's BAL to add `"trigger": "bb_completion:Bot A"`
4. Save

**Proposed Flow:**
1. Click "New Cluster"
2. Name the cluster and describe its purpose
3. AI suggests a cluster structure (or start blank)
4. Add/create BBs on the canvas
5. Draw connections between them
6. Configure each connection's trigger and data flow
7. Save the cluster

**AI-Assisted Cluster Creation:**
```
┌─────────────────────────────────────────────────────────────┐
│  What should this cluster do?                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Research a topic, analyze the findings, and create     ││
│  │ a summary report                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                              [Generate] →   │
│                                                             │
│  Suggested Cluster:                                         │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐          │
│  │Researcher │ →  │ Analyzer  │ →  │Summarizer │          │
│  │web_search │    │           │    │           │          │
│  │fetch_url  │    │           │    │           │          │
│  └───────────┘    └───────────┘    └───────────┘          │
│                                                             │
│  [Accept & Edit]  [Regenerate]  [Start Blank]              │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Data Flow Visualization

**Purpose:** Show what data moves between BBs at runtime.

**Design (During Execution):**
```
┌─────────────────────────────────────────────────────────────┐
│  Execution: Research Pipeline • Running                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐ ═══════════════▶ ┌─────────┐                  │
│  │Researcher│  findings: [..] │ Analyzer │ (running)       │
│  │ ✓ Done  │  sources: 5     │   ⏳     │                  │
│  └─────────┘                  └─────────┘                  │
│       │                            │                        │
│       │ {                          │                        │
│       │   "findings": [            │                        │
│       │     "AI agents are...",    │                        │
│       │     "Recent advances..."   │                        │
│       │   ],                       │                        │
│       │   "sources": [...]         │                        │
│       │ }                          │                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Live status indicators on each node
- Hover on connection to see data being passed
- Click node to see its full input/output
- Execution timeline with replay capability

---

### 5. Connection Quick-Edit Modal

**Problem:** Currently requires editing BAL code to change how BBs are connected.

**Solution:** Click any connection in the cluster view to edit it visually.

```
┌─────────────────────────────────────────────────────────────┐
│  Configure Connection                              [×]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  From: Researcher        To: Analyzer                       │
│                                                             │
│  Trigger When:                                              │
│  ○ Success only                                             │
│  ● Any completion                                           │
│  ○ Failure only                                             │
│                                                             │
│  Data to Pass:                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Source Field          │  Target Field                  ││
│  ├───────────────────────┼────────────────────────────────┤│
│  │ result.findings       │  findings                      ││
│  │ result.sources        │  sources                       ││
│  │ + Add mapping                                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Condition (optional):                                      │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ result.findings.length > 0                              ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│                                    [Cancel]  [Save]        │
└─────────────────────────────────────────────────────────────┘
```

---

### 6. Cluster Templates (Pattern Library)

**Purpose:** Pre-built cluster patterns for common use cases.

**Templates:**
| Template | Description | BBs |
|----------|-------------|-----|
| Research & Report | Research topic → Analyze → Summarize | 3 |
| Extract-Transform-Load | Fetch data → Transform → Store | 3 |
| Human-in-Loop | Process → Review → Approve/Reject | 3 |
| Fan-out Analysis | Single input → Parallel analyzers → Merge | 4 |
| Iterative Refinement | Generate → Critique → Improve (loop) | 3 |

**UI:**
```
┌─────────────────────────────────────────────────────────────┐
│  Start from Template                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Research &   │  │ Extract      │  │ Human in     │      │
│  │ Report       │  │ Transform    │  │ Loop         │      │
│  │ ───→───→─── │  │ ───→───→─── │  │ ───→◇→───    │      │
│  │ 3 bots       │  │ 3 bots       │  │ 3 bots       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │ Fan-out      │  │ Iterative    │                        │
│  │ Analysis     │  │ Refinement   │                        │
│  │    ╱│╲       │  │ ↻───→───    │                        │
│  │ 4 bots       │  │ 3 bots       │                        │
│  └──────────────┘  └──────────────┘                        │
│                                                             │
│  [Start Blank]                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 7. Improved BaleyBot Sidebar Discovery

**Problem:** When building a cluster, hard to discover existing BBs to chain with.

**Solution:** Enhanced sidebar in the cluster composer.

```
┌──────────────────────┐
│  Add to Cluster      │
├──────────────────────┤
│  [🔍 Search...]      │
│                      │
│  YOUR BALEYBOTS      │
│  ┌────────────────┐  │
│  │ 📊 Analyzer    │  │
│  │ Analyzes data  │  │
│  │ ⚡ Instant     │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ 📝 Summarizer  │  │
│  │ Creates summary│  │
│  │ ⚡ ~3s         │  │
│  └────────────────┘  │
│                      │
│  SUGGESTED           │
│  ┌────────────────┐  │
│  │ 🔍 Researcher  │  │
│  │ Good upstream  │  │
│  │ for Analyzer   │  │
│  └────────────────┘  │
│                      │
│  [+ Create New BB]   │
└──────────────────────┘
```

**Suggestions based on:**
- Schema compatibility (output matches input)
- Common cluster patterns
- Previous usage patterns

---

## Implementation Phases

### Phase 1: Foundation (2-3 weeks)
- [ ] Cluster data model (clusters table, BB membership)
- [ ] Cluster CRUD API endpoints
- [ ] Basic Cluster Dashboard (list view)

### Phase 2: Visual Composer (3-4 weeks)
- [ ] React Flow integration for editable cluster diagram
- [ ] Drag-drop BB addition
- [ ] Connection drawing with configurable triggers
- [ ] Connection configuration panel
- [ ] Persist cluster graph to database

### Phase 3: AI-Assisted Creation (2 weeks)
- [ ] Cluster description → suggested structure
- [ ] Internal BB for cluster generation
- [ ] Template system with preset patterns

### Phase 4: Execution & Monitoring (2-3 weeks)
- [ ] Cluster execution endpoint (runs all BBs in order)
- [ ] Real-time execution status on cluster diagram
- [ ] Data flow visualization between nodes
- [ ] Execution history for clusters

### Phase 5: Polish (1-2 weeks)
- [ ] Keyboard shortcuts for cluster editing
- [ ] Undo/redo for cluster changes
- [ ] Export cluster as BAL code
- [ ] Import BAL code to visual cluster

---

## Technical Considerations

### Data Model Changes
```sql
-- New table for clusters
CREATE TABLE clusters (
  id UUID PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Junction table for cluster membership
CREATE TABLE cluster_baleybots (
  cluster_id UUID REFERENCES clusters(id),
  baleybot_id UUID REFERENCES baleybots(id),
  position_x INT,  -- For visual layout
  position_y INT,
  PRIMARY KEY (cluster_id, baleybot_id)
);

-- Connections already exist as baleybotTriggers
-- Just add cluster_id foreign key
ALTER TABLE baleybot_triggers ADD COLUMN cluster_id UUID REFERENCES clusters(id);
```

### React Flow Integration
Current `ClusterDiagram.tsx` uses React Flow for read-only display. Extend it:
- Enable `nodesDraggable`, `edgesUpdatable`
- Add `onConnect` handler for new connections
- Add `onNodeDoubleClick` for editing BBs
- Custom edge component with delete button

### Syncing Visual ↔ BAL
Two approaches:
1. **Visual as source of truth**: Generate BAL from cluster diagram
2. **BAL as source of truth**: Parse BAL to render diagram

Recommend: **Visual as source of truth** for clusters, since:
- Clusters are inherently spatial/relational
- BAL can be generated on save/export
- Simpler mental model for users

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to create 3-BB cluster | ~10 min (manual BAL) | ~2 min (visual) |
| Users creating clusters | Unknown | 40% of active users |
| Cluster execution success rate | N/A | >90% |
| Support tickets re: chaining | Unknown | -50% |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Visual composer complexity | Start with simple linear chains, add parallel/conditional later |
| Performance with large clusters | Virtualize React Flow nodes, limit cluster size |
| Sync issues between visual/code | Make visual authoritative for clusters |
| User confusion (clusters vs single BBs) | Clear UI separation, onboarding tooltips |

---

## Conclusion

The proposed changes transform BaleyUI from a single-bot creation tool into a full cluster orchestration platform. The visual cluster composer is the centerpiece - enabling drag-and-drop composition that generates the underlying BAL code automatically.

Priority order:
1. **Cluster Dashboard** - See what clusters exist
2. **Visual Composer** - Build clusters without code
3. **Connection Configuration** - Control data flow visually
4. **Execution Monitoring** - See clusters run in real-time

This positions BaleyUI as the go-to platform for composing AI agent workflows, not just defining individual agents.
