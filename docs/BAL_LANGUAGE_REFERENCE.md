# BAL (Baleybots Assembly Language) Reference

BAL is a domain-specific language for creating AI pipelines and composable agent workflows. This reference covers the complete syntax and features.

## Quick Start

Create your first BaleyBot in under a minute:

```bal
# Define an entity
assistant {
  "goal": "Help users answer questions about programming"
}

# Run it
run("What is a closure in JavaScript?")
```

## Table of Contents

1. [Entity Definitions](#entity-definitions)
2. [Entity Properties](#entity-properties)
3. [Type System](#type-system)
4. [Compositions](#compositions)
5. [Variables & Data Flow](#variables--data-flow)
6. [Transformations](#transformations)
7. [Conditions](#conditions)
8. [Comments](#comments)
9. [Best Practices](#best-practices)
10. [Error Reference](#error-reference)

---

## Entity Definitions

Entities are the building blocks of BAL. Each entity represents an AI agent with a specific goal.

### Basic Syntax

```bal
entity_name {
  "goal": "Description of what this entity should do"
}
```

### Rules

- Entity names must start with a letter or underscore
- Names can contain letters, numbers, and underscores
- Names are case-sensitive
- Define entities BEFORE using them in compositions

### Examples

```bal
# Simple entity
analyzer {
  "goal": "Analyze the sentiment of the input text"
}

# Entity with multiple properties
writer {
  "goal": "Write a professional summary based on the analysis",
  "model": "anthropic:claude-sonnet-4-20250514",
  "output": {
    "summary": "string",
    "word_count": "number"
  }
}
```

---

## Entity Properties

### goal (required)

The instruction telling the entity what to do.

```bal
helper {
  "goal": "Answer questions about our product documentation"
}
```

### model (optional)

Specify which AI model to use.

```bal
coder {
  "goal": "Write Python code",
  "model": "openai:gpt-4.1"
}
```

**Available models:**
- `anthropic:claude-sonnet-4-20250514` (default)
- `anthropic:claude-3-5-haiku-20241022`
- `openai:gpt-4.1`
- `openai:gpt-4.1-mini`

### tools (optional)

List of tools the entity can use.

```bal
researcher {
  "goal": "Research the given topic",
  "tools": ["web_search", "fetch_url"]
}
```

**Built-in tools:**
- `web_search` - Search the web
- `fetch_url` - Fetch content from a URL
- `spawn_baleybot` - Execute another BaleyBot
- `send_notification` - Notify the user
- `store_memory` - Persist key-value data
- `schedule_task` - Schedule future execution (requires approval)
- `create_agent` - Create ephemeral agent (requires approval)
- `create_tool` - Create ephemeral tool (requires approval)

### output (optional)

Define the expected output schema for structured responses.

```bal
classifier {
  "goal": "Classify the input text",
  "output": {
    "category": "enum('tech', 'business', 'lifestyle')",
    "confidence": "number(0, 1)"
  }
}
```

### maxTokens (optional)

Limit the response length.

```bal
summarizer {
  "goal": "Summarize the article",
  "maxTokens": 500
}
```

### history (optional)

Control conversation history inheritance.

```bal
fresh_start {
  "goal": "Process without prior context",
  "history": "none"
}
```

**Values:**
- `"inherit"` (default) - Receive conversation history from parent
- `"none"` - Start fresh, no history

---

## Type System

BAL supports rich type specifications for output schemas.

### Basic Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"name": "string"` |
| `number` | Numeric value | `"count": "number"` |
| `boolean` | True/false | `"active": "boolean"` |

### Enum Type

Restrict to specific values:

```bal
"status": "enum('pending', 'complete', 'failed')"
"mood": "enum('positive', 'negative', 'neutral')"
```

### Number with Range

Constrain numeric values:

```bal
"score": "number(0, 100)"           # Min and max
"confidence": "number(min: 0, max: 1)"  # Named parameters
"price": "number(0)"                # Min only
```

### Array Type

List of elements:

```bal
"tags": "array<string>"
"scores": "array<number>"
"items": "array<object { id: string, name: string }>"
```

### Object Type

Nested structures:

```bal
"user": "object { name: string, email: string }"
"address": "object { street: string, city: string, zip: number }"
```

### Optional Type

Fields that may be absent:

```bal
"nickname": "?string"
"metadata": "?object { source: string }"
```

### Complex Nested Types

Combine types for rich schemas:

```bal
"output": {
  "results": "array<object {
    id: string,
    score: number(0, 1),
    tags: ?array<string>
  }>",
  "summary": "?string",
  "status": "enum('success', 'partial', 'failed')"
}
```

---

## Compositions

Compose entities into pipelines.

### chain

Execute entities sequentially. Each step receives the output of the previous step.

```bal
analyzer { "goal": "Analyze the data" }
writer { "goal": "Write based on analysis" }
reviewer { "goal": "Review the writing" }

chain {
  analyzer
  writer
  reviewer
}
```

### parallel

Execute entities concurrently. Results are merged as `branch_0`, `branch_1`, etc.

```bal
sentiment { "goal": "Analyze sentiment" }
keywords { "goal": "Extract keywords" }
topics { "goal": "Identify topics" }

parallel {
  sentiment
  keywords
  topics
}
```

### if / else

Conditional branching based on previous results.

```bal
if ("result.score > 0.8") {
  success_handler
} else {
  failure_handler
}
```

### loop

Iterate until a condition is met or max iterations reached.

```bal
loop ("until": "result.quality > 0.9", "max": 5) {
  improver
}
```

### Nested Compositions

Combine composition types:

```bal
chain {
  analyzer
  parallel {
    sentiment
    keywords
  }
  if ("branch_0.score > 0.5") {
    positive_handler
  } else {
    negative_handler
  }
}
```

---

## Variables & Data Flow

### Variable Capture (=>)

Capture entity output for later use:

```bal
chain {
  researcher => research
  writer with { findings: $research.findings }
}
```

### Using Variables

Reference captured variables with `$`:

```bal
$research           # Full captured output
$research.findings  # Nested field
$analysis.items[0]  # Array access
```

### with Clause

Pass additional context to an entity:

```bal
writer with {
  topic: $research.topic,
  style: "professional",
  maxLength: 500
}
```

---

## Transformations

### select

Reshape data from previous results:

```bal
select {
  score: result.sentiment.score,
  keywords: result.keywords.items
}
```

### merge

Combine parallel branch results:

```bal
parallel {
  sentiment
  keywords
}
merge {
  mood: "branch_0.sentiment",
  tags: "branch_1.keywords"
}
```

### map

Process each item in an array:

```bal
map result.items {
  item_processor
}
```

---

## Conditions

Conditions are used in `if` and `loop` statements.

### Comparison Operators

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |

### Logical Operators

| Operator | Description |
|----------|-------------|
| `&&` | And |
| `\|\|` | Or |
| `!` | Not |

### Examples

```bal
# Simple comparison
if ("result.score > 0.8") { ... }

# Combined conditions
if ("result.score > 0.5 && result.confidence > 0.7") { ... }

# Using variables
if ("$analysis.complete == true") { ... }

# Negation
if ("!result.hasErrors") { ... }
```

---

## Comments

```bal
# This is a single-line comment

analyzer {
  "goal": "Process data"  # Inline comment
}

// This style also works
```

---

## Best Practices

### 1. Define Clear Goals

Be specific about what each entity should accomplish:

```bal
# Good
sentiment_analyzer {
  "goal": "Analyze the emotional tone of the text and return a score from -1 (negative) to 1 (positive)"
}

# Less clear
analyzer {
  "goal": "Analyze text"
}
```

### 2. Use Output Schemas

Define schemas for structured, predictable outputs:

```bal
extractor {
  "goal": "Extract entities from text",
  "output": {
    "people": "array<string>",
    "organizations": "array<string>",
    "locations": "array<string>"
  }
}
```

### 3. Chain Logically

Ensure data flows naturally between entities:

```bal
# Good flow
chain {
  researcher => research           # Get data
  analyzer with { data: $research }  # Process it
  summarizer with { analysis: result }  # Summarize
}
```

### 4. Handle Errors

Use conditions to handle potential failures:

```bal
chain {
  processor
  if ("result.success") {
    success_handler
  } else {
    error_handler
  }
}
```

### 5. Limit Loop Iterations

Always set a maximum for loops:

```bal
loop ("until": "result.done", "max": 10) {
  refiner
}
```

---

## Error Reference

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Expected entity definition` | Using entity before defining | Define all entities at the top |
| `Unknown entity 'name'` | Referencing undefined entity | Check spelling, ensure entity is defined |
| `Expected {` | Missing brace after entity name | Add opening brace |
| `Expected "goal"` | Missing required goal property | Add `"goal": "..."` |
| `Unterminated string` | Missing closing quote | Add closing `"` |
| `Invalid type specification` | Malformed type in output | Check type syntax |

### Validation Warnings

| Warning | Description |
|---------|-------------|
| `No output schema defined` | Entity has no output schema - consider adding one |
| `Unused variable` | Captured variable not referenced |
| `Chain type mismatch` | Producer output may not match consumer expectations |

---

## Complete Examples

### Research Pipeline

```bal
researcher {
  "goal": "Research the topic thoroughly using web search",
  "tools": ["web_search", "fetch_url"],
  "output": {
    "findings": "array<string>",
    "sources": "array<string>"
  }
}

writer {
  "goal": "Write a comprehensive article based on research findings",
  "output": {
    "title": "string",
    "content": "string",
    "word_count": "number"
  }
}

editor {
  "goal": "Review and improve the article for clarity and accuracy",
  "output": {
    "revised_content": "string",
    "improvements": "array<string>",
    "quality_score": "number(0, 10)"
  }
}

chain {
  researcher => research
  writer with { findings: $research.findings, sources: $research.sources }
  loop ("until": "result.quality_score > 8", "max": 3) {
    editor
    writer with { feedback: result.improvements }
  }
}

run("Latest developments in renewable energy")
```

### Multi-Analysis Pipeline

```bal
sentiment {
  "goal": "Analyze emotional sentiment",
  "output": { "score": "number(-1, 1)", "label": "enum('positive', 'negative', 'neutral')" }
}

keywords {
  "goal": "Extract key topics and themes",
  "output": { "topics": "array<string>", "importance": "array<number(0, 1)>" }
}

summarizer {
  "goal": "Create executive summary combining all analyses",
  "output": { "summary": "string", "key_points": "array<string>" }
}

chain {
  parallel {
    sentiment
    keywords
  }
  merge {
    mood: "branch_0",
    topics: "branch_1"
  }
  summarizer with { analysis: result }
}

run("The quarterly earnings exceeded expectations...")
```

### Conditional Workflow

```bal
classifier {
  "goal": "Classify the customer inquiry type",
  "output": { "type": "enum('sales', 'support', 'billing', 'other')" }
}

sales_handler { "goal": "Handle sales inquiries professionally" }
support_handler { "goal": "Provide technical support assistance" }
billing_handler { "goal": "Address billing questions" }
general_handler { "goal": "Handle general inquiries" }

chain {
  classifier => classification
  if ("$classification.type == 'sales'") {
    sales_handler
  } else {
    if ("$classification.type == 'support'") {
      support_handler
    } else {
      if ("$classification.type == 'billing'") {
        billing_handler
      } else {
        general_handler
      }
    }
  }
}
```

---

## See Also

- [BAL Type System](./BAL_TYPE_SYSTEM.md) - Detailed type specification reference
- [Built-in Tools Reference](../CLAUDE.md#built-in-tools-reference) - Complete tool documentation
- [Developer Guide](./DEVELOPER_GUIDE.md) - Integration and API documentation
