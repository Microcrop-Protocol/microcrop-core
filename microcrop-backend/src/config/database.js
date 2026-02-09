import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

// Append connection pool params if not already present
const rawUrl = process.env.DATABASE_URL || '';
if (rawUrl && !rawUrl.includes('connection_limit')) {
  const separator = rawUrl.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${rawUrl}${separator}connection_limit=20&pool_timeout=30`;
}

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
    ...(process.env.NODE_ENV === 'development'
      ? [{ emit: 'event', level: 'query' }]
      : []),
  ],
});

prisma.$on('error', (e) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning', { message: e.message });
});

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Prisma query', { query: e.query, duration: `${e.duration}ms` });
  });
}

export default prisma;
