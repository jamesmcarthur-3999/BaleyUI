/**
 * AI Companion Components
 *
 * The AI companion interface with multiple interaction modes.
 */

export { CompanionContainer } from './CompanionContainer';
export type { CompanionMode, CompanionState } from './CompanionContainer';

export { ChatMode } from './ChatMode';
// ChatMessage is now from the unified chat library
export type { ChatMessage } from '@/components/chat';

export { OrbMode } from './OrbMode';
export type { OrbState, OrbActivity } from './OrbMode';

export { CommandPalette, useCommandPalette } from './CommandPalette';
export type { Command } from './CommandPalette';

export { InlinePrompt, InlinePromptButton } from './InlinePrompt';
export type { InlinePromptSuggestion, InlinePromptResult } from './InlinePrompt';

export { VoiceMode, useVoiceMode } from './VoiceMode';
export type { VoiceState, VoiceConfig, VoiceTranscript } from './VoiceMode';
