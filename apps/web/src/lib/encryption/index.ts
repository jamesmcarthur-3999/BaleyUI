import crypto from 'crypto';

const KEY_VERSION_PREFIX = 'v1:';

/**
 * Get the encryption key from environment variables.
 * The key must be 32 bytes (64 hex characters) for AES-256.
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
        'Generate one with: openssl rand -hex 32'
    );
  }

  if (key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32'
    );
  }

  return Buffer.from(key, 'hex');
}

/**
 * Get the previous encryption key for rotation support.
 * Returns null if ENCRYPTION_KEY_PREVIOUS is not set.
 */
function getPreviousEncryptionKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (!key || key.length !== 64) return null;
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns ciphertext in format: iv:authTag:encrypted (all hex encoded).
 *
 * @param plaintext - The string to encrypt (e.g., API key, database password)
 * @returns Encrypted string in format "iv:authTag:encrypted"
 *
 * @example
 * ```ts
 * const apiKey = 'sk-1234567890abcdef';
 * const encrypted = encrypt(apiKey);
 * // Returns something like: "a1b2c3d4....:e5f6g7h8....:i9j0k1l2...."
 *
 * // Store encrypted in database
 * await db.insert(connections).values({
 *   config: { apiKey: encrypted }
 * });
 * ```
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();

  // Generate random IV (12 bytes is standard for GCM)
  const iv = crypto.randomBytes(12);

  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // Encrypt the plaintext
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Return versioned format: v1:iv:authTag:encrypted (all hex encoded)
  return `${KEY_VERSION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt ciphertext that was encrypted with encrypt().
 * Expects format: iv:authTag:encrypted (all hex encoded).
 *
 * @param ciphertext - The encrypted string from encrypt()
 * @returns The original plaintext
 * @throws Error if decryption fails (wrong key, tampered data, or invalid format)
 *
 * @example
 * ```ts
 * const connection = await db.query.connections.findFirst();
 * const apiKey = decrypt(connection.config.apiKey);
 * // Use the decrypted API key
 * const client = new OpenAI({ apiKey });
 * ```
 */
export function decrypt(ciphertext: string): string {
  // Handle versioned format: v1:iv:authTag:encrypted
  let payload = ciphertext;
  if (ciphertext.startsWith(KEY_VERSION_PREFIX)) {
    payload = ciphertext.slice(KEY_VERSION_PREFIX.length);
  }

  // Parse the format: iv:authTag:encrypted
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid ciphertext format. Expected "iv:authTag:encrypted"'
    );
  }

  const ivHex = parts[0]!;
  const authTagHex = parts[1]!;
  const encryptedHex = parts[2]!;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Try current key first
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted: string = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (currentKeyError) {
    // Try previous key for rotation support
    const previousKey = getPreviousEncryptionKey();
    if (previousKey) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', previousKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted: string = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        // Both keys failed
      }
    }
    throw currentKeyError;
  }
}

/**
 * Check if a string appears to be encrypted (has the iv:authTag:encrypted format).
 * Useful for handling legacy data or detecting encryption status.
 *
 * @param value - String to check
 * @returns true if the string looks like encrypted data
 *
 * @example
 * ```ts
 * if (!isEncrypted(connection.config.apiKey)) {
 *   // Migrate old plaintext to encrypted
 *   connection.config.apiKey = encrypt(connection.config.apiKey);
 * }
 * ```
 */
export function isEncrypted(value: string): boolean {
  // Handle versioned format: v1:iv:authTag:encrypted
  let payload = value;
  if (value.startsWith(KEY_VERSION_PREFIX)) {
    payload = value.slice(KEY_VERSION_PREFIX.length);
  }

  const parts = payload.split(':');
  if (parts.length !== 3) return false;

  // Check if all parts are valid hex strings
  const hexRegex = /^[0-9a-f]+$/i;
  return parts.every((part) => part.length > 0 && hexRegex.test(part));
}
