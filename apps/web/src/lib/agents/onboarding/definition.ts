/**
 * Onboarding Agent Definition
 *
 * A specialized AI agent that guides new users through BaleyUI.
 * Demonstrates the agent-building capabilities while providing value.
 */

import { z } from 'zod';

// ============================================================================
// AGENT METADATA
// ============================================================================

export const onboardingAgentDefinition = {
  id: 'onboarding-agent',
  name: 'Onboarding Assistant',
  description: 'A friendly guide that helps new users understand BaleyUI and build their first agent',
  version: '1.0.0',
  type: 'ai' as const,

  // ============================================================================
  // SYSTEM PROMPT
  // ============================================================================

  systemPrompt: `You are the Onboarding Assistant for BaleyUI, an AI agent building platform.

Your role is to:
1. Welcome new users warmly and understand their goals
2. Explain core concepts clearly (agents, blocks, flows, tools)
3. Guide users through creating their first agent step-by-step
4. Provide helpful examples and best practices
5. Answer questions about the platform

Key concepts to explain:
- **Agents**: AI assistants with specific roles and capabilities
- **Blocks**: Reusable components (AI blocks, function blocks, routers)
- **Flows**: Compositions of blocks that work together
- **Tools**: Actions agents can take (search, analyze, generate)
- **Templates**: Pre-built output layouts (reports, dashboards)

Interaction style:
- Be conversational and encouraging
- Use simple language, avoid jargon
- Provide concrete examples
- Celebrate user progress
- Offer to demonstrate features
- Ask clarifying questions when needed

When users want to create their first agent:
1. Ask about their use case (what problem they want to solve)
2. Suggest appropriate tools and capabilities
3. Help them write a clear system prompt
4. Guide them through testing the agent
5. Celebrate their success!

Remember: Your goal is to make users feel confident and excited about building AI agents.`,

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  config: {
    model: 'claude-3-5-sonnet-20240620',
    temperature: 0.7,
    maxTokens: 2048,
  },

  // ============================================================================
  // TOOLS
  // ============================================================================

  tools: [
    {
      id: 'explain_concept',
      name: 'Explain Concept',
      description: 'Provide a detailed explanation of a platform concept',
      schema: z.object({
        concept: z.enum([
          'agents',
          'blocks',
          'flows',
          'tools',
          'templates',
          'events',
          'outputs',
        ]).describe('The concept to explain'),
        depth: z.enum(['brief', 'detailed', 'technical']).default('detailed')
          .describe('How detailed the explanation should be'),
      }),
    },
    {
      id: 'show_example',
      name: 'Show Example',
      description: 'Display an example of a platform feature',
      schema: z.object({
        feature: z.enum([
          'simple-agent',
          'chat-agent',
          'analysis-agent',
          'data-flow',
          'router-flow',
          'report-template',
          'dashboard-template',
        ]).describe('The feature to demonstrate'),
      }),
    },
    {
      id: 'start_tutorial',
      name: 'Start Tutorial',
      description: 'Begin an interactive tutorial',
      schema: z.object({
        tutorial: z.enum([
          'first-agent',
          'custom-tools',
          'flow-building',
          'output-templates',
        ]).describe('The tutorial to start'),
      }),
    },
    {
      id: 'check_progress',
      name: 'Check Progress',
      description: 'Check the user\'s onboarding progress',
      schema: z.object({}),
    },
    {
      id: 'create_sample_agent',
      name: 'Create Sample Agent',
      description: 'Create a pre-configured sample agent for the user',
      schema: z.object({
        template: z.enum([
          'simple-assistant',
          'research-analyst',
          'code-reviewer',
          'content-writer',
          'data-analyst',
        ]).describe('The agent template to use'),
        name: z.string().describe('Custom name for the agent'),
      }),
    },
    {
      id: 'provide_feedback',
      name: 'Provide Feedback',
      description: 'Give feedback on user-created content',
      schema: z.object({
        contentType: z.enum(['system-prompt', 'tool-definition', 'flow-design'])
          .describe('What type of content to review'),
        content: z.string().describe('The content to review'),
      }),
    },
  ],

  // ============================================================================
  // CONSTRAINTS
  // ============================================================================

  constraints: [
    'Always be encouraging and patient with new users',
    'Never make the user feel overwhelmed',
    'Break complex topics into digestible chunks',
    'Provide actionable next steps after explanations',
    'If unsure about a feature, be honest and offer to help find the answer',
  ],

  // ============================================================================
  // OUTPUT SCHEMA
  // ============================================================================

  outputSchema: z.object({
    message: z.string().describe('The response message to the user'),
    suggestions: z.array(z.string()).optional()
      .describe('Suggested next actions for the user'),
    progress: z.object({
      currentStep: z.string(),
      totalSteps: z.number(),
      completedSteps: z.array(z.string()),
    }).optional().describe('User\'s onboarding progress'),
    resources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      description: z.string(),
    })).optional().describe('Helpful resources related to the topic'),
  }),
};

// ============================================================================
// ONBOARDING STEPS
// ============================================================================

export const onboardingSteps = [
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Introduction to BaleyUI',
    isComplete: false,
  },
  {
    id: 'concepts',
    name: 'Core Concepts',
    description: 'Understanding agents, blocks, and flows',
    isComplete: false,
  },
  {
    id: 'first-agent',
    name: 'First Agent',
    description: 'Create your first AI agent',
    isComplete: false,
  },
  {
    id: 'add-tools',
    name: 'Add Tools',
    description: 'Give your agent capabilities',
    isComplete: false,
  },
  {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'Run and refine your agent',
    isComplete: false,
  },
  {
    id: 'explore',
    name: 'Explore',
    description: 'Discover advanced features',
    isComplete: false,
  },
];

// ============================================================================
// EXAMPLE PROMPTS
// ============================================================================

export const examplePrompts = [
  "What can I build with BaleyUI?",
  "Help me create my first agent",
  "Explain what blocks are",
  "Show me an example agent",
  "How do flows work?",
  "What tools can agents use?",
];

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type OnboardingAgentDefinition = typeof onboardingAgentDefinition;
export type OnboardingStep = typeof onboardingSteps[number];
