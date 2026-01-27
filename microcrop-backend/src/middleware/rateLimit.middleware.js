const stores = new Map();

function createLimiter({ windowMs, max, keyPrefix = 'global' }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.headers['x-api-key'] || req.ip}`;
    const now = Date.now();

    if (!stores.has(key)) {
      stores.set(key, { count: 0, resetAt: now + windowMs });
    }

    const record = stores.get(key);

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          details: {
            limit: max,
            retryAfter: Math.ceil((record.resetAt - now) / 1000),
          },
        },
      });
    }

    next();
  };
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of stores) {
    if (now > record.resetAt + 60000) {
      stores.delete(key);
    }
  }
}, 60000);

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
