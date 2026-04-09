import redis from '../config/redis.js';
import logger from '../utils/logger.js';

function createLimiter({ windowMs, max, keyPrefix = 'global' }) {
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const key = `rate_limit:${keyPrefix}:${identifier}`;

    try {
      // Atomic INCR + EXPIRE via pipeline
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, windowSec);
      const results = await pipeline.exec();
      const count = results[0][1];

      // Get remaining TTL for headers
      const ttl = await redis.ttl(key);
      const resetAt = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      res.set('X-RateLimit-Reset', String(resetAt));

      if (count > max) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: {
              limit: max,
              retryAfter: Math.max(ttl, 1),
            },
          },
        });
      }

      next();
    } catch (err) {
      // Fail open — if Redis is down, allow the request
      logger.warn('Rate limiter Redis error, allowing request', {
        key,
        error: err.message,
      });
      next();
    }
  };
}

export const authLimiter = createLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  keyPrefix: 'auth',
});

export const apiLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyPrefix: 'api',
});

export const paymentLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyPrefix: 'payment',
});

export const ussdLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyPrefix: 'ussd',
});

export const webhookLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyPrefix: 'webhook',
});

export const internalLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  keyPrefix: 'internal',
});
