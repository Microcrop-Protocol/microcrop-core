import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { createPolicyOnChain, activatePolicy, cancelPolicy } from '../blockchain/writers/policy.writer.js';
import { receivePremium, distributePremiumToPool } from '../blockchain/writers/treasury.writer.js';
import { addNotificationJob } from './notification.worker.js';
import { BLOCKCHAIN_RETRY_QUEUE_NAME } from '../utils/constants.js';

let blockchainRetryQueue = null;

/**
 * Start the blockchain retry worker.
 * Processes failed on-chain operations (e.g., policy creation after payment).
 */
export function startBlockchainRetryWorker() {
  blockchainRetryQueue = new Bull(BLOCKCHAIN_RETRY_QUEUE_NAME, env.redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: false, // Keep failed jobs for audit
    },
  });

  blockchainRetryQueue.process(async (job) => {
    const { type, policyId } = job.data;

    logger.info('Processing blockchain retry job', { type, policyId, attempt: job.attemptsMade + 1 });

    if (type === 'CREATE_POLICY') {
      await processCreatePolicy(policyId);
    } else if (type === 'CANCEL_POLICY') {
      await processCancelPolicy(policyId);
    } else {
      logger.warn('Unknown blockchain retry job type', { type });
    }
  });

  blockchainRetryQueue.on('failed', (job, error) => {
    logger.error('Blockchain retry job failed', {
      jobId: job.id,
      type: job.data.type,
      policyId: job.data.policyId,
      attempt: job.attemptsMade,
      error: error.message,
    });
  });

  blockchainRetryQueue.on('completed', (job) => {
    logger.info('Blockchain retry job completed', {
      jobId: job.id,
      type: job.data.type,
      policyId: job.data.policyId,
    });
  });

  blockchainRetryQueue.on('stalled', (job) => {
    logger.warn('Blockchain retry job stalled', {
      jobId: job.id,
      type: job.data?.type,
      policyId: job.data?.policyId,
    });
  });

  logger.info('Blockchain retry worker started');
}

/**
 * Process a CREATE_POLICY retry job.
 * Loads the policy, checks idempotency, creates on-chain, updates DB.
 * Uses checkpoint tracking so retries resume from the correct step.
 */
async function processCreatePolicy(policyId) {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
    include: { organization: true, farmer: true },
  });

  if (!policy) {
    logger.warn('Blockchain retry: policy not found, skipping', { policyId });
    return;
  }

  // Idempotency: skip if already active on-chain
  if (policy.status === 'ACTIVE' && policy.onChainPolicyId) {
    logger.info('Blockchain retry: policy already active, skipping', { policyId });
    return;
  }

  // Only retry if premium was paid but policy isn't active
  if (!policy.premiumPaid) {
    logger.warn('Blockchain retry: premium not paid, skipping', { policyId });
    return;
  }

  if (!policy.organization?.poolAddress) {
    throw new Error(`Organization ${policy.organizationId} has no pool address`);
  }

  const farmerAddress = policy.farmer?.walletAddress || env.backendWallet;

  if (!farmerAddress) {
    throw new Error('No farmer wallet or backend wallet configured');
  }

  const poolAddress = policy.organization.poolAddress;
  const distributorAddress = policy.organization.walletAddress || env.backendWallet;
  const distributorName = policy.organization.name || 'MicroCrop';

  // Determine which step to resume from based on checkpoint fields.
  // onChainPolicyId non-null means step 1 completed.
  // premiumReceivedOnChain true means step 2 completed.
  // premiumDistributedOnChain true means step 3 completed.
  let onChainPolicyId = policy.onChainPolicyId;
  let txHash = policy.txHash;
  let blockNumber = policy.blockNumber;

  // Step 1: Create PENDING policy on-chain (skip if already done)
  if (!onChainPolicyId) {
    logger.info('Blockchain retry: executing step 1 — createPolicyOnChain', { policyId });

    const result = await createPolicyOnChain({
      farmerAddress,
      plotId: policy.plotId,
      sumInsured: Number(policy.sumInsured),
      premium: Number(policy.premium),
      durationDays: policy.durationDays,
      coverageType: 4, // COMPREHENSIVE
    });

    onChainPolicyId = result.onChainPolicyId;
    txHash = result.txHash;
    blockNumber = result.blockNumber;

    // Checkpoint: persist onChainPolicyId immediately so retries skip step 1
    await prisma.policy.update({
      where: { id: policyId },
      data: {
        onChainPolicyId,
        txHash,
        blockNumber: BigInt(blockNumber),
      },
    });

    logger.info('Blockchain retry: step 1 checkpoint saved', { policyId, onChainPolicyId });
  } else {
    logger.info('Blockchain retry: step 1 already completed, resuming', { policyId, onChainPolicyId });
  }

  // Step 2: Record premium in Treasury (skip if already done)
  if (!policy.premiumReceivedOnChain) {
    logger.info('Blockchain retry: executing step 2 — receivePremium', { policyId, onChainPolicyId });

    await receivePremium(onChainPolicyId, Number(policy.premium));

    // Checkpoint: mark premium received
    await prisma.policy.update({
      where: { id: policyId },
      data: { premiumReceivedOnChain: true },
    });

    logger.info('Blockchain retry: step 2 checkpoint saved', { policyId });
  } else {
    logger.info('Blockchain retry: step 2 already completed, resuming', { policyId });
  }

  // Step 3: Distribute premium to RiskPool (skip if already done)
  if (!policy.premiumDistributedOnChain) {
    logger.info('Blockchain retry: executing step 3 — distributePremiumToPool', { policyId, onChainPolicyId });

    await distributePremiumToPool(poolAddress, onChainPolicyId, Number(policy.premium), distributorAddress);

    // Checkpoint: mark premium distributed
    await prisma.policy.update({
      where: { id: policyId },
      data: { premiumDistributedOnChain: true },
    });

    logger.info('Blockchain retry: step 3 checkpoint saved', { policyId });
  } else {
    logger.info('Blockchain retry: step 3 already completed, resuming', { policyId });
  }

  // Step 4: Activate policy + mint NFT
  logger.info('Blockchain retry: executing step 4 — activatePolicy', { policyId, onChainPolicyId });

  await activatePolicy(onChainPolicyId, distributorAddress, distributorName, 'Africa', poolAddress);

  await prisma.policy.update({
    where: { id: policyId },
    data: {
      status: 'ACTIVE',
    },
  });

  logger.info('Blockchain retry: policy activated on-chain (V2 flow)', {
    policyId,
    onChainPolicyId,
    txHash,
  });

  // Notify farmer
  if (policy.farmer?.phoneNumber) {
    addNotificationJob({
      type: 'POLICY_ACTIVATED',
      phoneNumber: policy.farmer.phoneNumber,
      message: `Your policy ${policy.policyNumber} is now active! Coverage starts immediately.`,
    }).catch((err) => logger.warn('Failed to queue activation SMS', { error: err.message }));
  }
}

/**
 * Process a CANCEL_POLICY retry job.
 * Cancels an on-chain policy when it has been cancelled off-chain.
 */
async function processCancelPolicy(policyId) {
  const policy = await prisma.policy.findUnique({
    where: { id: policyId },
  });

  if (!policy) {
    logger.warn('Blockchain retry: policy not found for cancellation, skipping', { policyId });
    return;
  }

  if (!policy.onChainPolicyId) {
    logger.info('Blockchain retry: policy has no on-chain ID, skipping cancellation', { policyId });
    return;
  }

  await cancelPolicy(policy.onChainPolicyId);

  logger.info('Blockchain retry: policy cancelled on-chain', {
    policyId,
    onChainPolicyId: policy.onChainPolicyId,
  });
}

/**
 * Add a job to the blockchain retry queue.
 */
export async function addBlockchainRetryJob(data) {
  if (!blockchainRetryQueue) {
    logger.warn('Blockchain retry queue not initialized, skipping job', data);
    return;
  }

  await blockchainRetryQueue.add(data, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30s, 60s, 120s, 240s, 480s
    },
  });

  logger.info('Blockchain retry job queued', data);
}

export function getBlockchainRetryQueue() {
  return blockchainRetryQueue;
}
