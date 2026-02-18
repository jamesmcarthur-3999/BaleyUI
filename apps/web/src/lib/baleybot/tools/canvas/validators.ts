/**
 * Canvas Tool Validators
 *
 * Path validation and command allowlisting for canvas tools.
 * Prevents path traversal, dangerous commands, and file system abuse.
 */

// ============================================================================
// PATH VALIDATION
// ============================================================================

/** Characters forbidden in file paths */
const FORBIDDEN_PATH_CHARS = /[<>:"|?*\x00-\x1f]/;

/** Dangerous path components */
const DANGEROUS_PATH_SEGMENTS = [
  '..',
  'node_modules',
  '.git',
  '.env',
  '.env.local',
  '.env.production',
];

/** Maximum file path length */
const MAX_PATH_LENGTH = 500;

/** Maximum file content size (500KB) */
export const MAX_FILE_SIZE = 500 * 1024;

/** Maximum total project size (50MB) */
export const MAX_PROJECT_SIZE = 50 * 1024 * 1024;

/**
 * Validate a file path for write/read/delete operations.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFilePath(path: string): string | null {
  if (!path || typeof path !== 'string') {
    return 'File path is required';
  }

  if (path.length > MAX_PATH_LENGTH) {
    return `File path exceeds ${MAX_PATH_LENGTH} characters`;
  }

  // Must be relative (no leading /)
  if (path.startsWith('/')) {
    return 'File path must be relative (no leading /)';
  }

  // No forbidden characters
  if (FORBIDDEN_PATH_CHARS.test(path)) {
    return 'File path contains forbidden characters';
  }

  // Check each segment
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '') continue; // Allow trailing slashes in directories
    if (DANGEROUS_PATH_SEGMENTS.includes(segment)) {
      return `Path contains forbidden segment: ${segment}`;
    }
    if (segment.startsWith('.') && segment !== '.') {
      // Allow dotfiles like .gitignore but not .. or .env
      if (DANGEROUS_PATH_SEGMENTS.includes(segment)) {
        return `Path contains forbidden segment: ${segment}`;
      }
    }
  }

  return null;
}

// ============================================================================
// COMMAND VALIDATION
// ============================================================================

/** Allowed command prefixes */
const ALLOWED_COMMAND_PREFIXES = [
  'npm',
  'npx',
  'pnpm',
  'node',
  'tsc',
  'next',
];

/** Explicitly blocked command patterns */
const BLOCKED_PATTERNS = [
  /rm\s+(-rf|-fr|--recursive)/i,
  /sudo\b/i,
  /curl\b/i,
  /wget\b/i,
  /chmod\b/i,
  /chown\b/i,
  /kill\b/i,
  /pkill\b/i,
  /eval\b/i,
  /exec\b/i,
  /sh\s+-c/i,
  /bash\s+-c/i,
  />\s*\/dev/i,
  /\|\s*sh\b/i,
  /\|\s*bash\b/i,
];

/**
 * Validate a shell command for the run_command tool.
 * Returns null if valid, or an error message if invalid.
 */
export function validateCommand(command: string): string | null {
  if (!command || typeof command !== 'string') {
    return 'Command is required';
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return 'Command cannot be empty';
  }

  if (trimmed.length > 2000) {
    return 'Command exceeds maximum length (2000 chars)';
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Command contains blocked pattern: ${pattern.source}`;
    }
  }

  // Must start with an allowed prefix
  const firstWord = trimmed.split(/\s/)[0]!.toLowerCase();
  if (!ALLOWED_COMMAND_PREFIXES.includes(firstWord)) {
    return `Command must start with one of: ${ALLOWED_COMMAND_PREFIXES.join(', ')}. Got: ${firstWord}`;
  }

  return null;
}

// ============================================================================
// FILE EXTENSION HELPERS
// ============================================================================

/** Detect language from file extension */
export function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'html':
      return 'html';
    case 'svg':
      return 'svg';
    default:
      return undefined;
  }
}
