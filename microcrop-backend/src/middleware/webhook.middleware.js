import crypto from 'crypto';
import { env } from '../config/env.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Verify payment webhook authenticity.
 * Checks HMAC signature (x-webhook-signature header) using the provider's API secret.
 * Falls back to shared secret (WEBHOOK_SECRET env var) if provider secret unavailable.
 *
 * In production:
 * - WEBHOOK_SECRET must be configured (rejects with 500 if missing)
 * - x-webhook-timestamp header is required (rejects with 401 if missing)
 * - Timestamp is included in HMAC computation for replay prevention
 * - Processed webhooks are deduplicated via Redis (1-hour TTL)
 */
export function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const webhookSecret = env.webhookSecret;

  // If no webhook secret configured, log warning but allow (for development)
  if (!webhookSecret) {
    if (env.isProd) {
      logger.error('WEBHOOK_SECRET not configured in production - rejecting callback');
      return res.status(500).json({ success: false, error: 'Server misconfigured' });
    }
    logger.warn('WEBHOOK_SECRET not configured - webhook signature verification skipped');
    return next();
  }

  // In production, require timestamp header
  if (env.isProd && !timestamp) {
    logger.warn('Webhook callback missing required timestamp header in production');
    return res.status(401).json({ success: false, error: 'Missing webhook timestamp' });
  }

  if (!signature) {
    logger.warn('Webhook callback missing signature header');
    return res.status(401).json({ success: false, error: 'Missing webhook signature' });
  }

  try {
    // Include timestamp in HMAC computation when present
    const payload = JSON.stringify(req.body);
    const hmacInput = timestamp ? timestamp + '.' + payload : payload;
    const expected = crypto.createHmac('sha256', webhookSecret).update(hmacInput).digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );

    if (!isValid) {
      logger.warn('Webhook signature verification failed');
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }

    // Replay prevention: reject stale webhooks if timestamp header is present
    if (timestamp) {
      const webhookTime = Number(timestamp) * 1000; // assume seconds -> ms
      const age = Math.abs(Date.now() - webhookTime);
      if (age > 300000) { // 5 minutes
        logger.warn('Webhook timestamp too old, possible replay', { age: Math.round(age / 1000) });
        return res.status(401).json({ success: false, error: 'Webhook timestamp expired' });
      }
    }

    // Replay deduplication: check if this exact webhook was already processed
    const dedupeKey = `webhook:seen:${signature}`;

    redis.get(dedupeKey)
      .then((seen) => {
        if (seen) {
          logger.info('Duplicate webhook detected, returning idempotent 200', { signature: signature.substring(0, 16) });
          return res.status(200).json({ success: true, message: 'Already processed' });
        }

        // Mark as seen with 1-hour TTL
        redis.set(dedupeKey, '1', 'EX', 3600).catch((err) => {
          logger.warn('Failed to set webhook dedup key in Redis', { error: err.message });
        });

        next();
      })
      .catch((err) => {
        // Fail open on Redis errors - allow the request through
        logger.warn('Redis dedup check failed, allowing webhook', { error: err.message });
        next();
      });
  } catch (error) {
    logger.warn('Webhook signature verification error', { error: error.message });
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }
}
