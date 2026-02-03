/**
 * Onboarding Agent Module
 *
 * Exports the onboarding agent definition and related utilities.
 */

export {
  onboardingAgentDefinition,
  onboardingSteps,
  examplePrompts,
} from './definition';

export type {
  OnboardingAgentDefinition,
  OnboardingStep,
} from './definition';

export {
  explainConcept,
  showExample,
  startTutorial,
  checkProgress,
  createSampleAgent,
  provideFeedback,
} from './tools';

export type {
  ToolResult,
  OnboardingProgress,
} from './tools';
