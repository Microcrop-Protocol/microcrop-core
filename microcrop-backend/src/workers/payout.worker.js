import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import swyptService from '../services/swypt.service.js';
import logger from '../utils/logger.js';
import { PAYOUT_QUEUE_NAME } from '../utils/constants.js';

let payoutQueue = null;

export function startPayoutWorker() {
  payoutQueue = new Bull(PAYOUT_QUEUE_NAME, env.redisUrl);

  payoutQueue.process(async (job) => {
    const { payoutId, phoneNumber, amountUSDC } = job.data;

    logger.info('Processing payout job', { payoutId, amountUSDC });

    try {
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PROCESSING',
          processingAt: new Date(),
        },
      });

      const quote = await swyptService.getQuote('USDC', 'KES', amountUSDC);

      logger.info('Payout quote received', {
        payoutId,
        amountKES: quote.toAmount,
        exchangeRate: quote.exchangeRate,
      });

      const mpesaResult = await swyptService.sendMpesaPayout(
        phoneNumber,
        quote.toAmount,
        `payout-${payoutId}`
      );

      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'COMPLETED',
          amountKES: parseFloat(quote.toAmount),
          exchangeRate: parseFloat(quote.exchangeRate),
          mpesaRef: mpesaResult.transactionId,
          completedAt: new Date(),
        },
      });

      await prisma.transaction.create({
        data: {
          reference: `payout-${payoutId}`,
          type: 'PAYOUT',
          status: 'COMPLETED',
          amount: parseFloat(quote.toAmount),
          currency: 'KES',
          phoneNumber,
          organizationId: job.data.organizationId || undefined,
          policyId: job.data.policyId || undefined,
          externalRef: mpesaResult.transactionId,
          completedAt: new Date(),
        },
      });

      logger.info('Payout completed', {
        payoutId,
        mpesaRef: mpesaResult.transactionId,
        amountKES: quote.toAmount,
      });
    } catch (error) {
      logger.error('Payout processing failed', { payoutId, error: error.message });

      const payout = await prisma.payout.findUnique({ where: { id: payoutId } });

      if (payout) {
        const newRetryCount = (payout.retryCount || 0) + 1;

        if (newRetryCount >= 3) {
          await prisma.payout.update({
            where: { id: payoutId },
            data: {
              status: 'FAILED',
              retryCount: newRetryCount,
              failureReason: error.message,
              failedAt: new Date(),
            },
          });

          logger.error('Payout permanently failed after max retries', { payoutId });
        } else {
          await prisma.payout.update({
            where: { id: payoutId },
            data: {
              retryCount: newRetryCount,
              failureReason: error.message,
            },
          });

          throw error; // Re-throw to let Bull retry
        }
      }
    }
  });

  payoutQueue.on('failed', (job, err) => {
    logger.error('Payout job failed', {
      jobId: job.id,
      payoutId: job.data.payoutId,
      error: err.message,
      attemptsMade: job.attemptsMade,
    });
  });

  payoutQueue.on('completed', (job) => {
    logger.info('Payout job completed', {
      jobId: job.id,
      payoutId: job.data.payoutId,
    });
  });

  logger.info('Payout worker started');
}

export async function addPayoutJob(data) {
  if (!payoutQueue) {
    logger.warn('Payout queue not initialized - job not added');
    return;
  }

  await payoutQueue.add(data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
  });

  logger.info('Payout job added to queue', { payoutId: data.payoutId });
}
