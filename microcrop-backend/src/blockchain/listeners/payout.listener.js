import { payoutReceiver, provider } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { addPayoutJob } from '../../workers/payout.worker.js';
import { DAMAGE_THRESHOLD } from '../../utils/constants.js';
import { env } from '../../config/env.js';

let pollingInterval = null;
let lastProcessedBlock = null;
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds
const GAP_WARNING_THRESHOLD = 5000; // ~2.5 hours on Base

// Use payout receiver address as the sync state key
const PAYOUT_RECEIVER_ADDRESS = env.isDev
  ? env.contractPayoutReceiverDev
  : env.contractPayoutReceiver;

async function getStartBlock() {
  if (!PAYOUT_RECEIVER_ADDRESS) return null;

  const syncState = await prisma.syncState.findUnique({
    where: { contractAddress: PAYOUT_RECEIVER_ADDRESS.toLowerCase() },
  });

  if (syncState?.lastBlock) {
    return Number(syncState.lastBlock) + 1;
  }

  const currentBlock = await provider.getBlockNumber();
  return Math.max(0, currentBlock - 1800);
}

async function handleDamageReportEvent(event) {
  // New event args: policyId (indexed), damagePercentage, payoutAmount, farmer (indexed)
  const { policyId, damagePercentage, payoutAmount, farmer } = event.args;

  logger.info('DamageReportReceived event', {
    policyId: policyId.toString(),
    damagePercentage: damagePercentage.toString(),
    payoutAmount: payoutAmount.toString(),
    farmer,
    blockNumber: event.blockNumber,
  });

  const policy = await prisma.policy.findFirst({
    where: { onChainPolicyId: policyId.toString() },
    include: { farmer: true, organization: true },
  });

  if (!policy) {
    logger.warn('No policy found for damage report', { policyId: policyId.toString() });
    return;
  }

  const assessment = await prisma.damageAssessment.create({
    data: {
      policyId: policy.id,
      organizationId: policy.organizationId,
      damagePercent: Number(damagePercentage),
      txHash: event.transactionHash,
      blockNumber: BigInt(event.blockNumber),
      source: 'ON_CHAIN',
    },
  });

  logger.info('Damage assessment recorded', {
    assessmentId: assessment.id,
    policyId: policy.id,
    damagePercent: Number(damagePercentage),
  });

  // If damage percentage meets threshold, create payout
  if (Number(damagePercentage) >= DAMAGE_THRESHOLD) {
    // Use the payoutAmount from the event (already calculated on-chain)
    const payoutAmountUSDC = Number(payoutAmount) / 1e6; // Convert from USDC decimals

    const payout = await prisma.payout.create({
      data: {
        policyId: policy.id,
        organizationId: policy.organizationId,
        farmerId: policy.farmerId,
        amountUSDC: payoutAmountUSDC,
        damagePercent: Number(damagePercentage),
        status: 'PENDING',
      },
    });

    await addPayoutJob({
      payoutId: payout.id,
      policyId: policy.id,
      organizationId: policy.organizationId,
      farmerId: policy.farmerId,
      phoneNumber: policy.farmer.phoneNumber,
      amountUSDC: payoutAmountUSDC,
    });

    logger.info('Payout job queued', {
      payoutId: payout.id,
      policyId: policy.id,
      amount: payoutAmountUSDC,
    });
  }
}

async function handlePayoutInitiatedEvent(event) {
  // New event args: policyId (indexed), amount
  const { policyId, amount } = event.args;

  logger.info('PayoutInitiated event received', {
    policyId: policyId.toString(),
    amount: amount.toString(),
    blockNumber: event.blockNumber,
  });

  const policy = await prisma.policy.findFirst({
    where: { onChainPolicyId: policyId.toString() },
  });

  if (!policy) {
    logger.warn('No policy found for payout initiated event', {
      policyId: policyId.toString(),
    });
    return;
  }

  const payout = await prisma.payout.findFirst({
    where: { policyId: policy.id, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (payout) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        txHash: event.transactionHash,
        blockNumber: BigInt(event.blockNumber),
        status: 'PROCESSING',
      },
    });

    logger.info('Payout marked as processing with on-chain data', {
      payoutId: payout.id,
      txHash: event.transactionHash,
    });
  }
}

async function pollEvents() {
  if (!payoutReceiver || !PAYOUT_RECEIVER_ADDRESS) return;

  try {
    const currentBlock = await provider.getBlockNumber();

    if (lastProcessedBlock === null) {
      lastProcessedBlock = await getStartBlock();
    }

    if (lastProcessedBlock >= currentBlock) {
      return;
    }

    // Warn if there's a large gap (possible missed events during downtime)
    const gap = currentBlock - lastProcessedBlock;
    if (gap > GAP_WARNING_THRESHOLD) {
      logger.warn('Payout listener: large block gap detected', {
        lastProcessedBlock,
        currentBlock,
        gap,
        estimatedHoursBehind: Math.round(gap * 2 / 3600 * 10) / 10,
      });
    }

    const fromBlock = lastProcessedBlock;
    const toBlock = Math.min(currentBlock, fromBlock + 2000);

    // Poll for DamageReportReceived events
    const damageFilter = payoutReceiver.filters.DamageReportReceived();
    const damageEvents = await payoutReceiver.queryFilter(damageFilter, fromBlock, toBlock);

    for (const event of damageEvents) {
      try {
        await handleDamageReportEvent(event);
      } catch (error) {
        logger.error('Error handling DamageReportReceived event', {
          error: error.message,
          txHash: event.transactionHash,
        });
      }
    }

    // Poll for PayoutInitiated events (new event name in updated ABI)
    const payoutFilter = payoutReceiver.filters.PayoutInitiated();
    const payoutEvents = await payoutReceiver.queryFilter(payoutFilter, fromBlock, toBlock);

    for (const event of payoutEvents) {
      try {
        await handlePayoutInitiatedEvent(event);
      } catch (error) {
        logger.error('Error handling PayoutInitiated event', {
          error: error.message,
          txHash: event.transactionHash,
        });
      }
    }

    // Update sync state after processing
    await prisma.syncState.upsert({
      where: { contractAddress: PAYOUT_RECEIVER_ADDRESS.toLowerCase() },
      update: {
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
      create: {
        contractAddress: PAYOUT_RECEIVER_ADDRESS.toLowerCase(),
        contractName: 'PayoutReceiver',
        lastBlock: BigInt(toBlock),
        lastSyncAt: new Date(),
      },
    });

    lastProcessedBlock = toBlock + 1;
  } catch (error) {
    if (error.code === 'NETWORK_ERROR' || error.message?.includes('filter')) {
      logger.debug('Payout listener network issue, will retry', { error: error.message });
    } else {
      logger.error('Error polling payout events', { error: error.message });
    }
  }
}

export async function start() {
  if (!payoutReceiver) {
    logger.warn('PayoutReceiver contract not configured - payout listener skipped');
    return;
  }

  // Initial poll
  await pollEvents();

  // Start polling interval
  pollingInterval = setInterval(pollEvents, POLL_INTERVAL_MS);

  logger.info('Payout listener started (polling mode)');
}

export function stop() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  lastProcessedBlock = null;
  logger.info('Payout listener stopped');
}
