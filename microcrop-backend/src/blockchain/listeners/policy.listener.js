import { getRiskPoolContract } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

const activeListeners = [];

export async function start() {
  const organizations = await prisma.organization.findMany({
    where: {
      status: 'ACTIVE',
      poolAddress: { not: null },
    },
  });

  for (const org of organizations) {
    try {
      const riskPool = getRiskPoolContract(org.poolAddress);

      riskPool.on('PolicyCreated', async (policyId, orgAddress, premium, platformFee, eventObj) => {
        try {
          logger.info('PolicyCreated event received', {
            policyId: policyId.toString(),
            organization: orgAddress,
            premium: premium.toString(),
            platformFee: platformFee.toString(),
          });

          const policy = await prisma.policy.findFirst({
            where: {
              organizationId: org.id,
              status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
          });

          if (!policy) {
            logger.warn('No pending policy found for PolicyCreated event', {
              organizationId: org.id,
              policyId: policyId.toString(),
            });
            return;
          }

          await prisma.policy.update({
            where: { id: policy.id },
            data: {
              onChainPolicyId: policyId.toString(),
              status: 'ACTIVE',
              txHash: eventObj.log.transactionHash,
              blockNumber: BigInt(eventObj.log.blockNumber),
            },
          });

          await prisma.platformFee.create({
            data: {
              organizationId: org.id,
              policyId: policy.id,
              amount: parseFloat(platformFee.toString()),
              txHash: eventObj.log.transactionHash,
              blockNumber: BigInt(eventObj.log.blockNumber),
            },
          });

          await prisma.organization.update({
            where: { id: org.id },
            data: {
              totalPolicies: { increment: 1 },
              totalPremiums: { increment: parseFloat(premium.toString()) },
            },
          });

          logger.info('Policy activated on-chain', {
            policyId: policy.id,
            onChainPolicyId: policyId.toString(),
            txHash: eventObj.log.transactionHash,
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
