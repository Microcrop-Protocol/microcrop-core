import { riskPoolFactory } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

export async function start() {
  if (!riskPoolFactory) {
    logger.warn('RiskPoolFactory contract not configured - pool listener skipped');
    return;
  }

  riskPoolFactory.on('PoolDeployed', async (poolAddress, organization, platformFeePercent, eventObj) => {
    try {
      logger.info('PoolDeployed event received', {
        poolAddress,
        organization,
        platformFeePercent: platformFeePercent.toString(),
      });

      const org = await prisma.organization.findFirst({
        where: { adminWallet: organization.toLowerCase() },
      });

      if (org) {
        await prisma.organization.update({
          where: { id: org.id },
          data: { poolAddress },
        });

        logger.info('Organization pool address updated', {
          organizationId: org.id,
          poolAddress,
        });
      } else {
        logger.warn('No organization found for wallet', { wallet: organization });
      }

      await prisma.syncState.upsert({
        where: { eventName: 'PoolDeployed' },
        update: {
          lastBlockNumber: BigInt(eventObj.log.blockNumber),
          lastTxHash: eventObj.log.transactionHash,
          updatedAt: new Date(),
        },
        create: {
          eventName: 'PoolDeployed',
          lastBlockNumber: BigInt(eventObj.log.blockNumber),
          lastTxHash: eventObj.log.transactionHash,
        },
      });
    } catch (error) {
      logger.error('Error handling PoolDeployed event', { error: error.message });
    }
  });

  logger.info('Pool listener started');
}

export function stop() {
  if (riskPoolFactory) {
    riskPoolFactory.removeAllListeners();
    logger.info('Pool listener stopped');
  }
}
