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
import { startPayoutWorker, getPayoutQueue } from './workers/payout.worker.js';
import { startNotificationWorker, getNotificationQueue } from './workers/notification.worker.js';
import { startBlockchainRetryWorker, getBlockchainRetryQueue } from './workers/blockchain.worker.js';

const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds forced exit

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
  startBlockchainRetryWorker();
  logger.info('Background workers started');
} catch (error) {
  logger.warn('Workers failed to start', { message: error.message });
}

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received. Shutting down gracefully...`);

  // Force exit after timeout
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  // Stop accepting new connections
  await new Promise((resolve) => {
    server.close(() => {
      logger.info('HTTP server closed');
      resolve();
    });
  });

  // Stop blockchain listeners
  try {
    poolListener.stop();
    policyListener.stop();
    payoutListener.stop();
    logger.info('Blockchain listeners stopped');
  } catch {
    // listeners may not be running
  }

  // Close Bull queues (let in-flight jobs finish)
  try {
    const payoutQueue = getPayoutQueue();
    const notificationQueue = getNotificationQueue();
    const blockchainRetryQueue = getBlockchainRetryQueue();
    const closePromises = [];
    if (payoutQueue) closePromises.push(payoutQueue.close());
    if (notificationQueue) closePromises.push(notificationQueue.close());
    if (blockchainRetryQueue) closePromises.push(blockchainRetryQueue.close());
    if (closePromises.length > 0) {
      await Promise.all(closePromises);
      logger.info('Bull queues closed');
    }
  } catch {
    // queues may not be initialized
  }

  // Disconnect Redis
  try {
    await redis.quit();
    logger.info('Redis disconnected');
  } catch {
    // redis may not be connected
  }

  // Disconnect database
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch {
    // db may not be connected
  }

  clearTimeout(forceExitTimer);
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
