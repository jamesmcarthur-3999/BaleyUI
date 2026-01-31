import crypto from 'crypto';

/**
 * Webhook Signature Utilities
 *
 * Provides functions for signing and verifying webhook payloads using HMAC-SHA256.
 * This ensures that webhook requests can be authenticated by recipients.
 *
 * Signature format: `t=timestamp,v1=signature`
 * - timestamp: Unix timestamp when the signature was created
 * - signature: HMAC-SHA256 hash of "timestamp.payload"
 *
 * Example verification in recipient code:
 * ```javascript
 * const signature = req.headers['x-baleyui-signature'];
 * const [t, v1] = signature.split(',').map(p => p.split('=')[1]);
 * const expectedSig = crypto
 *   .createHmac('sha256', signingSecret)
 *   .update(`${t}.${JSON.stringify(req.body)}`)
 *   .digest('hex');
 * const isValid = v1 === expectedSig;
 * ```
 */

/**
 * Sign a webhook payload using HMAC-SHA256
 *
 * @param payload - The payload string to sign
 * @param secret - The signing secret
 * @returns The hex-encoded signature
 */
export function signWebhookPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify a webhook signature using timing-safe comparison
 *
 * @param payload - The payload string that was signed
 * @param signature - The signature to verify
 * @param secret - The signing secret
 * @returns True if the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = signWebhookPayload(payload, secret);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    // If lengths don't match, timingSafeEqual throws
    return false;
  }
}

/**
 * Generate signature header value with timestamp
 *
 * Format: `t=timestamp,v1=signature`
 * The signature is computed over "timestamp.payload"
 *
 * @param payload - The JSON string payload to sign
 * @param secret - The signing secret
 * @returns The signature header value
 */
export function createSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = signWebhookPayload(signedPayload, secret);
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify a signature header with timestamp
 *
 * @param payload - The JSON string payload
 * @param signatureHeader - The signature header value (t=timestamp,v1=signature)
 * @param secret - The signing secret
 * @param toleranceSeconds - Maximum age of signature in seconds (default: 300 = 5 minutes)
 * @returns Object with validation result and error message if invalid
 */
export function verifySignatureHeader(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = 300
): { valid: boolean; error?: string } {
  try {
    // Parse signature header
    const parts = signatureHeader.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const timestamp = parseInt(timestampPart.split('=')[1] || '', 10);
    const signature = signaturePart.split('=')[1];

    if (!timestamp || !signature) {
      return { valid: false, error: 'Missing timestamp or signature' };
    }

    // Check timestamp tolerance
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return { valid: false, error: 'Signature expired' };
    }

    // Verify signature
    const signedPayload = `${timestamp}.${payload}`;
    const isValid = verifyWebhookSignature(signedPayload, signature, secret);

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/* ============================================================================
 * WEBHOOK SIGNATURE VERIFICATION GUIDE
 * ============================================================================
 *
 * When you receive a webhook from BaleyUI, it includes an X-BaleyUI-Signature
 * header that you can use to verify the webhook's authenticity.
 *
 * ## Why Verify Signatures?
 *
 * Verifying webhook signatures ensures that:
 * 1. The webhook was actually sent by BaleyUI
 * 2. The payload has not been tampered with
 * 3. The webhook is recent (prevents replay attacks)
 *
 * ## Signature Format
 *
 * The X-BaleyUI-Signature header has the format:
 *   t=<timestamp>,v1=<signature>
 *
 * Where:
 * - timestamp: Unix timestamp (seconds since epoch) when signature was created
 * - signature: HMAC-SHA256 hash of "timestamp.payload"
 *
 * ## How to Verify (Node.js Example)
 *
 * ```javascript
 * const crypto = require('crypto');
 *
 * function verifyWebhook(req, signingSecret) {
 *   // 1. Get the signature header
 *   const signature = req.headers['x-baleyui-signature'];
 *   if (!signature) {
 *     throw new Error('No signature provided');
 *   }
 *
 *   // 2. Parse the signature header
 *   const parts = signature.split(',');
 *   const timestamp = parts[0].split('=')[1];
 *   const sig = parts[1].split('=')[1];
 *
 *   // 3. Check timestamp is recent (prevent replay attacks)
 *   const currentTime = Math.floor(Date.now() / 1000);
 *   const timeDiff = Math.abs(currentTime - parseInt(timestamp));
 *   if (timeDiff > 300) { // 5 minutes tolerance
 *     throw new Error('Signature expired');
 *   }
 *
 *   // 4. Reconstruct the signed payload
 *   const payload = JSON.stringify(req.body);
 *   const signedPayload = `${timestamp}.${payload}`;
 *
 *   // 5. Calculate expected signature
 *   const expectedSig = crypto
 *     .createHmac('sha256', signingSecret)
 *     .update(signedPayload)
 *     .digest('hex');
 *
 *   // 6. Compare signatures (timing-safe comparison)
 *   if (sig !== expectedSig) {
 *     throw new Error('Invalid signature');
 *   }
 *
 *   return true;
 * }
 *
 * // Usage in Express
 * app.post('/webhook', express.json(), (req, res) => {
 *   try {
 *     verifyWebhook(req, 'your-signing-secret-here');
 *     // Webhook is verified, process the payload
 *     console.log('Verified webhook:', req.body);
 *     res.json({ received: true });
 *   } catch (error) {
 *     console.error('Webhook verification failed:', error);
 *     res.status(401).json({ error: error.message });
 *   }
 * });
 * ```
 *
 * ## Python Example
 *
 * ```python
 * import hmac
 * import hashlib
 * import time
 * import json
 *
 * def verify_webhook(request, signing_secret):
 *     # Get signature header
 *     signature = request.headers.get('X-BaleyUI-Signature')
 *     if not signature:
 *         raise ValueError('No signature provided')
 *
 *     # Parse signature
 *     parts = dict(part.split('=') for part in signature.split(','))
 *     timestamp = int(parts['t'])
 *     sig = parts['v1']
 *
 *     # Check timestamp
 *     if abs(time.time() - timestamp) > 300:
 *         raise ValueError('Signature expired')
 *
 *     # Reconstruct signed payload
 *     payload = json.dumps(request.json)
 *     signed_payload = f"{timestamp}.{payload}"
 *
 *     # Calculate expected signature
 *     expected_sig = hmac.new(
 *         signing_secret.encode(),
 *         signed_payload.encode(),
 *         hashlib.sha256
 *     ).hexdigest()
 *
 *     # Compare signatures
 *     if not hmac.compare_digest(sig, expected_sig):
 *         raise ValueError('Invalid signature')
 *
 *     return True
 * ```
 *
 * ## Security Best Practices
 *
 * 1. **Always verify signatures**: Don't process unverified webhooks
 * 2. **Use timing-safe comparison**: Prevents timing attacks
 * 3. **Check timestamp tolerance**: Prevents replay attacks
 * 4. **Keep secrets secure**: Store signing secrets in environment variables
 * 5. **Log verification failures**: Monitor for potential attacks
 * 6. **Use HTTPS**: Always receive webhooks over HTTPS
 *
 * ## Getting Your Signing Secret
 *
 * When you generate a webhook URL in BaleyUI, you'll receive:
 * - webhookUrl: The URL to configure in external services
 * - secret: The URL secret (part of the URL path)
 * - signingSecret: The secret used to sign webhook payloads
 *
 * Store the signingSecret securely and use it to verify incoming webhooks.
 *
 * ## Troubleshooting
 *
 * **"Signature expired" error:**
 * - Check your server's clock is synchronized (use NTP)
 * - Increase tolerance if needed (but keep it reasonable)
 *
 * **"Invalid signature" error:**
 * - Verify you're using the correct signing secret
 * - Check you're serializing the payload exactly as received
 * - Ensure no whitespace or formatting changes to the JSON
 *
 * **Missing signature header:**
 * - Webhook might be from a different source
 * - Check your webhook configuration
 *
 * ============================================================================ */
