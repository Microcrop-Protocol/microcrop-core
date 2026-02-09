import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import paymentProviderService, { PROVIDERS } from '../services/payment-provider.service.js';
import { transferToSettlementWallet } from '../blockchain/writers/pretium.writer.js';
import { withdrawToEscrow } from '../blockchain/writers/swypt.writer.js';
import logger from '../utils/logger.js';
import { PAYOUT_QUEUE_NAME } from '../utils/constants.js';

let payoutQueue = null;

// Get USDC address based on environment
function getUsdcAddress() {
  return env.isDev ? env.contractUsdcDev : env.contractUsdc || env.contractUsdcDev;
}

export function startPayoutWorker() {
  payoutQueue = new Bull(PAYOUT_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: false,
    },
  });

  payoutQueue.process(async (job) => {
    const { payoutId, phoneNumber, amountUSDC, policyId, organizationId } = job.data;

    logger.info('Processing payout job', { payoutId, amountUSDC, phoneNumber });

    try {
      // 1. Mark as processing
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PROCESSING',
          processingAt: new Date(),
          mpesaPhone: phoneNumber,
        },
      });

      // 2. Get active provider
      const activeProvider = paymentProviderService.getActiveProvider();
      logger.info('Using payment provider for offramp', { provider: activeProvider, payoutId });

      // 3. Get offramp quote for KES conversion
      const quote = await paymentProviderService.getOfframpQuote(amountUSDC, 'USDC', 'KES');

      logger.info('Payout offramp quote received', {
        payoutId,
        amountUSDC,
        amountKES: quote.outputAmount,
        exchangeRate: quote.exchangeRate,
        provider: quote.provider,
      });

      // 4. Update payout with quote info
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          exchangeRate: parseFloat(quote.exchangeRate),
          amountKES: parseFloat(quote.outputAmount),
        },
      });

      // 5. Transfer USDC to provider (different methods for each provider)
      let transferResult;
      const usdcAddress = getUsdcAddress();

      if (activeProvider === PROVIDERS.PRETIUM) {
        // Pretium: Simple ERC20 transfer to settlement wallet
        transferResult = await transferToSettlementWallet(amountUSDC, 'Base');

        logger.info('USDC transferred to Pretium settlement wallet', {
          payoutId,
          txHash: transferResult.hash,
          settlementWallet: transferResult.settlementWallet,
        });
      } else {
        // Swypt: Contract-based escrow withdrawal
        if (!usdcAddress) {
          throw new Error('USDC contract address not configured');
        }

        transferResult = await withdrawToEscrow(usdcAddress, amountUSDC);

        logger.info('USDC withdrawn to Swypt escrow', {
          payoutId,
          txHash: transferResult.hash,
          nonce: transferResult.nonce,
        });
      }

      // 6. Update payout with transfer info
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          txHash: transferResult.hash,
          blockNumber: BigInt(transferResult.blockNumber),
        },
      });

      // 7. Initiate offramp via provider API
      // Pretium expects KES amount, Swypt works with the tx hash
      const amountForProvider = activeProvider === PROVIDERS.PRETIUM
        ? parseFloat(quote.outputAmount) // KES for Pretium
        : amountUSDC; // USDC amount (not really used by Swypt, but for reference)

      const offrampResult = await paymentProviderService.initiateOfframp(
        phoneNumber,
        amountForProvider,
        transferResult.hash,
        usdcAddress,
        `payout-${payoutId}`,
        activeProvider // Force same provider as the transfer
      );

      logger.info('Offramp initiated', {
        payoutId,
        provider: offrampResult.provider,
        orderId: offrampResult.orderId,
      });

      // 8. Update payout with provider order ID
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          swyptOrderId: offrampResult.orderId,
        },
      });

      // 9. Poll for offramp completion (with timeout)
      const maxAttempts = 30; // 5 minutes with 10s intervals
      let attempts = 0;
      let offrampStatus = null;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;

        try {
          offrampStatus = await paymentProviderService.checkOfframpStatus(
            offrampResult.orderId,
            offrampResult.provider
          );

          if (offrampStatus.status === 'SUCCESS' || offrampStatus.status === 'COMPLETED' || offrampStatus.status === 'COMPLETE') {
            logger.info('Offramp completed', {
              payoutId,
              mpesaRef: offrampStatus.mpesaRef,
              provider: offrampResult.provider,
            });
            break;
          } else if (offrampStatus.status === 'FAILED') {
            throw new Error('Offramp failed: ' + (offrampStatus.reason || 'Unknown error'));
          }

          logger.debug('Offramp still processing', {
            payoutId,
            status: offrampStatus.status,
            attempt: attempts,
          });
        } catch (pollError) {
          logger.warn('Error polling offramp status', {
            payoutId,
            error: pollError.message,
            attempt: attempts,
          });
        }
      }

      // 10. Finalize payout
      const isComplete = offrampStatus &&
        (offrampStatus.status === 'SUCCESS' || offrampStatus.status === 'COMPLETED' || offrampStatus.status === 'COMPLETE');

      if (isComplete) {
        await prisma.payout.update({
          where: { id: payoutId },
          data: {
            status: 'COMPLETED',
            mpesaRef: offrampStatus.mpesaRef,
            completedAt: new Date(),
          },
        });

        // Create transaction record
        await prisma.transaction.create({
          data: {
            reference: `payout-${payoutId}`,
            type: 'PAYOUT',
            status: 'COMPLETED',
            amount: parseFloat(quote.outputAmount),
            currency: 'KES',
            phoneNumber,
            organizationId: organizationId || undefined,
            policyId: policyId || undefined,
            externalRef: offrampStatus.mpesaRef,
            completedAt: new Date(),
            metadata: {
              provider: offrampResult.provider,
              orderId: offrampResult.orderId,
              amountUSDC: amountUSDC,
              exchangeRate: quote.exchangeRate,
            },
          },
        });

        logger.info('Payout completed successfully', {
          payoutId,
          mpesaRef: offrampStatus.mpesaRef,
          amountKES: quote.outputAmount,
          provider: offrampResult.provider,
        });
      } else {
        // Payout is still processing - will be completed via webhook or manual check
        logger.info('Payout submitted, awaiting M-Pesa confirmation', {
          payoutId,
          orderId: offrampResult.orderId,
          provider: offrampResult.provider,
        });
      }
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

  payoutQueue.on('stalled', (job) => {
    logger.warn('Payout job stalled', {
      jobId: job.id,
      payoutId: job.data?.payoutId,
    });
  });

  logger.info('Payout worker started');
}

export function getPayoutQueue() {
  return payoutQueue;
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

/**
 * Check and complete pending offramp payouts
 * Called by cron job to finalize payouts that didn't complete in initial polling
 */
export async function checkPendingPayouts() {
  const pendingPayouts = await prisma.payout.findMany({
    where: {
      status: 'PROCESSING',
      swyptOrderId: { not: null },
      processingAt: {
        lte: new Date(Date.now() - 5 * 60 * 1000),
      },
    },
    take: 50,
  });

  for (const payout of pendingPayouts) {
    try {
      // Try to determine provider from transaction metadata
      const transaction = await prisma.transaction.findFirst({
        where: { reference: `payout-${payout.id}` },
      });
      const provider = transaction?.metadata?.provider;

      const status = await paymentProviderService.checkOfframpStatus(payout.swyptOrderId, provider);

      const isComplete = status.status === 'SUCCESS' || status.status === 'COMPLETED' || status.status === 'COMPLETE';

      if (isComplete) {
        await prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'COMPLETED',
            mpesaRef: status.mpesaRef,
            completedAt: new Date(),
          },
        });

        logger.info('Pending payout marked complete', {
          payoutId: payout.id,
          mpesaRef: status.mpesaRef,
        });
      } else if (status.status === 'FAILED') {
        await prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureReason: 'Offramp failed',
            failedAt: new Date(),
          },
        });

        logger.error('Pending payout failed', { payoutId: payout.id });
      }
    } catch (error) {
      logger.warn('Error checking pending payout status', {
        payoutId: payout.id,
        error: error.message,
      });
    }
  }
}
