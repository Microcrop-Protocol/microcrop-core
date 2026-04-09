import { payoutReceiver, provider, wallet } from '../../config/blockchain.js';
import { ethers } from 'ethers';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { addPayoutJob } from '../../workers/payout.worker.js';
import { DAMAGE_THRESHOLD } from '../../utils/constants.js';
import { env } from '../../config/env.js';

let pollingInterval = null;
let lastProcessedBlock = null;
const POLL_INTERVAL_MS = 15000; // Poll every 15 seconds
const GAP_WARNING_THRESHOLD = 5000; // ~2.5 hours on Base
const FRAUD_VERIFICATION_TIMEOUT_MS = 30000; // 30 seconds
const CONFIRMATION_DEPTH = 5; // Only process events with 5+ block confirmations
const CATCH_UP_BATCH_SIZE = 2000; // Larger batches when catching up from a gap

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
  return Math.max(0, currentBlock - 10);
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

  // --- Idempotency: skip if DamageAssessment with this txHash already exists ---
  const existingAssessment = await prisma.damageAssessment.findFirst({
    where: { txHash: event.transactionHash },
  });

  if (existingAssessment) {
    logger.info('DamageReportReceived already processed (idempotent skip)', {
      txHash: event.transactionHash,
      existingAssessmentId: existingAssessment.id,
    });
    return;
  }

  const policy = await prisma.policy.findFirst({
    where: { onChainPolicyId: policyId.toString() },
    include: { farmer: true, organization: true },
  });

  if (!policy) {
    logger.warn('No policy found for damage report', { policyId: policyId.toString() });
    return;
  }

  // V2 contracts emit damagePercentage in basis points (0-10000). Convert to percentage (0-100).
  const damagePercent = Number(damagePercentage) / 100;

  const assessment = await prisma.damageAssessment.create({
    data: {
      policyId: policy.id,
      organizationId: policy.organizationId,
      damagePercent,
      txHash: event.transactionHash,
      blockNumber: BigInt(event.blockNumber),
      source: 'ON_CHAIN',
    },
  });

  logger.info('Damage assessment recorded', {
    assessmentId: assessment.id,
    policyId: policy.id,
    damagePercent,
    damageBasisPoints: Number(damagePercentage),
  });

  // Blocking fraud verification — check BEFORE creating payout.
  // Fail-open: if fraud check fails or times out, proceed with payout.
  let fraudBlocked = false;
  try {
    const fraudTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Fraud verification timed out after 30s')), FRAUD_VERIFICATION_TIMEOUT_MS)
    );

    const fraudResult = await Promise.race([
      import('../../services/fraud.service.js').then(({ default: fraudService }) =>
        fraudService.verifyDamageAssessment(assessment.id)
      ),
      fraudTimeout,
    ]);

    // If fraud check returns a CRITICAL flag (score > 0.9), block automatic payout
    if (fraudResult?.confidenceScore > 0.9) {
      fraudBlocked = true;
      logger.warn('Fraud check returned CRITICAL score — payout requires manual review', {
        assessmentId: assessment.id,
        policyId: policy.id,
        confidenceScore: fraudResult.confidenceScore,
        flags: fraudResult.flags?.length || 0,
      });
    }
  } catch (err) {
    // Fail-open: proceed with payout on fraud check failure/timeout
    logger.warn('Fraud verification did not complete, proceeding with payout (fail-open)', {
      assessmentId: assessment.id,
      error: err.message,
    });
  }

  // If damage percentage meets threshold, create payout
  if (damagePercent >= DAMAGE_THRESHOLD) {
    // --- Idempotency: check if a payout already exists for this policy with PENDING/PROCESSING ---
    const existingPayout = await prisma.payout.findFirst({
      where: {
        policyId: policy.id,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (existingPayout) {
      logger.info('Payout already exists for policy (idempotent skip)', {
        existingPayoutId: existingPayout.id,
        policyId: policy.id,
        status: existingPayout.status,
      });
      return;
    }

    // Use the payoutAmount from the event (already calculated on-chain)
    const payoutAmountUSDC = Number(payoutAmount) / 1e6; // Convert from USDC decimals

    const payout = await prisma.payout.create({
      data: {
        policyId: policy.id,
        organizationId: policy.organizationId,
        farmerId: policy.farmerId,
        amountUSDC: payoutAmountUSDC,
        damagePercent,
        status: 'PENDING',
      },
    });

    // If fraud check flagged CRITICAL, leave payout in PENDING for manual review
    if (fraudBlocked) {
      logger.warn('Payout created in PENDING status for manual review (fraud CRITICAL)', {
        payoutId: payout.id,
        policyId: policy.id,
        amount: payoutAmountUSDC,
      });
      return;
    }

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

  // --- Idempotency: check if this txHash is already recorded on a payout ---
  const alreadyRecorded = await prisma.payout.findFirst({
    where: { txHash: event.transactionHash },
  });

  if (alreadyRecorded) {
    logger.info('PayoutInitiated already processed (idempotent skip)', {
      txHash: event.transactionHash,
      payoutId: alreadyRecorded.id,
    });
    return;
  }

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

async function checkGasBalance() {
  if (!wallet) return;

  try {
    const balance = await provider.getBalance(wallet.address);
    const ethBalance = parseFloat(ethers.formatEther(balance));

    if (ethBalance < 0.001) {
      logger.error('EMERGENCY: Platform wallet ETH balance critically low', {
        address: wallet.address,
        ethBalance,
      });
    } else if (ethBalance < 0.01) {
      logger.error('CRITICAL: Platform wallet ETH balance low', {
        address: wallet.address,
        ethBalance,
      });
    }
  } catch (error) {
    logger.warn('Failed to check gas balance', { error: error.message });
  }
}

async function pollEvents() {
  if (!payoutReceiver || !PAYOUT_RECEIVER_ADDRESS) return;

  // H-7: Check gas balance at the start of each poll cycle
  await checkGasBalance();

  try {
    const latestBlock = await provider.getBlockNumber();

    // H-5: Subtract CONFIRMATION_DEPTH to only process confirmed blocks
    const currentBlock = Math.max(0, latestBlock - CONFIRMATION_DEPTH);

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

    // Use larger batch size when catching up from a significant gap
    const batchSize = gap > 100 ? CATCH_UP_BATCH_SIZE : 9;

    const fromBlock = lastProcessedBlock;
    const toBlock = Math.min(currentBlock, fromBlock + batchSize);

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
