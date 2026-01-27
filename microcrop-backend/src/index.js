import app from './app.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';
import redis from './config/redis.js';

// Blockchain listeners (import but start conditionally)
import * as poolListener from './blockchain/listeners/pool.listener.js';
import * as policyListener from './blockchain/listeners/policy.listener.js';
import * as payoutListener from './blockchain/listeners/payout.listener.js';

// Workers
import { startPayoutWorker } from './workers/payout.worker.js';
import { startNotificationWorker } from './workers/notification.worker.js';

const server = app.listen(env.port, () => {
  logger.info(`MicroCrop backend started on port ${env.port}`, {
    env: env.nodeEnv,
    url: env.backendUrl,
  });
});

// Start blockchain event listeners
try {
  poolListener.start();
  policyListener.start();
  payoutListener.start();
  logger.info('Blockchain event listeners started');
} catch (error) {
  logger.warn('Blockchain listeners failed to start', { message: error.message });
}

// Start background workers
try {
  startPayoutWorker();
  startNotificationWorker();
  logger.info('Background workers started');
} catch (error) {
  logger.warn('Workers failed to start', { message: error.message });
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    poolListener.stop();
    policyListener.stop();
    payoutListener.stop();
  } catch {
    // listeners may not be running
  }

  try {
    await redis.quit();
    logger.info('Redis disconnected');
  } catch {
    // redis may not be connected
  }

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch {
    // db may not be connected
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { message: error.message, stack: error.stack });
  process.exit(1);
});
