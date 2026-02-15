/**
 * Lightweight shim for @baleybots/auth that re-exports only the pure functions
 * used by @baleybots/core (getRequestHeaders). This avoids pulling in Express
 * via the CallbackServer class, which Turbopack can't bundle due to dynamic require().
 *
 * Wired via resolveAlias in next.config.ts.
 */

const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const CLAUDE_CODE_USER_AGENT = 'claude-code/1.0.0';

function isOAuthToken(token: string): boolean {
  return token.startsWith('sk-ant-oat');
}

function getAuthHeaders(
  credential: string,
  userAgent: string = CLAUDE_CODE_USER_AGENT,
): Record<string, string> {
  if (isOAuthToken(credential)) {
    return {
      'Authorization': `Bearer ${credential}`,
      'anthropic-beta': OAUTH_BETA_HEADER,
      'anthropic-version': '2023-06-01',
      'User-Agent': userAgent,
    };
  }
  return {
    'x-api-key': credential,
    'anthropic-version': '2023-06-01',
  };
}

export function getRequestHeaders(
  credential: string,
): Record<string, string> {
  return {
    ...getAuthHeaders(credential),
    'Content-Type': 'application/json',
  };
}

export {
  OAUTH_BETA_HEADER,
  CLAUDE_CODE_USER_AGENT,
  isOAuthToken,
  getAuthHeaders,
};
