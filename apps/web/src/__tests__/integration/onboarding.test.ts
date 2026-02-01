/**
 * Onboarding System Integration Tests
 *
 * Tests the onboarding agent, tools, and progress tracking.
 */

import { describe, it, expect } from 'vitest';
import {
  onboardingAgentDefinition,
  onboardingSteps,
  examplePrompts,
  explainConcept,
  showExample,
  startTutorial,
  checkProgress,
  createSampleAgent,
  provideFeedback,
} from '@/lib/agents/onboarding';

// ============================================================================
// AGENT DEFINITION TESTS
// ============================================================================

describe('Onboarding Agent Definition', () => {
  it('has required fields', () => {
    expect(onboardingAgentDefinition.id).toBe('onboarding-agent');
    expect(onboardingAgentDefinition.name).toBe('Onboarding Assistant');
    expect(onboardingAgentDefinition.type).toBe('ai');
    expect(onboardingAgentDefinition.systemPrompt).toBeDefined();
    expect(onboardingAgentDefinition.systemPrompt.length).toBeGreaterThan(100);
  });

  it('has defined tools', () => {
    expect(onboardingAgentDefinition.tools).toBeDefined();
    expect(onboardingAgentDefinition.tools.length).toBeGreaterThan(0);

    const toolIds = onboardingAgentDefinition.tools.map((t) => t.id);
    expect(toolIds).toContain('explain_concept');
    expect(toolIds).toContain('show_example');
    expect(toolIds).toContain('start_tutorial');
  });

  it('has constraints', () => {
    expect(onboardingAgentDefinition.constraints).toBeDefined();
    expect(onboardingAgentDefinition.constraints.length).toBeGreaterThan(0);
  });

  it('has output schema', () => {
    expect(onboardingAgentDefinition.outputSchema).toBeDefined();
  });
});

// ============================================================================
// ONBOARDING STEPS TESTS
// ============================================================================

describe('Onboarding Steps', () => {
  it('has all required steps', () => {
    expect(onboardingSteps.length).toBeGreaterThanOrEqual(6);

    const stepIds = onboardingSteps.map((s) => s.id);
    expect(stepIds).toContain('welcome');
    expect(stepIds).toContain('concepts');
    expect(stepIds).toContain('first-agent');
  });

  it('each step has required fields', () => {
    onboardingSteps.forEach((step) => {
      expect(step.id).toBeDefined();
      expect(step.name).toBeDefined();
      expect(step.description).toBeDefined();
      expect(typeof step.isComplete).toBe('boolean');
    });
  });
});

// ============================================================================
// EXAMPLE PROMPTS TESTS
// ============================================================================

describe('Example Prompts', () => {
  it('has example prompts', () => {
    expect(examplePrompts.length).toBeGreaterThan(0);
  });

  it('prompts are non-empty strings', () => {
    examplePrompts.forEach((prompt) => {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TOOL IMPLEMENTATION TESTS
// ============================================================================

describe('explainConcept', () => {
  it('explains agents concept', () => {
    const result = explainConcept('agents', 'detailed');

    expect(result.success).toBe(true);
    expect(result.data?.explanation).toBeDefined();
    expect(result.data?.explanation.length).toBeGreaterThan(50);
    expect(result.data?.relatedConcepts).toBeDefined();
  });

  it('explains blocks concept', () => {
    const result = explainConcept('blocks', 'brief');

    expect(result.success).toBe(true);
    expect(result.data?.explanation).toBeDefined();
  });

  it('explains flows concept with technical depth', () => {
    const result = explainConcept('flows', 'technical');

    expect(result.success).toBe(true);
    expect(result.data?.explanation).toContain('DAG');
  });

  it('returns error for unknown concept', () => {
    const result = explainConcept('unknown-concept', 'detailed');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown concept');
  });
});

describe('showExample', () => {
  it('shows simple-agent example', () => {
    const result = showExample('simple-agent');

    expect(result.success).toBe(true);
    expect(result.data?.title).toBeDefined();
    expect(result.data?.description).toBeDefined();
    expect(result.data?.code).toBeDefined();
  });

  it('shows chat-agent example', () => {
    const result = showExample('chat-agent');

    expect(result.success).toBe(true);
    expect(result.data?.code).toContain('Chat');
  });

  it('returns error for unknown feature', () => {
    const result = showExample('unknown-feature');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown feature');
  });
});

describe('startTutorial', () => {
  it('starts first-agent tutorial', () => {
    const result = startTutorial('first-agent');

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Create Your First Agent');
    expect(result.data?.steps).toBeDefined();
    expect(result.data?.steps.length).toBeGreaterThan(0);
    expect(result.data?.currentStep).toBe(0);
  });

  it('starts custom-tools tutorial', () => {
    const result = startTutorial('custom-tools');

    expect(result.success).toBe(true);
    expect(result.data?.title).toContain('Custom Tools');
  });

  it('returns error for unknown tutorial', () => {
    const result = startTutorial('unknown-tutorial');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tutorial');
  });
});

describe('checkProgress', () => {
  it('returns progress with no completed steps', () => {
    const result = checkProgress([]);

    expect(result.success).toBe(true);
    expect(result.data?.currentStep).toBe('welcome');
    expect(result.data?.completedSteps).toHaveLength(0);
    expect(result.data?.totalSteps).toBeGreaterThan(0);
  });

  it('returns progress with some completed steps', () => {
    const result = checkProgress(['welcome', 'concepts']);

    expect(result.success).toBe(true);
    expect(result.data?.completedSteps).toHaveLength(2);
    expect(result.data?.currentStep).not.toBe('welcome');
    expect(result.data?.currentStep).not.toBe('concepts');
  });

  it('returns next step', () => {
    const result = checkProgress(['welcome']);

    expect(result.success).toBe(true);
    expect(result.data?.nextStep).toBeDefined();
  });
});

describe('createSampleAgent', () => {
  it('creates simple-assistant agent', () => {
    const result = createSampleAgent('simple-assistant');

    expect(result.success).toBe(true);
    expect(result.data?.agent).toBeDefined();
    expect(result.data?.message).toContain('Created');
  });

  it('creates agent with custom name', () => {
    const result = createSampleAgent('research-analyst', 'My Research Bot');

    expect(result.success).toBe(true);
    expect((result.data?.agent as { name: string }).name).toBe('My Research Bot');
  });

  it('returns error for unknown template', () => {
    const result = createSampleAgent('unknown-template');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown template');
  });
});

describe('provideFeedback', () => {
  it('provides feedback on short system prompt', () => {
    const result = provideFeedback('system-prompt', 'Be helpful.');

    expect(result.success).toBe(true);
    expect(result.data?.feedback).toBeDefined();
    expect(result.data?.score).toBeLessThan(80);
    expect(result.data?.suggestions).toBeDefined();
  });

  it('provides feedback on good system prompt', () => {
    const result = provideFeedback(
      'system-prompt',
      'You are a helpful assistant. Answer questions clearly and provide accurate information. Be concise but thorough.'
    );

    expect(result.success).toBe(true);
    expect(result.data?.score).toBeGreaterThan(70);
  });

  it('recognizes "You are" pattern', () => {
    const result = provideFeedback('system-prompt', 'You are an expert.');

    expect(result.success).toBe(true);
    expect(result.data?.feedback.some((f) => f.includes('You are'))).toBe(true);
  });
});
