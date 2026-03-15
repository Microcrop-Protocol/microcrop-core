import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { addPayoutJob } from '../workers/payout.worker.js';

const manualAssessmentService = {
  /**
   * Create a manual damage assessment and trigger payout for a policy.
   * Used by org admins when CRE isn't available or for edge cases.
   */
  async createAssessment({ policyId, organizationId, damagePercent, reason }) {
    const policy = await prisma.policy.findFirst({
      where: {
        id: policyId,
        organizationId,
        status: 'ACTIVE',
        premiumPaid: true,
      },
      include: { farmer: true },
    });

    if (!policy) {
      throw new Error('Active, paid policy not found in your organization');
    }

    // Check for duplicate recent assessment
    const recentAssessment = await prisma.damageAssessment.findFirst({
      where: {
        policyId,
        source: 'MANUAL',
        triggerDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (recentAssessment) {
      throw new Error('A manual assessment was already created for this policy in the last 24 hours');
    }

    // Create damage assessment
    const assessment = await prisma.damageAssessment.create({
      data: {
        policyId,
        organizationId,
        damagePercent,
        combinedDamage: damagePercent,
        source: 'MANUAL',
        triggered: true,
        triggerDate: new Date(),
        proof: reason || null,
      },
    });

    // Calculate payout
    const payoutAmount = parseFloat(
      ((damagePercent / 100) * parseFloat(policy.sumInsured)).toFixed(2)
    );

    // Create payout
    const payout = await prisma.payout.create({
      data: {
        organizationId,
        policyId,
        farmerId: policy.farmerId,
        amountUSDC: payoutAmount,
        damagePercent,
        status: 'PENDING',
        initiatedAt: new Date(),
      },
    });

    // Queue for M-Pesa offramp
    await addPayoutJob({
      payoutId: payout.id,
      policyId,
      organizationId,
      farmerId: policy.farmerId,
      phoneNumber: policy.farmer?.phoneNumber,
      amountUSDC: payoutAmount,
    });

    logger.info('Manual damage assessment created', {
      assessmentId: assessment.id,
      policyId,
      damagePercent,
      payoutAmount,
      payoutId: payout.id,
      createdBy: 'ORG_ADMIN',
    });

    return {
      assessment,
      payout: {
        id: payout.id,
        amountUSDC: payoutAmount,
        status: payout.status,
      },
    };
  },

  /**
   * Bulk manual assessment for multiple policies (e.g. after a regional event).
   */
  async createBulkAssessment({ policyIds, organizationId, damagePercent, reason }) {
    const results = [];
    const errors = [];

    for (const policyId of policyIds) {
      try {
        const result = await this.createAssessment({ policyId, organizationId, damagePercent, reason });
        results.push({ policyId, success: true, payoutId: result.payout.id, amount: result.payout.amountUSDC });
      } catch (error) {
        errors.push({ policyId, success: false, error: error.message });
      }
    }

    logger.info('Bulk manual assessment completed', {
      organizationId,
      total: policyIds.length,
      succeeded: results.length,
      failed: errors.length,
    });

    return { results, errors };
  },
};

export default manualAssessmentService;
