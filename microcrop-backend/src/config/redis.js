import Redis from 'ioredis';
import logger from '../utils/logger.js';
import { env } from './env.js';

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error', { message: err.message });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export default redis;
