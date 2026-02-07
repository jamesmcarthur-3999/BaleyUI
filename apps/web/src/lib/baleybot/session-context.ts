// apps/web/src/lib/baleybot/session-context.ts

/**
 * Session Context
 *
 * Shared context passed to specialist internal BBs so they
 * understand what the user is building without re-explaining.
 */

import type { ReadinessState } from './readiness';

export interface SessionContext {
  /** Name of the bot being built */
  botName: string;
  /** Generated BAL code */
  balCode: string;
  /** Entity names and their tools */
  entities: Array<{
    name: string;
    tools: string[];
    purpose: string;
  }>;
  /** Current readiness state */
  readiness: ReadinessState;
  /** Connected AI providers */
  connectedProviders: string[];
  /** Connected database types */
  connectedDatabases: string[];
  /** Test results summary */
  testSummary?: {
    total: number;
    passed: number;
    failed: number;
  };
}

/**
 * Format session context into a string for internal BB input.
 * This becomes the "context" parameter when calling executeInternalBaleybot().
 */
export function formatSessionContext(ctx: SessionContext): string {
  const lines: string[] = [
    `Bot: ${ctx.botName}`,
    `Entities: ${ctx.entities.map(e => `${e.name} (${e.tools.join(', ')})`).join('; ')}`,
    `Readiness: designed=${ctx.readiness.designed}, connected=${ctx.readiness.connected}, tested=${ctx.readiness.tested}, activated=${ctx.readiness.activated}, monitored=${ctx.readiness.monitored}`,
  ];

  if (ctx.connectedProviders.length > 0) {
    lines.push(`AI Providers: ${ctx.connectedProviders.join(', ')}`);
  }
  if (ctx.connectedDatabases.length > 0) {
    lines.push(`Databases: ${ctx.connectedDatabases.join(', ')}`);
  }
  if (ctx.testSummary) {
    lines.push(`Tests: ${ctx.testSummary.passed}/${ctx.testSummary.total} passed, ${ctx.testSummary.failed} failed`);
  }

  lines.push('');
  lines.push('BAL Code:');
  lines.push(ctx.balCode);

  return lines.join('\n');
}
