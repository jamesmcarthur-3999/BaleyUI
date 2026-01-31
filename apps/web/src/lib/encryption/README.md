# Encryption Module

AES-256-GCM encryption for sensitive data in BaleyUI.

## Quick Start

```typescript
import { encrypt, decrypt } from '@/lib/encryption';

// Encrypt before storing
const apiKey = 'sk-1234567890abcdef';
const encrypted = encrypt(apiKey);
// Returns: "a1b2c3d4e5f6....:1a2b3c4d5e6f....:9z8y7x6w5v4u...."

// Store encrypted value in database
await db.insert(connections).values({
  config: { apiKey: encrypted }
});

// Decrypt when needed
const connection = await db.query.connections.findFirst();
const plainApiKey = decrypt(connection.config.apiKey);
```

## Environment Setup

Generate an encryption key:

```bash
openssl rand -hex 32
```

Add to `.env.local`:

```env
ENCRYPTION_KEY=your_64_character_hex_string_here
```

**Important**: Never commit the encryption key to git!

## API Reference

### `encrypt(plaintext: string): string`

Encrypts plaintext using AES-256-GCM.

**Returns**: String in format `iv:authTag:encrypted` (all hex encoded)

**Example**:
```typescript
const encrypted = encrypt('sk-1234567890abcdef');
// "a1b2c3d4....:e5f6g7h8....:i9j0k1l2...."
```

### `decrypt(ciphertext: string): string`

Decrypts ciphertext that was encrypted with `encrypt()`.

**Throws**: Error if decryption fails (wrong key, tampered data, or invalid format)

**Example**:
```typescript
const plaintext = decrypt(encrypted);
// "sk-1234567890abcdef"
```

### `isEncrypted(value: string): boolean`

Checks if a string appears to be encrypted data.

**Returns**: `true` if the string has the `iv:authTag:encrypted` format

**Example**:
```typescript
isEncrypted('sk-1234567890abcdef'); // false
isEncrypted(encrypt('test')); // true
```

## Use Cases

### 1. API Keys

```typescript
// Storing
const connection = await db.insert(connections).values({
  type: 'openai',
  config: {
    apiKey: encrypt(apiKey),
    baseUrl: 'https://api.openai.com/v1',
  },
});

// Using
const config = connection.config as { apiKey: string };
const client = new OpenAI({
  apiKey: decrypt(config.apiKey),
});
```

### 2. Database Credentials

```typescript
const credentials = JSON.stringify({
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'secret',
});

const encrypted = encrypt(credentials);

// Later...
const creds = JSON.parse(decrypt(encrypted));
const db = new Client(creds);
```

### 3. OAuth Tokens

```typescript
await db.insert(connections).values({
  config: {
    accessToken: encrypt(accessToken),
    refreshToken: encrypt(refreshToken),
  },
});
```

## Migration from Plaintext

```typescript
import { isEncrypted, encrypt } from '@/lib/encryption';

// Migrate all connections
const connections = await db.query.connections.findMany();

for (const conn of connections) {
  const config = conn.config as { apiKey?: string };

  if (config.apiKey && !isEncrypted(config.apiKey)) {
    // Encrypt plaintext API key
    const encrypted = encrypt(config.apiKey);

    await db.update(connections)
      .set({
        config: { ...config, apiKey: encrypted }
      })
      .where(eq(connections.id, conn.id));

    console.log(`Encrypted API key for connection ${conn.id}`);
  }
}
```

## Security Features

- **Algorithm**: AES-256-GCM (NIST approved, industry standard)
- **Key Size**: 256 bits (32 bytes)
- **IV**: Random 12 bytes per encryption (prevents pattern analysis)
- **Authentication**: 16-byte auth tag (tamper detection)
- **Format**: `iv:authTag:encrypted` (all hex encoded for safe storage)

## Error Handling

```typescript
try {
  const plaintext = decrypt(encrypted);
} catch (error) {
  if (error.message.includes('Invalid ciphertext format')) {
    // Not encrypted or wrong format
  } else if (error.message.includes('ENCRYPTION_KEY')) {
    // Key not set or invalid
  } else {
    // Decryption failed (tampered data or wrong key)
  }
}
```

## Best Practices

1. **Always encrypt secrets** before storing in database
2. **Never log decrypted values** (only log that encryption/decryption occurred)
3. **Use different keys** for dev/staging/prod environments
4. **Rotate keys** periodically (and re-encrypt data)
5. **Store keys securely** (environment variables, vaults, not in code)
6. **Use `isEncrypted()`** to detect migration status

## Key Rotation

When rotating encryption keys:

1. Generate new key: `openssl rand -hex 32`
2. Deploy with both `ENCRYPTION_KEY` and `ENCRYPTION_KEY_OLD`
3. Decrypt with old key, re-encrypt with new key
4. After migration, remove `ENCRYPTION_KEY_OLD`

```typescript
function rotateEncryption(oldEncrypted: string): string {
  const oldKey = process.env.ENCRYPTION_KEY_OLD;
  const currentKey = process.env.ENCRYPTION_KEY;

  // Temporarily use old key
  process.env.ENCRYPTION_KEY = oldKey;
  const plaintext = decrypt(oldEncrypted);

  // Switch to new key
  process.env.ENCRYPTION_KEY = currentKey;
  return encrypt(plaintext);
}
```

## Testing

Run tests:

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32) npm test encryption
```

Example test:

```typescript
import { encrypt, decrypt, isEncrypted } from '@/lib/encryption';

test('encrypts and decrypts', () => {
  const plaintext = 'sk-1234567890abcdef';
  const encrypted = encrypt(plaintext);

  expect(isEncrypted(encrypted)).toBe(true);
  expect(decrypt(encrypted)).toBe(plaintext);
});
```

## Troubleshooting

### Error: "ENCRYPTION_KEY environment variable is not set"

**Solution**: Generate and set the encryption key:

```bash
openssl rand -hex 32
# Add to .env.local:
ENCRYPTION_KEY=<generated_key>
```

### Error: "ENCRYPTION_KEY must be 64 hex characters"

**Solution**: Ensure the key is exactly 64 characters (32 bytes in hex):

```bash
# Correct length:
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Wrong (too short):
ENCRYPTION_KEY=abc123
```

### Decryption fails with no clear error

**Causes**:
- Data was tampered with
- Wrong encryption key
- Data was not encrypted with this module

**Solution**: Check that the ciphertext format is `iv:tag:encrypted` and verify the key.

## Performance

- **Encryption**: ~0.1ms per operation
- **Decryption**: ~0.1ms per operation
- **Overhead**: Minimal (hardware-accelerated AES on most systems)

Benchmark:

```typescript
const plaintext = 'sk-1234567890abcdef'.repeat(10); // ~170 bytes

console.time('encrypt');
const encrypted = encrypt(plaintext);
console.timeEnd('encrypt'); // ~0.1ms

console.time('decrypt');
decrypt(encrypted);
console.timeEnd('decrypt'); // ~0.1ms
```

## See Also

- [Data Integrity Layer Docs](../../../../packages/db/DATA_INTEGRITY.md)
- [Quick Start Guide](../../../../packages/db/QUICK_START.md)
- [Example Router](../trpc/example-router.ts)
