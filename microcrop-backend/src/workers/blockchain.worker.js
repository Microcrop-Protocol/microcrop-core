import Bull from 'bull';
import { env } from '../config/env.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { createPolicyOnChain } from '../blockchain/writers/policy.writer.js';
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

  const { onChainPolicyId, txHash, blockNumber } = await createPolicyOnChain({
    farmerAddress,
    plotId: policy.plotId,
    sumInsured: Number(policy.sumInsured),
    premium: Number(policy.premium),
    durationDays: policy.durationDays,
    coverageType: 4, // COMPREHENSIVE
  });

  await prisma.policy.update({
    where: { id: policyId },
    data: {
      status: 'ACTIVE',
      onChainPolicyId,
      txHash,
      blockNumber: BigInt(blockNumber),
    },
  });

  logger.info('Blockchain retry: policy activated on-chain', {
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
