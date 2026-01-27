import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { buildDateFilter, aggregateTimeSeries, groupByToMap } from '../validators/dashboard.validator.js';
import { paginate } from '../utils/helpers.js';

const dashboardOrgService = {
  async getOverview(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const [
        totalFarmers,
        activePolicies,
        periodNewPolicies,
        premiumAgg,
        payoutAgg,
        org,
      ] = await Promise.all([
        prisma.farmer.count({ where: { organizationId } }),
        prisma.policy.count({ where: { organizationId, status: 'ACTIVE' } }),
        prisma.policy.count({
          where: { organizationId, createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
        }),
        prisma.policy.aggregate({
          where: { organizationId, createdAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _sum: { premium: true, platformFee: true },
        }),
        prisma.payout.aggregate({
          where: { organizationId, initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte } },
          _sum: { amountUSDC: true },
          _count: true,
        }),
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: {
            poolAddress: true,
            totalPremiumsCollected: true,
            totalPayoutsProcessed: true,
            totalFeesGenerated: true,
          },
        }),
      ]);

      return {
        farmers: { total: totalFarmers },
        policies: { active: activePolicies, periodNew: periodNewPolicies },
        financials: {
          premiumsCollected: premiumAgg._sum.premium || 0,
          payoutsProcessed: payoutAgg._sum.amountUSDC || 0,
          payoutCount: payoutAgg._count || 0,
          feesPaid: premiumAgg._sum.platformFee || 0,
          poolAddress: org?.poolAddress || null,
        },
        period: { gte: dateFilter.gte, lte: dateFilter.lte },
      };
    } catch (error) {
      logger.error('Failed to get org dashboard overview', { organizationId, error: error.message });
      throw error;
    }
  },

  async getFarmers(organizationId, query) {
    try {
      const { page, limit, kycStatus, county, search } = query;
      const { skip, take, page: p, limit: l } = paginate(page, limit);

      const where = { organizationId };

      if (kycStatus) {
        where.kycStatus = kycStatus;
      }
      if (county) {
        where.county = county;
      }
      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phoneNumber: { contains: search } },
        ];
      }

      const [farmers, total] = await Promise.all([
        prisma.farmer.findMany({
          where,
          skip,
          take,
          include: {
            _count: {
              select: { policies: true, plots: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.farmer.count({ where }),
      ]);

      return { data: farmers, total, page: p, limit: l };
    } catch (error) {
      logger.error('Failed to get org farmers', { organizationId, error: error.message });
      throw error;
    }
  },

  async getFarmerAnalytics(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [byKycStatusRaw, byCountyRaw, dailyStats] = await Promise.all([
        prisma.farmer.groupBy({
          by: ['kycStatus'],
          where: { organizationId },
          _count: { _all: true },
        }),
        prisma.farmer.groupBy({
          by: ['county'],
          where: { organizationId },
          _count: { _all: true },
          orderBy: { _count: { county: 'desc' } },
        }),
        prisma.dailyOrganizationStats.findMany({
          where: {
            organizationId,
            date: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          orderBy: { date: 'asc' },
          select: { date: true, farmersRegistered: true },
        }),
      ]);

      const byKycStatus = groupByToMap(byKycStatusRaw, 'kycStatus');
      const byCounty = groupByToMap(byCountyRaw, 'county');
      const growthTimeSeries = aggregateTimeSeries(dailyStats, granularity);

      return { byKycStatus, byCounty, growthTimeSeries, granularity };
    } catch (error) {
      logger.error('Failed to get farmer analytics', { organizationId, error: error.message });
      throw error;
    }
  },

  async getPolicies(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const [byStatusRaw, byCoverageRaw] = await Promise.all([
        prisma.policy.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: { _all: true },
        }),
        prisma.policy.groupBy({
          by: ['coverageType'],
          where: { organizationId },
          _count: { _all: true },
        }),
      ]);

      const byCropType = await prisma.$queryRaw`
        SELECT pl."cropType", COUNT(*)::int AS count
        FROM "Policy" pol
        JOIN "Plot" pl ON pol."plotId" = pl."id"
        WHERE pol."organizationId" = ${organizationId}::uuid
        GROUP BY pl."cropType"
        ORDER BY count DESC
      `;

      const now = new Date();
      const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const [expiringSoon, recentlyActivated] = await Promise.all([
        prisma.policy.findMany({
          where: {
            organizationId,
            status: 'ACTIVE',
            endDate: { lte: fourteenDaysFromNow, gte: now },
          },
          take: 10,
          orderBy: { endDate: 'asc' },
          include: {
            farmer: { select: { firstName: true, lastName: true } },
            plot: { select: { cropType: true } },
          },
        }),
        prisma.policy.findMany({
          where: {
            organizationId,
            status: 'ACTIVE',
            createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            farmer: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);

      const byStatus = groupByToMap(byStatusRaw, 'status');
      const byCoverage = groupByToMap(byCoverageRaw, 'coverageType');

      return { byStatus, byCoverage, byCropType, expiringSoon, recentlyActivated };
    } catch (error) {
      logger.error('Failed to get org policies', { organizationId, error: error.message });
      throw error;
    }
  },

  async getPolicyAnalytics(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const dailyStats = await prisma.dailyOrganizationStats.findMany({
        where: {
          organizationId,
          date: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        orderBy: { date: 'asc' },
        select: { date: true, policiesCreated: true, premiumsCollected: true },
      });

      const timeSeries = aggregateTimeSeries(dailyStats, granularity);

      return { timeSeries, granularity };
    } catch (error) {
      logger.error('Failed to get policy analytics', { organizationId, error: error.message });
      throw error;
    }
  },

  async getPayouts(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const [byStatusRaw, summary, dailyStats, pendingPayouts, failedPayouts] = await Promise.all([
        prisma.payout.groupBy({
          by: ['status'],
          where: {
            organizationId,
            initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          _count: { _all: true },
          _sum: { amountUSDC: true },
        }),
        prisma.payout.aggregate({
          where: {
            organizationId,
            initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          _sum: { amountUSDC: true },
          _avg: { amountUSDC: true },
          _count: true,
        }),
        prisma.dailyOrganizationStats.findMany({
          where: {
            organizationId,
            date: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          orderBy: { date: 'asc' },
          select: { date: true, payoutsProcessed: true, payoutsAmount: true },
        }),
        prisma.payout.findMany({
          where: { organizationId, status: 'PENDING' },
          take: 10,
          orderBy: { initiatedAt: 'desc' },
          include: {
            policy: { select: { policyNumber: true, farmerId: true } },
          },
        }),
        prisma.payout.findMany({
          where: { organizationId, status: 'FAILED' },
          take: 10,
          orderBy: { failedAt: 'desc' },
          include: {
            policy: { select: { policyNumber: true } },
          },
        }),
      ]);

      const byStatus = {};
      let completedCount = 0;
      let totalCount = 0;
      for (const row of byStatusRaw) {
        byStatus[row.status] = {
          count: row._count._all,
          totalAmount: row._sum.amountUSDC || 0,
        };
        totalCount += row._count._all;
        if (row.status === 'COMPLETED') {
          completedCount = row._count._all;
        }
      }

      const successRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

      const timeSeries = aggregateTimeSeries(dailyStats, query.granularity || 'daily');

      return {
        summary: {
          totalAmount: summary._sum.amountUSDC || 0,
          avgAmount: summary._avg.amountUSDC || 0,
          totalCount: summary._count || 0,
        },
        byStatus,
        successRate,
        timeSeries,
        pendingPayouts,
        failedPayouts,
      };
    } catch (error) {
      logger.error('Failed to get org payouts', { organizationId, error: error.message });
      throw error;
    }
  },

  async getDamageAssessments(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);
      const { skip, take, page, limit } = paginate(query.page, query.limit);

      const where = {
        policy: { organizationId },
        triggerDate: { gte: dateFilter.gte, lte: dateFilter.lte },
      };

      const [assessments, total] = await Promise.all([
        prisma.damageAssessment.findMany({
          where,
          include: {
            policy: {
              select: {
                policyNumber: true,
                plot: {
                  select: { latitude: true, longitude: true, cropType: true, name: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.damageAssessment.count({ where }),
      ]);

      const heatmapData = await prisma.$queryRaw`
        SELECT
          da."combinedDamage",
          da."triggered",
          da."triggerDate",
          pl."latitude",
          pl."longitude",
          pl."cropType",
          pl."name"
        FROM "DamageAssessment" da
        JOIN "Policy" pol ON da."policyId" = pol."id"
        JOIN "Plot" pl ON pol."plotId" = pl."id"
        WHERE pol."organizationId" = ${organizationId}::uuid
          AND da."triggerDate" >= ${dateFilter.gte}
          AND da."triggerDate" <= ${dateFilter.lte}
      `;

      return {
        assessments: { data: assessments, total, page, limit },
        heatmapData,
      };
    } catch (error) {
      logger.error('Failed to get damage assessments', { organizationId, error: error.message });
      throw error;
    }
  },

  async getFinancials(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);
      const granularity = query.granularity || 'daily';

      const [dailyStats, policyAgg, payoutAgg, feeAgg, org] = await Promise.all([
        prisma.dailyOrganizationStats.findMany({
          where: {
            organizationId,
            date: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          orderBy: { date: 'asc' },
          select: { date: true, premiumsCollected: true, payoutsAmount: true, feesGenerated: true },
        }),
        prisma.policy.aggregate({
          where: {
            organizationId,
            createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          _sum: { premium: true },
          _avg: { premium: true },
          _count: true,
        }),
        prisma.payout.aggregate({
          where: {
            organizationId,
            status: 'COMPLETED',
            initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          _sum: { amountUSDC: true },
        }),
        prisma.platformFee.aggregate({
          where: {
            organizationId,
            createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
          },
          _sum: { feeAmount: true },
        }),
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: {
            totalPremiumsCollected: true,
            totalPayoutsProcessed: true,
            totalFeesGenerated: true,
          },
        }),
      ]);

      const premiums = policyAgg._sum.premium || 0;
      const payouts = payoutAgg._sum.amountUSDC || 0;
      const lossRatio = premiums > 0 ? payouts / premiums : 0;

      const timeSeries = aggregateTimeSeries(dailyStats, granularity);

      return {
        period: {
          premiums,
          payouts,
          fees: feeAgg._sum.feeAmount || 0,
          avgPremium: policyAgg._avg.premium || 0,
          policyCount: policyAgg._count || 0,
          lossRatio,
        },
        allTime: {
          premiums: org?.totalPremiumsCollected || 0,
          payouts: org?.totalPayoutsProcessed || 0,
          fees: org?.totalFeesGenerated || 0,
        },
        timeSeries,
        granularity,
      };
    } catch (error) {
      logger.error('Failed to get org financials', { organizationId, error: error.message });
      throw error;
    }
  },

  async getPlots(organizationId, query) {
    try {
      const { page, limit, cropType } = query;
      const { skip, take, page: p, limit: l } = paginate(page, limit);

      const where = { organizationId };
      if (cropType) {
        where.cropType = cropType;
      }

      const [plots, total, cropDistributionRaw] = await Promise.all([
        prisma.plot.findMany({
          where,
          skip,
          take,
          include: {
            farmer: { select: { firstName: true, lastName: true } },
            _count: { select: { policies: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.plot.count({ where }),
        prisma.plot.groupBy({
          by: ['cropType'],
          where: { organizationId },
          _count: { _all: true },
          _sum: { acreage: true },
        }),
      ]);

      const plotIds = plots.map((p) => p.id);

      let latestWeather = [];
      let latestSatellite = [];

      if (plotIds.length > 0) {
        [latestWeather, latestSatellite] = await Promise.all([
          prisma.$queryRaw`
            SELECT DISTINCT ON ("plotId") *
            FROM "WeatherEvent"
            WHERE "plotId" = ANY(${plotIds}::uuid[])
            ORDER BY "plotId", "timestamp" DESC
          `,
          prisma.$queryRaw`
            SELECT DISTINCT ON ("plotId") *
            FROM "SatelliteData"
            WHERE "plotId" = ANY(${plotIds}::uuid[])
            ORDER BY "plotId", "captureDate" DESC
          `,
        ]);
      }

      const weatherByPlot = {};
      for (const w of latestWeather) {
        weatherByPlot[w.plotId] = w;
      }

      const satelliteByPlot = {};
      for (const s of latestSatellite) {
        satelliteByPlot[s.plotId] = s;
      }

      const enrichedPlots = plots.map((plot) => ({
        ...plot,
        latestWeather: weatherByPlot[plot.id] || null,
        latestSatellite: satelliteByPlot[plot.id] || null,
      }));

      const cropDistribution = cropDistributionRaw.map((row) => ({
        cropType: row.cropType,
        count: row._count._all,
        totalAcreage: row._sum.acreage || 0,
      }));

      return {
        plots: { data: enrichedPlots, total, page: p, limit: l },
        cropDistribution,
      };
    } catch (error) {
      logger.error('Failed to get org plots', { organizationId, error: error.message });
      throw error;
    }
  },

  async getActivity(organizationId, query) {
    try {
      const limit = parseInt(query.limit, 10) || 20;

      const [recentFarmers, recentPolicies, recentPayouts] = await Promise.all([
        prisma.farmer.findMany({
          where: { organizationId },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            kycStatus: true,
            createdAt: true,
          },
        }),
        prisma.policy.findMany({
          where: { organizationId },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            policyNumber: true,
            status: true,
            premium: true,
            createdAt: true,
          },
        }),
        prisma.payout.findMany({
          where: { organizationId },
          take: limit,
          orderBy: { initiatedAt: 'desc' },
          select: {
            id: true,
            amountUSDC: true,
            status: true,
            initiatedAt: true,
          },
        }),
      ]);

      const activity = [
        ...recentFarmers.map((f) => ({
          type: 'farmer_registered',
          id: f.id,
          description: `${f.firstName} ${f.lastName} registered (KYC: ${f.kycStatus})`,
          timestamp: f.createdAt,
          data: f,
        })),
        ...recentPolicies.map((p) => ({
          type: 'policy_created',
          id: p.id,
          description: `Policy ${p.policyNumber} ${p.status} (${p.premium} USDC)`,
          timestamp: p.createdAt,
          data: p,
        })),
        ...recentPayouts.map((p) => ({
          type: 'payout_initiated',
          id: p.id,
          description: `Payout ${p.status} (${p.amountUSDC} USDC)`,
          timestamp: p.initiatedAt,
          data: p,
        })),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return { activity };
    } catch (error) {
      logger.error('Failed to get org activity', { organizationId, error: error.message });
      throw error;
    }
  },
};

export default dashboardOrgService;
