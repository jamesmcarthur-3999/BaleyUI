/**
 * HTML Sanitization Utility
 *
 * Provides XSS protection using DOMPurify for HTML content.
 */

import DOMPurify, { type Config } from 'dompurify';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default DOMPurify configuration for safe HTML display.
 * Allows common formatting tags while blocking dangerous elements.
 */
const DEFAULT_CONFIG: Config = {
  ALLOWED_TAGS: [
    // Text formatting
    'p', 'br', 'b', 'i', 'u', 's', 'em', 'strong', 'mark', 'small',
    'sub', 'sup', 'del', 'ins',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Block elements
    'blockquote', 'pre', 'code', 'kbd', 'samp',
    // Semantic
    'a', 'span', 'div',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'colgroup', 'col',
    // Other
    'hr', 'abbr', 'cite', 'q', 'time', 'address',
    'figure', 'figcaption', 'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'class', 'id', 'name',
    'colspan', 'rowspan', 'scope', 'headers',
    'datetime', 'cite', 'open',
    'target', 'rel',
    // Data attributes for styling
    'data-*',
  ],
  // Allow safe URL schemes
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  // Don't allow data: URIs
  ALLOW_DATA_ATTR: true,
  // Add rel="noopener" to links
  ADD_ATTR: ['target'],
  // Forbid dangerous tags even if they slip through
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
};

/**
 * Strict configuration that only allows basic text formatting.
 * Use for untrusted user content.
 */
const STRICT_CONFIG: Config = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'span'],
  ALLOWED_ATTR: ['class'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'a'],
  FORBID_ATTR: ['href', 'src', 'onerror', 'onload', 'onclick'],
};

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Escape HTML entities to prevent XSS in text contexts.
 *
 * @param str - The string to escape
 * @returns Escaped string safe for HTML text content
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize HTML string for safe display using DOMPurify.
 *
 * This is the primary function for sanitizing HTML content before
 * using dangerouslySetInnerHTML.
 *
 * @param html - The HTML string to sanitize
 * @param strict - If true, use stricter sanitization (default: false)
 * @returns Sanitized HTML string safe for display
 *
 * @example
 * ```tsx
 * <div dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(userContent) }} />
 * ```
 */
export function sanitizeForDisplay(html: string, strict = false): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = strict ? STRICT_CONFIG : DEFAULT_CONFIG;
  // RETURN_TRUSTED_TYPE: false ensures we get a string, not TrustedHTML
  return DOMPurify.sanitize(html, { ...config, RETURN_TRUSTED_TYPE: false }) as string;
}

/**
 * Sanitize HTML with custom configuration.
 *
 * @param html - The HTML string to sanitize
 * @param config - Custom DOMPurify configuration
 * @returns Sanitized HTML string
 */
export function sanitizeWithConfig(html: string, config: Config): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // RETURN_TRUSTED_TYPE: false ensures we get a string, not TrustedHTML
  return DOMPurify.sanitize(html, { ...config, RETURN_TRUSTED_TYPE: false }) as string;
}

/**
 * Check if a URL is safe (not javascript:, vbscript:, data:, etc.)
 *
 * @param url - The URL to check
 * @returns True if the URL is safe
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = /^(javascript|vbscript|data):/i;
  if (dangerousProtocols.test(trimmed)) {
    return false;
  }

  // Allow relative URLs
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('.')) {
    return true;
  }

  // Allow safe protocols
  const safeProtocols = /^(https?|mailto|tel|ftp):/i;
  if (safeProtocols.test(trimmed)) {
    return true;
  }

  // Allow protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return true;
  }

  // Disallow unknown protocols
  if (trimmed.includes(':')) {
    return false;
  }

  // Allow plain paths
  return true;
}

/**
 * Sanitize a URL to ensure it's safe for use in href/src attributes.
 *
 * @param url - The URL to sanitize
 * @param defaultUrl - Fallback URL if input is unsafe (default: '#')
 * @returns Safe URL string
 */
export function sanitizeUrl(url: string, defaultUrl = '#'): string {
  if (!url || typeof url !== 'string') {
    return defaultUrl;
  }

  return isSafeUrl(url) ? url : defaultUrl;
}

// ============================================================================
// HOOKS FOR DOMPURIFY (if needed for advanced use cases)
// ============================================================================

/**
 * Add a hook to DOMPurify for custom processing.
 * Useful for adding rel="noopener" to external links, etc.
 */
if (typeof window !== 'undefined') {
  // Add target="_blank" gets rel="noopener noreferrer" for security
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}
