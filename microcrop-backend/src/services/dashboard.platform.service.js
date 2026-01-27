import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { buildDateFilter, aggregateTimeSeries, groupByToMap } from '../validators/dashboard.validator.js';
import { NotFoundError } from '../utils/errors.js';
import { paginate } from '../utils/helpers.js';

const dashboardPlatformService = {
  async getOverview(query) {
    try {
      const dateFilter = buildDateFilter(query);

      const [
        totalOrgs,
        activeOrgs,
        inactiveOrgs,
        totalPolicies,
        activePolicies,
        periodPolicies,
        totalFarmers,
        premiumAgg,
        payoutAgg,
        feeAgg,
      ] = await Promise.all([
        prisma.organization.count(),
        prisma.organization.count({ where: { isActive: true } }),
        prisma.organization.count({ where: { isActive: false } }),
        prisma.policy.count(),
        prisma.policy.count({ where: { status: 'ACTIVE' } }),
        prisma.policy.count({ where: { createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } } }),
        prisma.farmer.count(),
        prisma.policy.aggregate({ _sum: { premium: true } }),
        prisma.payout.aggregate({ _sum: { amountUSDC: true }, _count: true }),
        prisma.platformFee.aggregate({ _sum: { feeAmount: true } }),
      ]);

      return {
        organizations: {
          total: totalOrgs,
          active: activeOrgs,
          inactive: inactiveOrgs,
        },
        policies: {
          total: totalPolicies,
          active: activePolicies,
          periodNew: periodPolicies,
        },
        farmers: {
          total: totalFarmers,
        },
        financials: {
          totalPremiums: premiumAgg._sum.premium,
          totalPayouts: payoutAgg._sum.amountUSDC,
          totalPayoutCount: payoutAgg._count,
          totalRevenue: feeAgg._sum.feeAmount,
        },
        period: {
          start: dateFilter.gte,
          end: dateFilter.lte,
        },
      };
    } catch (error) {
      logger.error('Failed to get platform overview', { error: error.message });
      throw error;
    }
  },

  async getOrganizations(query) {
    try {
      const { skip, take, page, limit } = paginate(query.page, query.limit);
      const dateFilter = buildDateFilter(query);

      const where = {};
      if (query.type) where.type = query.type;
      if (query.isActive !== undefined) where.isActive = query.isActive === 'true' || query.isActive === true;
      if (query.search) {
        where.name = { contains: query.search, mode: 'insensitive' };
      }

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip,
          take,
          include: {
            _count: {
              select: {
                farmers: true,
                policies: true,
                payouts: true,
                users: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.organization.count({ where }),
      ]);

      return { data: organizations, total, page, limit };
    } catch (error) {
      logger.error('Failed to get organizations', { error: error.message });
      throw error;
    }
  },

  async getOrgMetrics(orgId, query) {
    try {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new NotFoundError('Organization not found');
      }

      const dateFilter = buildDateFilter(query);
      const orgWhere = { organizationId: orgId };
      const orgDateWhere = { organizationId: orgId, createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } };

      const [
        farmerCount,
        farmersByKyc,
        policyCount,
        policiesByStatus,
        policiesByCoverage,
        policyAgg,
        payoutAgg,
        payoutsByStatus,
        feeAgg,
        recentPolicies,
        recentPayouts,
      ] = await Promise.all([
        prisma.farmer.count({ where: orgWhere }),
        prisma.farmer.groupBy({ by: ['kycStatus'], where: orgWhere, _count: { _all: true } }),
        prisma.policy.count({ where: orgDateWhere }),
        prisma.policy.groupBy({ by: ['status'], where: orgWhere, _count: { _all: true } }),
        prisma.policy.groupBy({ by: ['coverageType'], where: orgWhere, _count: { _all: true } }),
        prisma.policy.aggregate({ where: orgWhere, _sum: { premium: true, netPremium: true } }),
        prisma.payout.aggregate({ where: orgWhere, _sum: { amountUSDC: true }, _count: true }),
        prisma.payout.groupBy({ by: ['status'], where: orgWhere, _count: { _all: true } }),
        prisma.platformFee.aggregate({ where: orgWhere, _sum: { feeAmount: true } }),
        prisma.policy.findMany({ where: orgWhere, take: 5, orderBy: { createdAt: 'desc' } }),
        prisma.payout.findMany({ where: orgWhere, take: 5, orderBy: { initiatedAt: 'desc' } }),
      ]);

      const totalPremiums = Number(policyAgg._sum.premium || 0);
      const totalPayouts = Number(payoutAgg._sum.amountUSDC || 0);
      const lossRatio = totalPremiums > 0 ? totalPayouts / totalPremiums : 0;

      return {
        organization: org,
        farmers: {
          total: farmerCount,
          byKycStatus: groupByToMap(farmersByKyc, 'kycStatus'),
        },
        policies: {
          total: policyCount,
          byStatus: groupByToMap(policiesByStatus, 'status'),
          byCoverage: groupByToMap(policiesByCoverage, 'coverageType'),
          totalPremiums: policyAgg._sum.premium,
          totalNetPremiums: policyAgg._sum.netPremium,
        },
        payouts: {
          total: payoutAgg._count,
          totalAmount: payoutAgg._sum.amountUSDC,
          byStatus: groupByToMap(payoutsByStatus, 'status'),
        },
        fees: {
          total: feeAgg._sum.feeAmount,
        },
        lossRatio,
        recentPolicies,
        recentPayouts,
        period: {
          start: dateFilter.gte,
          end: dateFilter.lte,
        },
      };
    } catch (error) {
      logger.error('Failed to get org metrics', { orgId, error: error.message });
      throw error;
    }
  },

  async getRevenueAnalytics(query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [dailyStats, feesByOrg] = await Promise.all([
        prisma.dailyPlatformStats.findMany({
          where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
          orderBy: { date: 'asc' },
          select: { date: true, totalFees: true, totalPremiums: true, totalPayoutsAmount: true },
        }),
        prisma.platformFee.groupBy({
          by: ['organizationId'],
          where: { collectedAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _sum: { feeAmount: true, premium: true },
          _count: { _all: true },
        }),
      ]);

      // Lookup org names for the groupBy results
      const orgIds = feesByOrg.map((row) => row.organizationId);
      const orgs = orgIds.length > 0
        ? await prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : [];
      const orgNameMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

      const byOrganization = feesByOrg.map((row) => ({
        organizationId: row.organizationId,
        organizationName: orgNameMap[row.organizationId] || 'Unknown',
        totalFees: row._sum.feeAmount,
        totalPremiums: row._sum.premium,
        count: row._count._all,
      }));

      const timeSeries = aggregateTimeSeries(dailyStats, granularity);

      return {
        timeSeries,
        byOrganization,
        granularity,
      };
    } catch (error) {
      logger.error('Failed to get revenue analytics', { error: error.message });
      throw error;
    }
  },

  async getPolicyAnalytics(query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [dailyStats, byStatus, byCoverage] = await Promise.all([
        prisma.dailyPlatformStats.findMany({
          where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
          orderBy: { date: 'asc' },
          select: { date: true, totalPolicies: true },
        }),
        prisma.policy.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.policy.groupBy({
          by: ['coverageType'],
          where: { createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _count: { _all: true },
        }),
      ]);

      const statusMap = groupByToMap(byStatus, 'status');
      const active = statusMap.ACTIVE || 0;
      const expired = statusMap.EXPIRED || 0;
      const claimed = statusMap.CLAIMED || 0;
      const eligibleTotal = active + expired + claimed;
      const claimsRatio = eligibleTotal > 0 ? claimed / eligibleTotal : 0;

      const timeSeries = aggregateTimeSeries(dailyStats, granularity);

      return {
        timeSeries,
        byStatus: statusMap,
        byCoverage: groupByToMap(byCoverage, 'coverageType'),
        claimsRatio,
        granularity,
      };
    } catch (error) {
      logger.error('Failed to get policy analytics', { error: error.message });
      throw error;
    }
  },

  async getFarmerAnalytics(query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [total, byKycStatus, byCounty, dailyGrowth] = await Promise.all([
        prisma.farmer.count(),
        prisma.farmer.groupBy({ by: ['kycStatus'], _count: { _all: true } }),
        prisma.farmer.groupBy({
          by: ['county'],
          _count: { _all: true },
          orderBy: { _count: { county: 'desc' } },
        }),
        prisma.dailyOrganizationStats.groupBy({
          by: ['date'],
          where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _sum: { farmersRegistered: true },
          orderBy: { date: 'asc' },
        }),
      ]);

      const growthData = dailyGrowth.map((row) => ({
        date: row.date,
        farmersRegistered: row._sum.farmersRegistered || 0,
      }));

      const growthTimeSeries = aggregateTimeSeries(growthData, granularity);

      return {
        total,
        byKycStatus: groupByToMap(byKycStatus, 'kycStatus'),
        byCounty: groupByToMap(byCounty, 'county'),
        growthTimeSeries,
        granularity,
      };
    } catch (error) {
      logger.error('Failed to get farmer analytics', { error: error.message });
      throw error;
    }
  },

  async getPayoutAnalytics(query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [byStatus, summary, dailyStats] = await Promise.all([
        prisma.payout.groupBy({
          by: ['status'],
          where: { initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _count: { _all: true },
          _sum: { amountUSDC: true },
        }),
        prisma.payout.aggregate({
          where: { initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _sum: { amountUSDC: true },
          _avg: { amountUSDC: true, damagePercent: true },
          _count: true,
        }),
        prisma.dailyPlatformStats.findMany({
          where: { date: { gte: dateFilter.gte, lte: dateFilter.lte } },
          orderBy: { date: 'asc' },
          select: { date: true, totalPayoutsCount: true, totalPayoutsAmount: true },
        }),
      ]);

      const statusMap = {};
      let completedCount = 0;
      let failedCount = 0;
      let totalCount = 0;

      for (const row of byStatus) {
        statusMap[row.status] = {
          count: row._count._all,
          amount: row._sum.amountUSDC,
        };
        totalCount += row._count._all;
        if (row.status === 'COMPLETED') completedCount = row._count._all;
        if (row.status === 'FAILED') failedCount = row._count._all;
      }

      const successRate = totalCount > 0 ? completedCount / totalCount : 0;
      const failureRate = totalCount > 0 ? failedCount / totalCount : 0;

      const timeSeries = aggregateTimeSeries(dailyStats, granularity);

      return {
        summary: {
          totalAmount: summary._sum.amountUSDC,
          avgAmount: summary._avg.amountUSDC,
          avgDamagePercent: summary._avg.damagePercent,
          totalCount: summary._count,
        },
        byStatus: statusMap,
        successRate,
        failureRate,
        timeSeries,
        granularity,
      };
    } catch (error) {
      logger.error('Failed to get payout analytics', { error: error.message });
      throw error;
    }
  },

  async getDamageAssessments(query) {
    try {
      const { skip, take, page, limit } = paginate(query.page, query.limit);
      const dateFilter = buildDateFilter(query);
      const dateWhere = { createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } };

      const [aggregates, triggeredCount, assessments, total] = await Promise.all([
        prisma.damageAssessment.aggregate({
          where: dateWhere,
          _avg: { weatherDamage: true, satelliteDamage: true, combinedDamage: true },
          _count: true,
        }),
        prisma.damageAssessment.count({
          where: { ...dateWhere, triggered: true },
        }),
        prisma.damageAssessment.findMany({
          where: dateWhere,
          include: {
            policy: {
              select: { policyNumber: true, organizationId: true, farmerId: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.damageAssessment.count({ where: dateWhere }),
      ]);

      const totalCount = aggregates._count;
      const triggerRate = totalCount > 0 ? triggeredCount / totalCount : 0;

      return {
        summary: {
          avgWeather: aggregates._avg.weatherDamage,
          avgSatellite: aggregates._avg.satelliteDamage,
          avgCombined: aggregates._avg.combinedDamage,
          total: totalCount,
          triggered: triggeredCount,
          triggerRate,
        },
        data: assessments,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Failed to get damage assessments', { error: error.message });
      throw error;
    }
  },

  async getActivity(query) {
    try {
      const activityLimit = query.limit || 20;

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [recentPolicies, recentPayouts, recentFarmers, failedPayouts, expiringSoon] = await Promise.all([
        prisma.policy.findMany({
          take: activityLimit,
          orderBy: { createdAt: 'desc' },
          select: { id: true, policyNumber: true, status: true, createdAt: true, organizationId: true },
        }),
        prisma.payout.findMany({
          take: activityLimit,
          orderBy: { initiatedAt: 'desc' },
          select: { id: true, status: true, amountUSDC: true, initiatedAt: true, organizationId: true },
        }),
        prisma.farmer.findMany({
          take: activityLimit,
          orderBy: { createdAt: 'desc' },
          select: { id: true, firstName: true, lastName: true, createdAt: true, organizationId: true },
        }),
        prisma.payout.findMany({
          where: { status: 'FAILED' },
          take: 10,
          orderBy: { failedAt: 'desc' },
          select: { id: true, status: true, amountUSDC: true, failedAt: true, organizationId: true, failureReason: true },
        }),
        prisma.policy.findMany({
          where: { status: 'ACTIVE', endDate: { lte: sevenDaysFromNow } },
          take: 10,
          orderBy: { endDate: 'asc' },
          select: { id: true, policyNumber: true, endDate: true, organizationId: true },
        }),
      ]);

      // Merge activities into a unified sorted array
      const activities = [];

      for (const p of recentPolicies) {
        activities.push({
          type: 'POLICY_CREATED',
          id: p.id,
          policyNumber: p.policyNumber,
          status: p.status,
          organizationId: p.organizationId,
          timestamp: p.createdAt,
        });
      }

      for (const p of recentPayouts) {
        const type = p.status === 'COMPLETED' ? 'PAYOUT_COMPLETED'
          : p.status === 'FAILED' ? 'PAYOUT_FAILED'
          : 'PAYOUT_INITIATED';
        activities.push({
          type,
          id: p.id,
          amountUSDC: p.amountUSDC,
          status: p.status,
          organizationId: p.organizationId,
          timestamp: p.initiatedAt,
        });
      }

      for (const f of recentFarmers) {
        activities.push({
          type: 'FARMER_REGISTERED',
          id: f.id,
          name: `${f.firstName} ${f.lastName}`,
          organizationId: f.organizationId,
          timestamp: f.createdAt,
        });
      }

      // Sort by timestamp descending and limit
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const activity = activities.slice(0, activityLimit);

      return {
        activity,
        alerts: {
          failedPayouts,
          expiringSoon,
        },
      };
    } catch (error) {
      logger.error('Failed to get activity feed', { error: error.message });
      throw error;
    }
  },
};

export default dashboardPlatformService;
