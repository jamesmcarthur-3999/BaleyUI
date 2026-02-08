import type { CreatorMessage } from './creator-types';

const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_FIELD_PATTERN =
  /\b(api[\s_-]?key|token|secret|password|passphrase|client[\s_-]?secret|private[\s_-]?key|access[\s_-]?key|bearer)\b/i;

const SENSITIVE_ASSIGNMENT_PATTERN =
  /(\b(?:api[\s_-]?key|apiKey|token|secret|password|passphrase|client[\s_-]?secret|clientSecret|access[\s_-]?token|accessToken|authorization)\b\s*[:=]\s*)([^\s,;]+)/gi;

const SENSITIVE_JSON_PATTERN =
  /("?(?:api[\s_-]?key|apiKey|token|secret|password|passphrase|client[\s_-]?secret|clientSecret|access[\s_-]?token|accessToken|authorization)"?\s*:\s*")([^"]+)(")/gi;

const URL_QUERY_SECRET_PATTERN =
  /([?&](?:api[_-]?key|token|access[_-]?token|client[_-]?secret|password|pwd|secret)=)[^&#\s]+/gi;

const CONNECTION_CREDENTIAL_PATTERN =
  /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|http|https):\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi;

const BEARER_PATTERN = /\b(Bearer\s+)([A-Za-z0-9._~+/-]{8,})\b/gi;

const RAW_SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9-]{16,}\b/gi,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gi,
];

export function isSensitiveDiscoveryField(label: string, description?: string): boolean {
  const summary = `${label} ${description ?? ''}`;
  return SENSITIVE_FIELD_PATTERN.test(summary);
}

export function sanitizeCreatorText(input: string): string {
  if (!input) return input;

  let redacted = input;

  // Redact secrets on labeled lines like "API Key: sk-..."
  redacted = redacted.replace(
    /^(\s*(?:[-*]\s*)?([^:\n]{2,120})\s*:\s*)(.+)$/gim,
    (full, prefix, rawLabel, value) => {
      if (!value?.trim()) return full;
      if (!isSensitiveDiscoveryField(String(rawLabel))) return full;
      return `${String(prefix)}${REDACTED_VALUE}`;
    }
  );

  redacted = redacted.replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${REDACTED_VALUE}`);
  redacted = redacted.replace(SENSITIVE_JSON_PATTERN, `$1${REDACTED_VALUE}$3`);
  redacted = redacted.replace(URL_QUERY_SECRET_PATTERN, `$1${REDACTED_VALUE}`);
  redacted = redacted.replace(CONNECTION_CREDENTIAL_PATTERN, `$1${REDACTED_VALUE}$3`);
  redacted = redacted.replace(BEARER_PATTERN, `$1${REDACTED_VALUE}`);

  for (const pattern of RAW_SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED_VALUE);
  }

  return redacted;
}

export function sanitizeCreatorConversationHistory(
  messages: CreatorMessage[]
): CreatorMessage[] {
  return messages.map((message) => ({
    ...message,
    content: sanitizeCreatorText(message.content),
    ...(typeof message.thinking === 'string'
      ? { thinking: sanitizeCreatorText(message.thinking) }
      : {}),
  }));
}

export const CREATOR_REDACTED_VALUE = REDACTED_VALUE;
