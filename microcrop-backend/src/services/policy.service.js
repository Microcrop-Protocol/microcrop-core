import prisma from '../config/database.js';
import { generatePolicyNumber, paginate } from '../utils/helpers.js';
import {
  BASE_PREMIUM_RATE,
  CROP_FACTORS,
  PLATFORM_FEE_PERCENT,
  getDurationFactor,
} from '../utils/constants.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const policyService = {
  async calculateQuote(organizationId, data) {
    try {
      const { farmerId, plotId, sumInsured, coverageType, durationDays } = data;

      const farmer = await prisma.farmer.findFirst({
        where: { id: farmerId, organizationId },
      });
      if (!farmer) {
        throw new NotFoundError('Farmer not found in this organization');
      }

      const plot = await prisma.plot.findFirst({
        where: { id: plotId, organizationId },
      });
      if (!plot) {
        throw new NotFoundError('Plot not found in this organization');
      }

      const cropType = plot.cropType;
      const baseRate = BASE_PREMIUM_RATE;
      const cropFactor = CROP_FACTORS[cropType] || 1.0;
      const durationFactor = getDurationFactor(durationDays);

      const premium = parseFloat(
        (sumInsured * baseRate * cropFactor * durationFactor).toFixed(2)
      );
      const platformFee = parseFloat(
        ((premium * PLATFORM_FEE_PERCENT) / 100).toFixed(2)
      );
      const netPremium = parseFloat((premium - platformFee).toFixed(2));

      return {
        sumInsured,
        premium,
        platformFee,
        netPremium,
        coverageType,
        durationDays,
        breakdown: {
          baseRate,
          cropFactor,
          durationFactor,
          calculation: `${sumInsured} * ${baseRate} * ${cropFactor} * ${durationFactor} = ${premium}`,
        },
      };
    } catch (error) {
      logger.error('Failed to calculate quote', { error: error.message });
      throw error;
    }
  },

  async purchase(organizationId, data) {
    try {
      const { farmerId, plotId, sumInsured, coverageType, durationDays } = data;

      const policy = await prisma.$transaction(async (tx) => {
        const farmer = await tx.farmer.findFirst({
          where: { id: farmerId, organizationId },
        });
        if (!farmer) {
          throw new NotFoundError('Farmer not found in this organization');
        }
        if (farmer.kycStatus !== 'APPROVED') {
          throw new ValidationError('Farmer KYC must be approved before purchasing a policy');
        }

        const plot = await tx.plot.findFirst({
          where: { id: plotId, farmerId, organizationId },
        });
        if (!plot) {
          throw new NotFoundError('Plot not found for this farmer in this organization');
        }

        const cropType = plot.cropType;
        const baseRate = BASE_PREMIUM_RATE;
        const cropFactor = CROP_FACTORS[cropType] || 1.0;
        const durationFactor = getDurationFactor(durationDays);

        const premium = parseFloat(
          (sumInsured * baseRate * cropFactor * durationFactor).toFixed(2)
        );
        const platformFee = parseFloat(
          ((premium * PLATFORM_FEE_PERCENT) / 100).toFixed(2)
        );
        const netPremium = parseFloat((premium - platformFee).toFixed(2));

        const policyNumber = generatePolicyNumber();

        const org = await tx.organization.findUnique({
          where: { id: organizationId },
        });

        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + durationDays);

        const created = await tx.policy.create({
          data: {
            policyNumber,
            organizationId,
            poolAddress: org.poolAddress || 'pending',
            farmerId,
            plotId,
            coverageType,
            sumInsured,
            premium,
            platformFee,
            netPremium,
            startDate: now,
            endDate,
            durationDays,
            status: 'PENDING',
          },
        });

        return created;
      });

      return {
        policy,
        paymentInstructions: {
          amount: policy.premium,
          policyNumber: policy.policyNumber,
          message: 'Please complete premium payment to activate this policy.',
        },
      };
    } catch (error) {
      logger.error('Failed to purchase policy', { error: error.message });
      throw error;
    }
  },

  async list(organizationId, filters = {}) {
    try {
      const { skip, take, page, limit } = paginate(filters.page, filters.limit);

      const where = { organizationId };

      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.farmerId) {
        where.farmerId = filters.farmerId;
      }
      if (filters.plotId) {
        where.plotId = filters.plotId;
      }

      const [policies, total] = await Promise.all([
        prisma.policy.findMany({
          where,
          skip,
          take,
          include: {
            farmer: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            plot: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.policy.count({ where }),
      ]);

      return { policies, total };
    } catch (error) {
      logger.error('Failed to list policies', { error: error.message });
      throw error;
    }
  },

  async getById(organizationId, policyId) {
    try {
      const policy = await prisma.policy.findFirst({
        where: { id: policyId, organizationId },
        include: {
          farmer: true,
          plot: true,
          payouts: true,
          damageAssessments: true,
        },
      });

      if (!policy) {
        throw new NotFoundError('Policy not found');
      }

      return policy;
    } catch (error) {
      logger.error('Failed to get policy', { policyId, error: error.message });
      throw error;
    }
  },

  async getStatus(organizationId, policyId) {
    try {
      const policy = await prisma.policy.findFirst({
        where: { id: policyId, organizationId },
        include: {
          farmer: true,
          plot: true,
          payouts: true,
          damageAssessments: true,
        },
      });

      if (!policy) {
        throw new NotFoundError('Policy not found');
      }

      const now = new Date();
      const endDate = new Date(policy.endDate);
      const daysRemaining = Math.max(
        0,
        Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      );

      return {
        ...policy,
        daysRemaining,
      };
    } catch (error) {
      logger.error('Failed to get policy status', { policyId, error: error.message });
      throw error;
    }
  },

  async activate(organizationId, policyId, paymentReference) {
    try {
      const policy = await prisma.policy.findFirst({
        where: { id: policyId, organizationId },
      });

      if (!policy) {
        throw new NotFoundError('Policy not found');
      }

      if (policy.status !== 'PENDING') {
        throw new ValidationError(
          `Policy cannot be activated. Current status: ${policy.status}`
        );
      }

      const updated = await prisma.policy.update({
        where: { id: policyId },
        data: {
          premiumPaid: true,
          premiumPaidAt: new Date(),
          premiumTxHash: paymentReference,
          status: 'ACTIVE',
        },
      });

      // In future, this triggers on-chain policy creation.
      logger.info('Policy activated', {
        policyId,
        policyNumber: updated.policyNumber,
        paymentReference,
      });

      return updated;
    } catch (error) {
      logger.error('Failed to activate policy', { policyId, error: error.message });
      throw error;
    }
  },

  async cancel(organizationId, policyId, reason) {
    try {
      const policy = await prisma.policy.findFirst({
        where: { id: policyId, organizationId },
      });

      if (!policy) {
        throw new NotFoundError('Policy not found');
      }

      if (!['ACTIVE', 'PENDING'].includes(policy.status)) {
        throw new ValidationError(
          `Policy cannot be cancelled. Current status: ${policy.status}`
        );
      }

      let refundAmount = 0;
      let refundTransaction = null;

      if (policy.premiumPaid && policy.status === 'ACTIVE') {
        const now = new Date();
        const endDate = new Date(policy.endDate);
        const daysRemaining = Math.max(
          0,
          Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
        );
        refundAmount = parseFloat(
          ((daysRemaining / policy.durationDays) * policy.netPremium).toFixed(2)
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const cancelledPolicy = await tx.policy.update({
          where: { id: policyId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: reason,
          },
        });

        if (refundAmount > 0) {
          refundTransaction = await tx.transaction.create({
            data: {
              type: 'REFUND',
              amount: refundAmount,
              status: 'PENDING',
              policyId,
              organizationId,
            },
          });
        }

        return cancelledPolicy;
      });

      logger.info('Policy cancelled', {
        policyId,
        policyNumber: updated.policyNumber,
        reason,
        refundAmount,
      });

      return {
        policy: updated,
        refund: {
          amount: refundAmount,
          transaction: refundTransaction,
        },
      };
    } catch (error) {
      logger.error('Failed to cancel policy', { policyId, error: error.message });
      throw error;
    }
  },

  async expireOverdue() {
    try {
      const now = new Date();

      const result = await prisma.policy.updateMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      logger.info('Expired overdue policies', { expired: result.count });

      return { expired: result.count };
    } catch (error) {
      logger.error('Failed to expire overdue policies', { error: error.message });
      throw error;
    }
  },
};

export default policyService;
