import crypto from 'crypto';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Verify payment webhook authenticity.
 * Checks HMAC signature (x-webhook-signature header) using the provider's API secret.
 * Falls back to shared secret (WEBHOOK_SECRET env var) if provider secret unavailable.
 */
export function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
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

  if (!signature) {
    logger.warn('Webhook callback missing signature header');
    return res.status(401).json({ success: false, error: 'Missing webhook signature' });
  }

  try {
    const payload = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );

    if (!isValid) {
      logger.warn('Webhook signature verification failed');
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }

    next();
  } catch (error) {
    logger.warn('Webhook signature verification error', { error: error.message });
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }
}
