import prisma from '../config/database.js';
import { generatePolicyNumber, paginate, calculateTLU, getSeasonDates, getSeasonYear } from '../utils/helpers.js';
import {
  BASE_PREMIUM_RATE,
  CROP_FACTORS,
  PLATFORM_FEE_PERCENT,
  getDurationFactor,
} from '../utils/constants.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { addBlockchainRetryJob } from '../workers/blockchain.worker.js';
import logger from '../utils/logger.js';

const policyService = {
  async calculateQuote(organizationId, data) {
    try {
      const { farmerId, plotId, herdId, sumInsured, coverageType, durationDays, productType, season } = data;

      const farmer = await prisma.farmer.findFirst({
        where: { id: farmerId, organizationId },
      });
      if (!farmer) {
        throw new NotFoundError('Farmer not found in this organization');
      }

      // IBLI livestock quote — TLU-based pricing
      if (productType === 'LIVESTOCK') {
        if (!herdId) throw new ValidationError('herdId is required for livestock insurance');
        if (!season) throw new ValidationError('season is required for IBLI livestock insurance');

        const herd = await prisma.herd.findFirst({
          where: { id: herdId, organizationId },
          include: { insuranceUnit: true },
        });
        if (!herd) throw new NotFoundError('Herd not found in this organization');
        if (!herd.insuranceUnit) throw new ValidationError('Herd has no insurance unit. Farmer county must match a KLIP county.');

        const unit = herd.insuranceUnit;
        const tluCount = parseFloat(herd.tluCount);
        const premiumRate = season === 'LRLD' ? parseFloat(unit.premiumRateLRLD) : parseFloat(unit.premiumRateSRSD);
        const valuePerTLU = parseFloat(unit.valuePerTLU);
        const computedSumInsured = parseFloat((tluCount * valuePerTLU).toFixed(2));
        const premium = parseFloat((tluCount * premiumRate).toFixed(2));
        const platformFee = parseFloat(((premium * PLATFORM_FEE_PERCENT) / 100).toFixed(2));
        const netPremium = parseFloat((premium - platformFee).toFixed(2));

        const year = getSeasonYear(season);
        const { startDate, endDate } = getSeasonDates(season, year);
        const computedDurationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

        return {
          productType: 'LIVESTOCK',
          season,
          sumInsured: computedSumInsured,
          premium,
          platformFee,
          netPremium,
          coverageType: 'LIVESTOCK_DROUGHT',
          durationDays: computedDurationDays,
          startDate,
          endDate,
          breakdown: {
            tluCount,
            valuePerTLU,
            premiumRate,
            county: unit.county,
            unitCode: unit.unitCode,
            livestockType: herd.livestockType,
            headCount: herd.headCount,
            calculation: `${tluCount} TLU * ${premiumRate} KES/TLU = ${premium} KES`,
          },
        };
      }

      // Crop quote (existing logic)
      if (!plotId) throw new ValidationError('plotId is required for crop insurance');

      const durationFactor = getDurationFactor(durationDays);

      const plot = await prisma.plot.findFirst({
        where: { id: plotId, organizationId },
      });
      if (!plot) {
        throw new NotFoundError('Plot not found in this organization');
      }

      const cropType = plot.cropType;
      const baseRate = BASE_PREMIUM_RATE;
      const cropFactor = CROP_FACTORS[cropType] || 1.0;

      const premium = parseFloat(
        (sumInsured * baseRate * cropFactor * durationFactor).toFixed(2)
      );
      const platformFee = parseFloat(
        ((premium * PLATFORM_FEE_PERCENT) / 100).toFixed(2)
      );
      const netPremium = parseFloat((premium - platformFee).toFixed(2));

      return {
        productType: 'CROP',
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
      const { farmerId, plotId, herdId, sumInsured, coverageType, durationDays, productType, season } = data;

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

        let premium, platformFee, netPremium;
        let resolvedPlotId = null;
        let resolvedHerdId = null;
        let resolvedSumInsured = sumInsured;
        let resolvedCoverageType = coverageType;
        let resolvedDurationDays = durationDays;
        let resolvedSeason = null;
        let resolvedInsuranceUnitId = null;
        let startDate, endDate;

        if (productType === 'LIVESTOCK') {
          if (!herdId) throw new ValidationError('herdId is required for livestock insurance');
          if (!season) throw new ValidationError('season is required for IBLI livestock insurance');

          const herd = await tx.herd.findFirst({
            where: { id: herdId, farmerId, organizationId },
            include: { insuranceUnit: true },
          });
          if (!herd) throw new NotFoundError('Herd not found for this farmer in this organization');
          if (!herd.insuranceUnit) throw new ValidationError('Herd has no insurance unit. Farmer county must match a KLIP county.');

          resolvedHerdId = herdId;
          resolvedSeason = season;
          resolvedInsuranceUnitId = herd.insuranceUnitId;
          resolvedCoverageType = 'LIVESTOCK_DROUGHT';

          const unit = herd.insuranceUnit;
          const tluCount = parseFloat(herd.tluCount);
          const premiumRate = season === 'LRLD' ? parseFloat(unit.premiumRateLRLD) : parseFloat(unit.premiumRateSRSD);
          const valuePerTLU = parseFloat(unit.valuePerTLU);

          resolvedSumInsured = parseFloat((tluCount * valuePerTLU).toFixed(2));
          premium = parseFloat((tluCount * premiumRate).toFixed(2));

          const year = getSeasonYear(season);
          const dates = getSeasonDates(season, year);
          startDate = dates.startDate;
          endDate = dates.endDate;
          resolvedDurationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

          // Check for duplicate active policy on same herd + season
          const existing = await tx.policy.findFirst({
            where: {
              herdId,
              season,
              status: { in: ['PENDING', 'ACTIVE'] },
              insuranceUnitId: resolvedInsuranceUnitId,
            },
          });
          if (existing) {
            throw new ValidationError(`Herd already has an active/pending ${season} policy`);
          }
        } else {
          if (!plotId) throw new ValidationError('plotId is required for crop insurance');

          const plot = await tx.plot.findFirst({
            where: { id: plotId, farmerId, organizationId },
          });
          if (!plot) throw new NotFoundError('Plot not found for this farmer in this organization');

          resolvedPlotId = plotId;

          const durationFactor = getDurationFactor(durationDays);
          const cropFactor = CROP_FACTORS[plot.cropType] || 1.0;
          premium = parseFloat(
            (sumInsured * BASE_PREMIUM_RATE * cropFactor * durationFactor).toFixed(2)
          );

          const now = new Date();
          startDate = now;
          endDate = new Date(now);
          endDate.setDate(endDate.getDate() + durationDays);

          // M-11: Check for duplicate active/pending crop policy on same plot with overlapping dates
          const duplicatePolicy = await tx.policy.findFirst({
            where: {
              plotId,
              status: { in: ['ACTIVE', 'PENDING'] },
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
          });
          if (duplicatePolicy) {
            throw new ValidationError('An active policy already exists for this plot');
          }
        }

        platformFee = parseFloat(((premium * PLATFORM_FEE_PERCENT) / 100).toFixed(2));
        netPremium = parseFloat((premium - platformFee).toFixed(2));

        const policyNumber = generatePolicyNumber();
        const org = await tx.organization.findUnique({ where: { id: organizationId } });

        const poolAddress = productType === 'LIVESTOCK'
          ? (org.livestockPoolAddress || org.poolAddress || 'pending')
          : (org.poolAddress || 'pending');

        const created = await tx.policy.create({
          data: {
            policyNumber,
            organizationId,
            poolAddress,
            farmerId,
            plotId: resolvedPlotId,
            herdId: resolvedHerdId,
            productType: productType || 'CROP',
            coverageType: resolvedCoverageType,
            livestockPeril: productType === 'LIVESTOCK' ? 'DROUGHT_PASTURE' : null,
            season: resolvedSeason,
            insuranceUnitId: resolvedInsuranceUnitId,
            sumInsured: resolvedSumInsured,
            premium,
            platformFee,
            netPremium,
            startDate,
            endDate,
            durationDays: resolvedDurationDays,
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
      if (filters.herdId) {
        where.herdId = filters.herdId;
      }
      if (filters.productType) {
        where.productType = filters.productType;
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
            herd: {
              select: {
                name: true,
                livestockType: true,
                headCount: true,
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
          herd: true,
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
          herd: true,
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

      // M-12: If the policy was created on-chain, queue a blockchain job to cancel it
      if (updated.onChainPolicyId) {
        addBlockchainRetryJob({
          type: 'CANCEL_POLICY',
          policyId: updated.id,
        }).catch((err) => {
          logger.warn('Failed to queue on-chain policy cancellation', {
            policyId: updated.id,
            onChainPolicyId: updated.onChainPolicyId,
            error: err.message,
          });
        });
      }

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
