/**
 * URL Validator for fetch_url SSRF Protection
 *
 * Blocks private IPs, cloud metadata endpoints, and non-http(s) protocols.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,                  // Loopback
  /^10\./,                   // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./,             // Class C private
  /^169\.254\./,             // Link-local
  /^0\./,                    // Current network
  /^::1$/,                   // IPv6 loopback
  /^fc00:/i,                 // IPv6 unique local
  /^fe80:/i,                 // IPv6 link-local
];

const BLOCKED_HOSTS = [
  'metadata.google.internal',
  'metadata.google.com',
  '169.254.169.254',         // AWS/GCP metadata
  '169.254.170.2',           // ECS metadata
  'fd00:ec2::254',           // AWS IPv6 metadata
];

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/**
 * Validate a URL is safe for server-side fetch.
 * Blocks private IPs, cloud metadata endpoints, and non-http(s) protocols.
 */
export function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlValidationError(`Invalid URL: ${rawUrl}`);
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlValidationError(
      `Blocked protocol "${parsed.protocol}". Only http: and https: are allowed.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known metadata endpoints
  if (BLOCKED_HOSTS.includes(hostname)) {
    throw new UrlValidationError(
      `Blocked host "${hostname}": cloud metadata endpoint`
    );
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      throw new UrlValidationError(
        `Blocked host "${hostname}": private/internal IP range`
      );
    }
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '[::1]') {
    throw new UrlValidationError(
      `Blocked host "${hostname}": localhost`
    );
  }

  return parsed;
}
