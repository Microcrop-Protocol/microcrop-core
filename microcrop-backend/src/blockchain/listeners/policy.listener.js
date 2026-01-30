import { getRiskPoolContract } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

const activeListeners = [];

export async function start() {
  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      poolAddress: { not: null },
    },
  });

  for (const org of organizations) {
    try {
      const riskPool = getRiskPoolContract(org.poolAddress);

      riskPool.on('PolicyCreated', async (policyId, orgAddress, premium, platformFee, eventObj) => {
        try {
          const txHash = eventObj.log.transactionHash;
          const blockNumber = eventObj.log.blockNumber;

          logger.info('PolicyCreated event received', {
            policyId: policyId.toString(),
            organization: orgAddress,
            premium: premium.toString(),
            platformFee: platformFee.toString(),
            txHash,
          });

          // First try to find policy by txHash (most reliable)
          let policy = await prisma.policy.findFirst({
            where: {
              organizationId: org.id,
              txHash: txHash,
            },
          });

          // If not found by txHash, try finding ACTIVE policy without onChainPolicyId
          // (policy was marked ACTIVE by payment callback but event hasn't been processed yet)
          if (!policy) {
            policy = await prisma.policy.findFirst({
              where: {
                organizationId: org.id,
                status: 'ACTIVE',
                premiumPaid: true,
                onChainPolicyId: null,
                txHash: null,
              },
              orderBy: { premiumPaidAt: 'desc' },
            });
          }

          // Fall back to most recent PENDING policy (legacy behavior)
          if (!policy) {
            policy = await prisma.policy.findFirst({
              where: {
                organizationId: org.id,
                status: 'PENDING',
              },
              orderBy: { createdAt: 'desc' },
            });
          }

          if (!policy) {
            logger.warn('No policy found for PolicyCreated event', {
              organizationId: org.id,
              policyId: policyId.toString(),
              txHash,
            });
            return;
          }

          // Update policy with on-chain data
          await prisma.policy.update({
            where: { id: policy.id },
            data: {
              onChainPolicyId: policyId.toString(),
              policyId: policyId.toString(),
              status: 'ACTIVE',
              txHash: txHash,
              blockNumber: BigInt(blockNumber),
            },
          });

          // Record platform fee
          await prisma.platformFee.create({
            data: {
              organizationId: org.id,
              policyId: policy.id,
              poolAddress: org.poolAddress,
              premium: parseFloat(premium.toString()) / 1e6, // Convert from wei to USDC
              feeAmount: parseFloat(platformFee.toString()) / 1e6,
              feePercent: 5, // Platform fee percentage
              txHash: txHash,
              blockNumber: BigInt(blockNumber),
            },
          });

          // Update organization stats
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              totalPoliciesCreated: { increment: 1 },
              totalPremiumsCollected: { increment: parseFloat(premium.toString()) / 1e6 },
              lastPolicyCreatedAt: new Date(),
            },
          });

          logger.info('Policy activated on-chain', {
            policyId: policy.id,
            onChainPolicyId: policyId.toString(),
            txHash,
          });
        } catch (error) {
          logger.error('Error handling PolicyCreated event', { error: error.message });
        }
      });

      activeListeners.push(riskPool);
      logger.info('Policy listener started for organization', {
        organizationId: org.id,
        poolAddress: org.poolAddress,
      });
    } catch (error) {
      logger.error('Failed to start policy listener for organization', {
        organizationId: org.id,
        error: error.message,
      });
    }
  }

  logger.info('Policy listeners started', { count: activeListeners.length });
}

export function stop() {
  for (const listener of activeListeners) {
    listener.removeAllListeners();
  }
  activeListeners.length = 0;
  logger.info('Policy listeners stopped');
}
