/**
 * Credential Vault
 *
 * Provides AES-256-GCM encryption for storing sensitive credentials.
 * Uses randomized IVs to ensure identical plaintexts produce different ciphertexts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Secure credential encryption vault using AES-256-GCM.
 *
 * @example
 * ```typescript
 * const vault = new CredentialVault(process.env.ENCRYPTION_KEY);
 *
 * // Encrypt before storing in database
 * const encrypted = vault.encrypt(apiKey);
 *
 * // Decrypt when needed
 * const apiKey = vault.decrypt(encrypted);
 *
 * // Mask for logging (never log full credentials!)
 * console.log(`Using API key: ${vault.mask(apiKey)}`);
 * ```
 */
export class CredentialVault {
  private key: Buffer;

  /**
   * Create a new CredentialVault instance.
   *
   * @param encryptionKey - A 32-character string for AES-256 encryption.
   *                        If shorter, it will be padded; if longer, truncated.
   */
  constructor(encryptionKey: string) {
    // Ensure key is exactly 32 bytes for AES-256
    this.key = Buffer.from(encryptionKey.padEnd(32, '0').slice(0, 32));
  }

  /**
   * Encrypt a credential for storage.
   *
   * @param plaintext - The credential to encrypt
   * @returns Encrypted string in format: iv:authTag:ciphertext (hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a credential from storage.
   *
   * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext
   * @returns The original plaintext credential
   * @throws Error if format is invalid or decryption fails
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted credential format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    if (!ivHex || !authTagHex || encrypted === undefined) {
      throw new Error('Invalid encrypted credential format. Missing IV, auth tag, or ciphertext');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: string = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Mask a credential for logging (show first 3 and last 4 chars).
   * Never log full credentials!
   *
   * @param credential - The credential to mask
   * @returns Masked string like "sk-****cdef"
   */
  mask(credential: string): string {
    if (credential.length <= 8) {
      return '****';
    }
    return `${credential.slice(0, 3)}****${credential.slice(-4)}`;
  }

  /**
   * Check if a string appears to be encrypted (iv:authTag:ciphertext format).
   *
   * @param value - String to check
   * @returns true if the string appears to be encrypted
   */
  isEncrypted(value: string): boolean {
    return /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/.test(value);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let vaultInstance: CredentialVault | null = null;

/**
 * Get the singleton CredentialVault instance.
 * Uses CREDENTIAL_ENCRYPTION_KEY from environment.
 *
 * @throws Error if CREDENTIAL_ENCRYPTION_KEY is not set
 */
export function getCredentialVault(): CredentialVault {
  if (!vaultInstance) {
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        'CREDENTIAL_ENCRYPTION_KEY environment variable is required. ' +
        'Generate one with: openssl rand -hex 16'
      );
    }
    vaultInstance = new CredentialVault(key);
  }
  return vaultInstance;
}

/**
 * Reset the singleton instance (for testing).
 * @internal
 */
export function _resetVaultInstance(): void {
  vaultInstance = null;
}
