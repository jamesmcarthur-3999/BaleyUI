import { describe, expect, it } from 'vitest';
import {
  sanitizeCreatorText,
  sanitizeCreatorConversationHistory,
  isSensitiveDiscoveryField,
  CREATOR_REDACTED_VALUE,
} from '../creator-sanitization';
import type { CreatorMessage } from '../creator-types';

describe('creator-sanitization', () => {
  it('detects sensitive discovery fields', () => {
    expect(isSensitiveDiscoveryField('API Key')).toBe(true);
    expect(isSensitiveDiscoveryField('Webhook URL')).toBe(false);
  });

  it('redacts labeled secret values', () => {
    const input = [
      'Discovery answers:',
      'API Key: sk-test-secret-value-1234567890',
      'Endpoint URL: https://example.com/hooks',
    ].join('\n');

    const output = sanitizeCreatorText(input);

    expect(output).toContain(`API Key: ${CREATOR_REDACTED_VALUE}`);
    expect(output).toContain('Endpoint URL: https://example.com/hooks');
    expect(output).not.toContain('sk-test-secret-value');
  });

  it('redacts bearer tokens and credentials embedded in URLs', () => {
    const input =
      'Authorization: Bearer very-secret-token-value\n' +
      'mysql://reader:supersecret@db.internal:3306/app?token=abc123';
    const output = sanitizeCreatorText(input);

    expect(output).toContain(`Authorization: ${CREATOR_REDACTED_VALUE}`);
    expect(output).toContain(`mysql://reader:${CREATOR_REDACTED_VALUE}@db.internal:3306/app?token=${CREATOR_REDACTED_VALUE}`);
  });

  it('sanitizes conversation history message content', () => {
    const history: CreatorMessage[] = [
      {
        id: 'm-1',
        role: 'user',
        content: 'clientSecret: top-secret',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'm-2',
        role: 'assistant',
        content: 'Acknowledged',
        thinking: 'Use token=abcd1234',
        timestamp: new Date('2026-01-01T00:00:01.000Z'),
      },
    ];

    const sanitized = sanitizeCreatorConversationHistory(history);

    expect(sanitized[0]?.content).toContain(CREATOR_REDACTED_VALUE);
    expect(sanitized[1]?.thinking).toContain(CREATOR_REDACTED_VALUE);
  });
});
