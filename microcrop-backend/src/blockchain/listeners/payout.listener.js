import { payoutReceiver } from '../../config/blockchain.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';
import { addPayoutJob } from '../../workers/payout.worker.js';
import { DAMAGE_THRESHOLD } from '../../utils/constants.js';

export async function start() {
  if (!payoutReceiver) {
    logger.warn('PayoutReceiver contract not configured - payout listener skipped');
    return;
  }

  payoutReceiver.on('DamageReportReceived', async (policyId, damagePercent, proof, eventObj) => {
    try {
      logger.info('DamageReportReceived event', {
        policyId: policyId.toString(),
        damagePercent: damagePercent.toString(),
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
          damagePercent: Number(damagePercent),
          proof: proof.toString(),
          txHash: eventObj.log.transactionHash,
          blockNumber: BigInt(eventObj.log.blockNumber),
          source: 'ON_CHAIN',
        },
      });

      logger.info('Damage assessment recorded', {
        assessmentId: assessment.id,
        policyId: policy.id,
        damagePercent: Number(damagePercent),
      });

      if (Number(damagePercent) >= DAMAGE_THRESHOLD) {
        const payoutAmount = (policy.sumInsured * Number(damagePercent)) / 100;

        const payout = await prisma.payout.create({
          data: {
            policyId: policy.id,
            organizationId: policy.organizationId,
            farmerId: policy.farmerId,
            amountUSDC: payoutAmount,
            damagePercent: Number(damagePercent),
            status: 'PENDING',
          },
        });

        await addPayoutJob({
          payoutId: payout.id,
          policyId: policy.id,
          organizationId: policy.organizationId,
          farmerId: policy.farmerId,
          phoneNumber: policy.farmer.phoneNumber,
          amountUSDC: payoutAmount,
        });

        logger.info('Payout job queued', {
          payoutId: payout.id,
          policyId: policy.id,
          amount: payoutAmount,
        });
      }
    } catch (error) {
      logger.error('Error handling DamageReportReceived event', { error: error.message });
    }
  });

  payoutReceiver.on('PayoutProcessed', async (policyId, amount, eventObj) => {
    try {
      logger.info('PayoutProcessed event received', {
        policyId: policyId.toString(),
        amount: amount.toString(),
      });

      const policy = await prisma.policy.findFirst({
        where: { onChainPolicyId: policyId.toString() },
      });

      if (!policy) {
        logger.warn('No policy found for payout processed event', {
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
            txHash: eventObj.log.transactionHash,
            blockNumber: BigInt(eventObj.log.blockNumber),
          },
        });

        logger.info('Payout updated with on-chain data', {
          payoutId: payout.id,
          txHash: eventObj.log.transactionHash,
        });
      }
    } catch (error) {
      logger.error('Error handling PayoutProcessed event', { error: error.message });
    }
  });

  logger.info('Payout listener started');
}

export function stop() {
  if (payoutReceiver) {
    payoutReceiver.removeAllListeners();
    logger.info('Payout listener stopped');
  }
}
