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

      // 3. Lock exchange rate: reuse stored rate from previous attempt, or fetch fresh
      const existingPayout = await prisma.payout.findUnique({ where: { id: payoutId } });
      let lockedRate = existingPayout?.exchangeRate ? parseFloat(existingPayout.exchangeRate) : null;
      let lockedAmountKES = existingPayout?.amountKES ? parseFloat(existingPayout.amountKES) : null;

      // Fetch a fresh quote for comparison or initial rate
      const quote = await paymentProviderService.getOfframpQuote(amountUSDC, 'USDC', 'KES');
      const freshRate = parseFloat(quote.exchangeRate);

      if (lockedRate) {
        // Rate was stored from a previous attempt — check slippage but use stored rate
        const drift = Math.abs(freshRate - lockedRate) / lockedRate;
        if (drift > 0.05) {
          logger.warn('Exchange rate drifted >5% from locked rate', {
            payoutId,
            lockedRate,
            freshRate,
            driftPercent: (drift * 100).toFixed(2),
          });
        }
        // Proceed with previously locked rate
        logger.info('Using previously locked exchange rate', {
          payoutId,
          lockedRate,
          freshRate,
        });
      } else {
        // First attempt — lock the fresh rate
        lockedRate = freshRate;
        lockedAmountKES = parseFloat(quote.outputAmount);
      }

      logger.info('Payout offramp quote received', {
        payoutId,
        amountUSDC,
        amountKES: lockedAmountKES,
        exchangeRate: lockedRate,
        provider: quote.provider,
      });

      // 4. Update payout with locked rate info
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          exchangeRate: lockedRate,
          amountKES: lockedAmountKES,
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
        ? lockedAmountKES // KES for Pretium (use locked rate, not fresh quote)
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

      // 9. Quick status check — do NOT poll in a long loop to avoid Bull job stalling.
      //    The checkPendingPayouts cron will finalize payouts that are still PROCESSING.
      let offrampStatus = null;

      try {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Brief wait for fast completions
        offrampStatus = await paymentProviderService.checkOfframpStatus(
          offrampResult.orderId,
          offrampResult.provider
        );
      } catch (pollError) {
        logger.warn('Initial offramp status check failed', {
          payoutId,
          error: pollError.message,
        });
      }

      // 10. Finalize payout if already complete, otherwise leave for cron
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
            amount: lockedAmountKES,
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
              exchangeRate: lockedRate,
            },
          },
        });

        logger.info('Payout completed successfully', {
          payoutId,
          mpesaRef: offrampStatus.mpesaRef,
          amountKES: lockedAmountKES,
          provider: offrampResult.provider,
        });
      } else if (offrampStatus && offrampStatus.status === 'FAILED') {
        throw new Error('Offramp failed: ' + (offrampStatus.reason || 'Unknown error'));
      } else {
        // Payout still processing — job completes successfully here.
        // The checkPendingPayouts cron will finalize it.
        logger.info('Payout submitted, awaiting M-Pesa confirmation via cron', {
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
        lte: new Date(Date.now() - 30 * 1000), // 30 seconds after processing started
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

        // Create transaction record if it doesn't already exist
        const existingTx = await prisma.transaction.findFirst({
          where: { reference: `payout-${payout.id}` },
        });

        if (!existingTx) {
          await prisma.transaction.create({
            data: {
              reference: `payout-${payout.id}`,
              type: 'PAYOUT',
              status: 'COMPLETED',
              amount: parseFloat(payout.amountKES || 0),
              currency: 'KES',
              phoneNumber: payout.mpesaPhone,
              organizationId: payout.organizationId || undefined,
              policyId: payout.policyId || undefined,
              externalRef: status.mpesaRef,
              completedAt: new Date(),
              metadata: {
                provider: provider,
                orderId: payout.swyptOrderId,
                amountUSDC: parseFloat(payout.amountUSDC),
                exchangeRate: payout.exchangeRate ? parseFloat(payout.exchangeRate) : null,
              },
            },
          });
        }

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
