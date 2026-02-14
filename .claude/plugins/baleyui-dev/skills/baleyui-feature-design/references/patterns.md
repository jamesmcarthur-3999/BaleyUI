# AI-First Design Patterns — Before & After Examples

Real BaleyUI patterns showing the transformation from traditional software design to AI-first design.

---

## 1. Review System for BaleyBot Outputs

### Feature Request
"Users need to review BaleyBot execution outputs, see what went wrong, and get improvement suggestions."

### Wrong Approach: Hard-coded review form

```typescript
// ❌ Traditional: Static review form with manual analysis
function ExecutionReviewPage({ executionId }) {
  const execution = useExecution(executionId);

  return (
    <div>
      <h2>Review Execution</h2>
      <div>Input: {JSON.stringify(execution.input)}</div>
      <div>Output: {JSON.stringify(execution.output)}</div>

      {/* Hard-coded quality checks */}
      {execution.durationMs > 5000 && <Alert>Slow execution</Alert>}
      {execution.tokensUsed > 10000 && <Alert>High token usage</Alert>}
      {execution.error && <Alert>Execution failed</Alert>}

      {/* Manual improvement form */}
      <form onSubmit={handleSubmitFeedback}>
        <select name="quality">
          <option value="good">Good</option>
          <option value="needs-improvement">Needs Improvement</option>
          <option value="bad">Bad</option>
        </select>
        <textarea name="notes" placeholder="What should change?" />
        <button type="submit">Submit Review</button>
      </form>
    </div>
  );
}
```

### Right Approach: execution_reviewer BaleyBot + diff UI

```bal
# execution_reviewer analyzes intelligently
execution_reviewer {
  "goal": "Review this BaleyBot execution. Analyze the output quality,
           identify issues, suggest specific improvements to the BAL code
           or goal. Compare against the intended purpose.",
  "model": "anthropic:powerful",
  "output": {
    "qualityScore": "number(0, 10)",
    "issues": "array<object>",
    "suggestions": "array<object>",
    "improvedGoal": "string",
    "summary": "string"
  }
}
```

```typescript
// ✅ AI-first: BB does the analysis, UI shows the result
function ExecutionReviewPage({ executionId }) {
  const execution = useExecution(executionId);
  const review = useInternalBB('execution_reviewer', {
    input: formatExecutionForReview(execution)
  });

  return (
    <div>
      <ReviewSummary score={review.qualityScore} summary={review.summary} />
      <IssuesList issues={review.issues} />
      <SuggestionCards suggestions={review.suggestions} onApply={handleApply} />
      {review.improvedGoal && (
        <DiffView original={execution.goal} improved={review.improvedGoal} />
      )}
    </div>
  );
}
```

### Why It's Better
- The BB understands context (what the BB was supposed to do vs what it did)
- Suggestions are specific and actionable, not generic checkboxes
- The review adapts to different BB types (data analysis, content generation, routing)
- Pattern_learner can learn from reviews to proactively improve future BBs

---

## 2. Onboarding / BaleyBot Creation Flow

### Feature Request
"New users need a guided flow to create their first BaleyBot."

### Wrong Approach: Multi-step wizard

```typescript
// ❌ Traditional: Rigid step-by-step wizard
const STEPS = [
  { id: 'name', component: NameStep },
  { id: 'goal', component: GoalStep },
  { id: 'model', component: ModelStep },
  { id: 'tools', component: ToolsStep },
  { id: 'output', component: OutputSchemaStep },
  { id: 'review', component: ReviewStep },
];

function CreateBBWizard() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({});

  return (
    <WizardLayout
      steps={STEPS}
      currentStep={step}
      onNext={() => setStep(s => s + 1)}
      onBack={() => setStep(s => s - 1)}
    >
      <CurrentStepComponent
        data={formData}
        onChange={setFormData}
      />
    </WizardLayout>
  );
}
```

### Right Approach: baley converses adaptively

```bal
# baley already handles this — it's an internal BB
baley {
  "goal": "Help the user create a new BaleyBot. Understand what they want
           to accomplish, ask clarifying questions, then delegate to
           specialist bots for BAL generation, connection checks, and testing.",
  "model": "anthropic:powerful",
  "tools": { "spawn_baleybot", "store_memory" }
}

# The creator delegates to specialists:
# spawn_baleybot('bal_generator', designSpec)
# spawn_baleybot('connection_advisor', requirements)
# spawn_baleybot('test_orchestrator', testPlan)
```

```typescript
// ✅ AI-first: Conversational creation
function CreateBBPage() {
  return (
    <CreatorChat
      botName="baley"
      initialMessage="What would you like your BaleyBot to do?"
      onBotCreated={handleNavigateToBB}
    />
  );
}
```

### Why It's Better
- Adapts to user expertise (asks fewer questions for experienced users)
- Handles edge cases naturally ("I want it to query my database" → connection_advisor checks)
- Can create complex multi-entity BAL programs without a form for each entity
- The conversation IS the documentation of intent

---

## 3. Smart Notifications

### Feature Request
"Users should get notified about important events — execution failures, pattern discoveries, scheduled task completions."

### Wrong Approach: Preference page + cron job

```typescript
// ❌ Traditional: Static notification preferences
const NOTIFICATION_TYPES = [
  'execution_failure',
  'pattern_discovered',
  'schedule_completed',
  'cost_threshold',
  'test_failure',
];

function NotificationPreferences() {
  return (
    <form>
      {NOTIFICATION_TYPES.map(type => (
        <label key={type}>
          <input type="checkbox" name={type} />
          {formatNotificationType(type)}
          <select name={`${type}_channel`}>
            <option value="in-app">In-App</option>
            <option value="email">Email</option>
          </select>
        </label>
      ))}
      <TimezonePicker />
      <QuietHoursSelector />
    </form>
  );
}

// Cron job checks conditions on fixed schedule
// GET /api/cron/check-notifications
```

### Right Approach: BaleyBot + schedule_task + pattern_learner

```bal
notification_manager {
  "goal": "Monitor workspace activity and notify the user about important
           events. Learn from user responses to adjust notification frequency
           and importance thresholds. Batch low-priority items.",
  "model": "anthropic:powerful",
  "tools": { "send_notification", "schedule_task", "store_memory", "spawn_baleybot" },
  "output": {
    "notifications": "array<object>",
    "nextCheckIn": "string",
    "adjustments": "array<object>"
  }
}

# Pattern learner observes which notifications users act on
chain {
  notification_manager => notifications
  gate("notifications.adjustments.length > 0") {
    pattern_learner with { data: $notifications.adjustments }
  }
}
```

### Why It's Better
- Learns what matters to each user (dismisses = less important, clicks = more important)
- Batches intelligently (3 minor issues → 1 summary notification)
- Adjusts timing based on patterns (user active at 9am → send morning digest)
- New event types don't require code changes — the BB reasons about importance

---

## 4. Error Resolution

### Feature Request
"When a BaleyBot execution fails, help the user understand why and fix it."

### Wrong Approach: Error list + manual forms

```typescript
// ❌ Traditional: Static error display with manual resolution
function ErrorDashboard() {
  const errors = useRecentErrors();

  return (
    <table>
      {errors.map(error => (
        <tr key={error.id}>
          <td>{error.botName}</td>
          <td>{error.message}</td>
          <td>{error.timestamp}</td>
          <td>
            <select onChange={e => handleResolve(error.id, e.target.value)}>
              <option value="">Select action...</option>
              <option value="retry">Retry</option>
              <option value="edit-goal">Edit Goal</option>
              <option value="change-model">Change Model</option>
              <option value="add-tool">Add Tool</option>
              <option value="ignore">Ignore</option>
            </select>
          </td>
        </tr>
      ))}
    </table>
  );
}
```

### Right Approach: execution_reviewer + Actions Hub

```bal
# Chain: analyze -> classify -> resolve
chain {
  execution_reviewer => analysis

  route(analysis.errorCategory) {
    "bal_syntax": bal_generator with {
      fix: $analysis.suggestedFix,
      originalCode: $analysis.balCode
    },
    "missing_connection": connection_advisor with {
      needed: $analysis.requiredConnection
    },
    "model_limitation": chain {
      # Try a more capable model
      gate("analysis.canUpgradeModel") {
        processor("suggest") { $analysis.alternativeModel }
      }
    },
    "tool_error": tool_executor with {
      diagnose: $analysis.toolError
    }
  }
}
```

```typescript
// ✅ AI-first: BB analyzes, UI shows actionable results
function ErrorResolution({ executionId }) {
  const analysis = useInternalBB('execution_reviewer', { executionId });

  return (
    <div>
      <ErrorAnalysis analysis={analysis} />
      <ProposedFix fix={analysis.suggestedFix} />
      <ActionButton
        label="Apply Fix"
        onClick={() => applyFix(analysis)}
      />
    </div>
  );
}
```

### Why It's Better
- Root cause analysis, not just error message display
- Specific fix proposals based on understanding the BB's intent
- Automatic categorization routes to the right specialist BB
- Fixes can be applied with one click, not manual form filling

---

## 5. Content Moderation / Quality Gate

### Feature Request
"Before a BaleyBot goes live, verify its outputs meet quality standards."

### Wrong Approach: Rule-based scanner

```typescript
// ❌ Traditional: Hard-coded quality rules
function checkQuality(output: unknown): QualityResult {
  const issues = [];

  if (typeof output === 'string' && output.length < 10) {
    issues.push({ rule: 'min-length', message: 'Output too short' });
  }
  if (typeof output === 'string' && output.includes('TODO')) {
    issues.push({ rule: 'no-todos', message: 'Contains TODO markers' });
  }
  if (containsPII(output)) {
    issues.push({ rule: 'no-pii', message: 'Contains personal information' });
  }
  // ... 50 more rules ...

  return { passed: issues.length === 0, issues };
}
```

### Right Approach: BAL chain with route() and gate()

```bal
quality_classifier {
  "goal": "Classify the type and sensitivity level of this BaleyBot output",
  "output": {
    "contentType": "enum('text', 'code', 'data', 'mixed')",
    "sensitivityLevel": "enum('public', 'internal', 'sensitive')",
    "requiresReview": "boolean"
  }
}

quality_reviewer {
  "goal": "Review this output for quality, accuracy, and safety.
           Consider the BaleyBot's stated goal and whether the output
           achieves it appropriately.",
  "output": {
    "qualityScore": "number(0, 10)",
    "issues": "array<object>",
    "approved": "boolean",
    "feedback": "string"
  }
}

chain {
  quality_classifier => classification
  route(classification.contentType) {
    "code": code_reviewer,
    "data": data_validator,
    "text": quality_reviewer,
    "mixed": parallel { code_reviewer quality_reviewer }
  }
  gate("classification.requiresReview") {
    # Human review only when BB flags it
    processor("flag") { "needs_human_review" }
  }
}
```

### Why It's Better
- Understands context (code quality vs prose quality vs data validity)
- Adapts to new content types without code changes
- Only escalates to humans when genuinely needed (gate + BB judgment)
- Can learn from human overrides via pattern_learner

---

## Key Takeaway

In every example above, the transformation follows the same pattern:

1. **Before:** Logic lives in code (if/else, switch, hardcoded rules)
2. **After:** Logic lives in BaleyBots (goals, compositions, tools)
3. **Code becomes infrastructure:** DB, API, UI scaffolding
4. **Intelligence becomes BaleyBot-native:** Reasoning, classification, suggestion, adaptation
