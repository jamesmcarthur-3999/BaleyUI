/**
 * Onboarding Agent Tools
 *
 * Implementations for the onboarding agent's capabilities.
 */

import { onboardingSteps } from './definition';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface OnboardingProgress {
  currentStep: string;
  totalSteps: number;
  completedSteps: string[];
  nextStep?: string;
}

// ============================================================================
// CONCEPT EXPLANATIONS
// ============================================================================

const conceptExplanations: Record<string, { brief: string; detailed: string; technical: string }> = {
  agents: {
    brief: 'AI assistants with specific roles and capabilities.',
    detailed: `Agents are AI assistants you create with specific purposes. Each agent has:
- A **system prompt** that defines its personality and behavior
- **Tools** that give it capabilities (search, analyze, generate)
- **Configuration** for model, temperature, and other settings
- An **output schema** that structures its responses

Think of agents as specialized team members - a research analyst, content writer, or code reviewer.`,
    technical: `Agents are implemented as configurable AI execution units. They consist of:
- SystemPrompt: Instruction set defining behavior and constraints
- Tools: Function definitions with Zod schemas for validation
- Config: Model selection, temperature, max tokens, stop sequences
- OutputSchema: Zod schema for structured response validation
- Constraints: Array of behavioral guardrails

Agents can be composed into flows for complex multi-step operations.`,
  },
  blocks: {
    brief: 'Reusable building blocks for your workflows.',
    detailed: `Blocks are the building blocks of BaleyUI. There are several types:
- **AI Blocks**: Contain an agent that processes inputs
- **Function Blocks**: Run code transformations
- **Router Blocks**: Direct flow based on conditions
- **Loop Blocks**: Repeat operations on collections
- **Parallel Blocks**: Run multiple operations simultaneously

Each block has inputs, outputs, and can be connected to form flows.`,
    technical: `Blocks are typed nodes in the execution graph with:
- id: Unique identifier
- type: 'ai' | 'function' | 'router' | 'loop' | 'parallel'
- inputSchema: Zod schema for input validation
- outputSchema: Zod schema for output validation
- execute(): Async function returning validated output
- handles: Connection points for flow edges`,
  },
  flows: {
    brief: 'Compositions of blocks that work together.',
    detailed: `Flows connect multiple blocks to accomplish complex tasks. Features:
- **Visual canvas** for drag-and-drop block placement
- **Smart routing** with conditional paths
- **Real-time execution** with live status updates
- **Event streaming** to watch AI build in real-time

Example: A research flow might connect a web search block → analysis block → report generation block.`,
    technical: `Flows are directed acyclic graphs (DAGs) with:
- nodes: Array of Block references with positions
- edges: Connections between block handles
- Topological execution order
- Event sourcing for undo/redo and time-travel
- SSE streaming for real-time UI updates`,
  },
  tools: {
    brief: 'Actions that agents can perform.',
    detailed: `Tools give agents capabilities to interact with the world:
- **Built-in tools**: Web search, file operations, calculations
- **Custom tools**: Define your own with JavaScript/TypeScript
- **Generated tools**: AI can help create tool definitions

Each tool has a name, description, and schema that defines its parameters.`,
    technical: `Tools follow the Vercel AI SDK pattern:
- name: Unique identifier
- description: Used for tool selection prompting
- parameters: Zod schema for input validation
- execute: Async function returning tool result

Tools are registered per-agent and can be dynamically enabled/disabled.`,
  },
  templates: {
    brief: 'Pre-built layouts for agent outputs.',
    detailed: `Templates structure how agent outputs are displayed:
- **Report Template**: Text + charts + recommendations
- **Dashboard Template**: Live metrics + alerts grid
- **Data Table Template**: Sortable, filterable tables

Each template has sections that map to output components like charts, metrics, and insights.`,
    technical: `Templates define LayoutConfig with:
- type: 'stack' | 'grid' | 'split' | 'tabs'
- sections: Array of LayoutSection with componentType
- Components: MetricCard, ChartCard, InsightCard, DataTable
- Schema: Zod validation for template-specific data`,
  },
  events: {
    brief: 'Real-time updates as AI works.',
    detailed: `Events let you watch AI build in real-time:
- **Block events**: When agents start, complete, or error
- **Flow events**: Overall execution progress
- **UI updates**: Live rendering of outputs

This enables the "watch AI build" experience where you see results as they're generated.`,
    technical: `Event sourcing architecture with:
- BuilderEvent: id, timestamp, actor, type, data
- Event store: PostgreSQL with sequence ordering
- SSE streaming: /api/events/[workspaceId]
- React hook: useBuilderEvents for subscriptions
- Actors: user | ai-agent | system`,
  },
  outputs: {
    brief: 'Structured results from agent work.',
    detailed: `Outputs are the structured results agents produce:
- **Charts**: Line, bar, pie, and other visualizations
- **Metrics**: KPIs with trend indicators
- **Insights**: Key findings with severity levels
- **Tables**: Data with sorting and filtering
- **Actions**: Recommendations with clickable buttons

The AI uses tools like emit_chart and emit_metric to build outputs.`,
    technical: `OutputArtifact structure:
- id, type, title, description
- createdBy: { type: 'user' | 'ai-agent', id, name }
- layout: LayoutConfig defining section arrangement
- data: OutputData with charts, metrics, insights, etc.
- metadata: executionId, blockId, flowId, version`,
  },
};

// ============================================================================
// FEATURE EXAMPLES
// ============================================================================

const featureExamples: Record<string, { title: string; description: string; code?: string }> = {
  'simple-agent': {
    title: 'Simple Assistant Agent',
    description: 'A basic agent that answers questions helpfully.',
    code: `{
  name: "Simple Assistant",
  systemPrompt: "You are a helpful assistant. Answer questions clearly and concisely.",
  tools: [],
  config: { temperature: 0.7 }
}`,
  },
  'chat-agent': {
    title: 'Conversational Chat Agent',
    description: 'An agent optimized for natural conversation.',
    code: `{
  name: "Chat Companion",
  systemPrompt: "You are a friendly conversational partner. Engage naturally, ask follow-up questions, and remember context from earlier in the conversation.",
  tools: ["web_search", "remember"],
  config: { temperature: 0.8, maxTokens: 1024 }
}`,
  },
  'analysis-agent': {
    title: 'Data Analysis Agent',
    description: 'An agent that analyzes data and produces insights.',
    code: `{
  name: "Data Analyst",
  systemPrompt: "You are an expert data analyst. Analyze provided data, identify patterns, and generate actionable insights. Present findings clearly with supporting evidence.",
  tools: ["emit_chart", "emit_metric", "emit_insight"],
  config: { temperature: 0.3 }
}`,
  },
  'data-flow': {
    title: 'Data Processing Flow',
    description: 'A flow that processes data through multiple stages.',
  },
  'router-flow': {
    title: 'Conditional Routing Flow',
    description: 'A flow that routes inputs based on conditions.',
  },
  'report-template': {
    title: 'Report Output Template',
    description: 'Structured report with metrics, charts, and recommendations.',
  },
  'dashboard-template': {
    title: 'Dashboard Output Template',
    description: 'Live monitoring dashboard with KPIs and alerts.',
  },
};

// ============================================================================
// TUTORIAL CONTENT
// ============================================================================

const tutorials: Record<string, { title: string; steps: string[] }> = {
  'first-agent': {
    title: 'Create Your First Agent',
    steps: [
      'Choose a purpose for your agent (e.g., research assistant, content writer)',
      'Write a clear system prompt describing the agent\'s role and behavior',
      'Select any tools the agent needs (you can start with none)',
      'Configure the model settings (defaults work great to start)',
      'Test the agent with sample inputs',
      'Refine based on results',
    ],
  },
  'custom-tools': {
    title: 'Create Custom Tools',
    steps: [
      'Define what action the tool should perform',
      'Create a Zod schema for the tool\'s parameters',
      'Write the tool\'s execute function',
      'Add the tool to your agent',
      'Test the tool with different inputs',
    ],
  },
  'flow-building': {
    title: 'Build Your First Flow',
    steps: [
      'Open the Flow Canvas',
      'Drag blocks from the palette onto the canvas',
      'Connect blocks by dragging between handles',
      'Configure each block\'s settings',
      'Run the flow and observe real-time updates',
      'Iterate on the design based on results',
    ],
  },
  'output-templates': {
    title: 'Use Output Templates',
    steps: [
      'Choose a template type (report, dashboard, etc.)',
      'Add output tools to your agent (emit_chart, emit_metric)',
      'Run the agent with your data',
      'View the structured output in the template',
      'Customize the layout if needed',
    ],
  },
};

// ============================================================================
// SAMPLE AGENT TEMPLATES
// ============================================================================

const agentTemplates: Record<string, object> = {
  'simple-assistant': {
    name: 'Simple Assistant',
    type: 'ai',
    systemPrompt: 'You are a helpful assistant. Answer questions clearly and accurately.',
    tools: [],
    config: { temperature: 0.7 },
  },
  'research-analyst': {
    name: 'Research Analyst',
    type: 'ai',
    systemPrompt: 'You are a research analyst. Search for information, analyze findings, and provide well-sourced answers.',
    tools: ['web_search', 'emit_insight'],
    config: { temperature: 0.5 },
  },
  'code-reviewer': {
    name: 'Code Reviewer',
    type: 'ai',
    systemPrompt: 'You are an expert code reviewer. Analyze code for bugs, security issues, and best practices. Provide constructive feedback.',
    tools: ['analyze_code', 'emit_insight'],
    config: { temperature: 0.3 },
  },
  'content-writer': {
    name: 'Content Writer',
    type: 'ai',
    systemPrompt: 'You are a skilled content writer. Create engaging, well-structured content tailored to the audience.',
    tools: ['web_search'],
    config: { temperature: 0.8 },
  },
  'data-analyst': {
    name: 'Data Analyst',
    type: 'ai',
    systemPrompt: 'You are a data analyst. Analyze data, identify patterns, and visualize insights with charts and metrics.',
    tools: ['emit_chart', 'emit_metric', 'emit_insight', 'emit_table'],
    config: { temperature: 0.4 },
  },
};

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Explain a platform concept
 */
export function explainConcept(
  concept: string,
  depth: 'brief' | 'detailed' | 'technical' = 'detailed'
): ToolResult<{ explanation: string; relatedConcepts: string[] }> {
  const explanation = conceptExplanations[concept];

  if (!explanation) {
    return {
      success: false,
      error: `Unknown concept: ${concept}`,
    };
  }

  const relatedConcepts = Object.keys(conceptExplanations).filter(
    (c) => c !== concept
  );

  return {
    success: true,
    data: {
      explanation: explanation[depth],
      relatedConcepts: relatedConcepts.slice(0, 3),
    },
  };
}

/**
 * Show an example of a feature
 */
export function showExample(
  feature: string
): ToolResult<{ title: string; description: string; code?: string }> {
  const example = featureExamples[feature];

  if (!example) {
    return {
      success: false,
      error: `Unknown feature: ${feature}`,
    };
  }

  return {
    success: true,
    data: example,
  };
}

/**
 * Start an interactive tutorial
 */
export function startTutorial(
  tutorial: string
): ToolResult<{ title: string; steps: string[]; currentStep: number }> {
  const content = tutorials[tutorial];

  if (!content) {
    return {
      success: false,
      error: `Unknown tutorial: ${tutorial}`,
    };
  }

  return {
    success: true,
    data: {
      title: content.title,
      steps: content.steps,
      currentStep: 0,
    },
  };
}

/**
 * Check user's onboarding progress
 */
export function checkProgress(
  completedStepIds: string[] = []
): ToolResult<OnboardingProgress> {
  const completedSteps = onboardingSteps
    .filter((s) => completedStepIds.includes(s.id))
    .map((s) => s.id);

  const lastStep = onboardingSteps[onboardingSteps.length - 1];
  const currentStep =
    onboardingSteps.find((s) => !completedStepIds.includes(s.id))?.id ||
    lastStep?.id ||
    'welcome';

  const currentIndex = onboardingSteps.findIndex((s) => s.id === currentStep);
  const nextStep = onboardingSteps[currentIndex + 1]?.id;

  return {
    success: true,
    data: {
      currentStep,
      totalSteps: onboardingSteps.length,
      completedSteps,
      nextStep,
    },
  };
}

/**
 * Create a sample agent from template
 */
export function createSampleAgent(
  template: string,
  customName?: string
): ToolResult<{ agent: object; message: string }> {
  const agentTemplate = agentTemplates[template];

  if (!agentTemplate) {
    return {
      success: false,
      error: `Unknown template: ${template}`,
    };
  }

  const agent = {
    ...agentTemplate,
    name: customName || (agentTemplate as { name: string }).name,
    id: `agent-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    data: {
      agent,
      message: `Created "${agent.name}" agent from ${template} template!`,
    },
  };
}

/**
 * Provide feedback on user content
 */
export function provideFeedback(
  contentType: 'system-prompt' | 'tool-definition' | 'flow-design',
  content: string
): ToolResult<{ feedback: string[]; score: number; suggestions: string[] }> {
  // Simple feedback logic - in production this would be more sophisticated
  const feedback: string[] = [];
  const suggestions: string[] = [];
  let score = 70;

  if (contentType === 'system-prompt') {
    if (content.length < 50) {
      feedback.push('Your system prompt is quite short. Consider adding more detail about the agent\'s role.');
      suggestions.push('Describe the agent\'s personality and tone');
      score -= 10;
    }
    if (content.length > 50) {
      feedback.push('Good length for a system prompt!');
      score += 10;
    }
    if (content.toLowerCase().includes('you are')) {
      feedback.push('Great start with "You are" - this helps establish the agent\'s identity.');
      score += 5;
    }
    if (!content.includes('.')) {
      feedback.push('Consider adding complete sentences with clear instructions.');
      suggestions.push('Use periods to separate distinct instructions');
    }
  }

  return {
    success: true,
    data: {
      feedback,
      score: Math.min(100, Math.max(0, score)),
      suggestions,
    },
  };
}
