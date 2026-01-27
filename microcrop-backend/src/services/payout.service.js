import prisma from '../config/database.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const payoutService = {
  async retry(organizationId, payoutId) {
    try {
      const payout = await prisma.payout.findFirst({
        where: { id: payoutId, organizationId },
      });

      if (!payout) {
        throw new NotFoundError('Payout not found in this organization');
      }

      if (payout.status !== 'FAILED') {
        throw new ValidationError(`Cannot retry payout with status: ${payout.status}. Only FAILED payouts can be retried.`);
      }

      const updated = await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: 'PENDING',
          retryCount: { increment: 1 },
        },
      });

      logger.info('Payout retry initiated', { organizationId, payoutId, retryCount: updated.retryCount });

      return updated;
    } catch (error) {
      logger.error('Failed to retry payout', { organizationId, payoutId, error: error.message });
      throw error;
    }
  },

  async batchRetry(organizationId, data) {
    try {
      let payoutIds;

      if (data.retryAllFailed) {
        const failedPayouts = await prisma.payout.findMany({
          where: { organizationId, status: 'FAILED' },
          select: { id: true },
        });
        payoutIds = failedPayouts.map((p) => p.id);
      } else {
        // Verify all provided payoutIds belong to this organization
        const payouts = await prisma.payout.findMany({
          where: {
            id: { in: data.payoutIds },
            organizationId,
            status: 'FAILED',
          },
          select: { id: true },
        });
        payoutIds = payouts.map((p) => p.id);
      }

      if (payoutIds.length === 0) {
        return { retried: 0 };
      }

      const result = await prisma.payout.updateMany({
        where: { id: { in: payoutIds } },
        data: {
          status: 'PENDING',
          retryCount: { increment: 1 },
        },
      });

      logger.info('Batch payout retry completed', { organizationId, retriedCount: result.count });

      return { retried: result.count };
    } catch (error) {
      logger.error('Failed to batch retry payouts', { organizationId, error: error.message });
      throw error;
    }
  },

  async getReconciliation(organizationId, query = {}) {
    try {
      const dateFilter = {};
      if (query.startDate) {
        dateFilter.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateFilter.lte = new Date(query.endDate);
      }

      const where = { organizationId };
      if (dateFilter.gte || dateFilter.lte) {
        where.createdAt = dateFilter;
      }

      const [byStatus, totalClaimedPolicies] = await Promise.all([
        prisma.payout.groupBy({
          by: ['status'],
          where,
          _count: { id: true },
          _sum: { amount: true },
        }),
        prisma.policy.count({
          where: {
            organizationId,
            status: 'CLAIMED',
          },
        }),
      ]);

      const summary = {
        byStatus: byStatus.map((group) => ({
          status: group.status,
          count: group._count.id,
          totalAmount: group._sum.amount || 0,
        })),
        totalClaimedPolicies,
        totalPayouts: byStatus.reduce((sum, g) => sum + g._count.id, 0),
        totalAmount: byStatus.reduce((sum, g) => sum + (g._sum.amount || 0), 0),
      };

      return summary;
    } catch (error) {
      logger.error('Failed to get reconciliation', { organizationId, error: error.message });
      throw error;
    }
  },
};

export default payoutService;
