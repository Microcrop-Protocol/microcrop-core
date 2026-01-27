import prisma from '../config/database.js';
import { buildDateFilter } from '../validators/dashboard.validator.js';
import logger from '../utils/logger.js';

function toCsvRow(fields) {
  return fields
    .map((f) => {
      if (f === null || f === undefined) return '';
      const str = String(f);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

function buildCsv(headers, rows) {
  const lines = [toCsvRow(headers)];
  for (const row of rows) {
    lines.push(toCsvRow(row));
  }
  return lines.join('\n');
}

export const exportService = {
  async exportFarmers(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const farmers = await prisma.farmer.findMany({
        where: {
          organizationId,
          createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        include: {
          _count: { select: { plots: true, policies: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'First Name', 'Last Name', 'Phone', 'National ID',
        'County', 'Sub-County', 'Ward', 'Village',
        'KYC Status', 'Plots', 'Policies', 'Created At',
      ];

      const rows = farmers.map((f) => [
        f.firstName, f.lastName, f.phoneNumber, f.nationalId,
        f.county, f.subCounty, f.ward, f.village,
        f.kycStatus, f._count.plots, f._count.policies,
        f.createdAt.toISOString(),
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export farmers', { organizationId, error: error.message });
      throw error;
    }
  },

  async exportPolicies(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const policies = await prisma.policy.findMany({
        where: {
          organizationId,
          createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        include: {
          farmer: { select: { firstName: true, lastName: true, phoneNumber: true } },
          plot: { select: { name: true, cropType: true, acreage: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Policy Number', 'Farmer Name', 'Farmer Phone',
        'Plot', 'Crop Type', 'Acreage', 'Coverage Type',
        'Premium', 'Net Premium', 'Platform Fee',
        'Status', 'Start Date', 'End Date', 'Created At',
      ];

      const rows = policies.map((p) => [
        p.policyNumber,
        `${p.farmer.firstName} ${p.farmer.lastName}`,
        p.farmer.phoneNumber,
        p.plot?.name || '',
        p.plot?.cropType || '',
        p.plot?.acreage || '',
        p.coverageType,
        p.premium, p.netPremium, p.platformFee,
        p.status, p.startDate?.toISOString(), p.endDate?.toISOString(),
        p.createdAt.toISOString(),
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export policies', { organizationId, error: error.message });
      throw error;
    }
  },

  async exportPayouts(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const payouts = await prisma.payout.findMany({
        where: {
          organizationId,
          initiatedAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        include: {
          policy: {
            select: {
              policyNumber: true,
              farmer: { select: { firstName: true, lastName: true, phoneNumber: true } },
            },
          },
        },
        orderBy: { initiatedAt: 'desc' },
      });

      const headers = [
        'Policy Number', 'Farmer Name', 'Farmer Phone',
        'Amount USDC', 'Damage Percent', 'Status',
        'MPESA Reference', 'TX Hash',
        'Initiated At', 'Completed At', 'Failed At', 'Failure Reason',
      ];

      const rows = payouts.map((p) => [
        p.policy?.policyNumber || '',
        p.policy?.farmer ? `${p.policy.farmer.firstName} ${p.policy.farmer.lastName}` : '',
        p.policy?.farmer?.phoneNumber || '',
        p.amountUSDC, p.damagePercent, p.status,
        p.mpesaReference || '', p.txHash || '',
        p.initiatedAt?.toISOString(), p.completedAt?.toISOString(),
        p.failedAt?.toISOString(), p.failureReason || '',
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export payouts', { organizationId, error: error.message });
      throw error;
    }
  },

  async exportTransactions(organizationId, query) {
    try {
      const dateFilter = buildDateFilter(query);

      const transactions = await prisma.transaction.findMany({
        where: {
          organizationId,
          createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Type', 'Amount', 'Status', 'Reference',
        'TX Hash', 'Created At',
      ];

      const rows = transactions.map((t) => [
        t.type, t.amount, t.status,
        t.reference || '', t.txHash || '',
        t.createdAt.toISOString(),
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export transactions', { organizationId, error: error.message });
      throw error;
    }
  },

  async exportPlatformOrganizations(query) {
    try {
      const dateFilter = buildDateFilter(query);

      const orgs = await prisma.organization.findMany({
        where: {
          createdAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        include: {
          _count: { select: { farmers: true, policies: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const headers = [
        'Name', 'Type', 'Is Active', 'Contact Person', 'Contact Email',
        'Farmers', 'Policies',
        'Total Premiums', 'Total Payouts', 'Total Fees',
        'Pool Address', 'Created At',
      ];

      const rows = orgs.map((o) => [
        o.name, o.type, o.isActive,
        o.contactPerson || '', o.contactEmail || '',
        o._count.farmers, o._count.policies,
        o.totalPremiumsCollected, o.totalPayoutsProcessed, o.totalFeesGenerated,
        o.poolAddress || '',
        o.createdAt.toISOString(),
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export platform organizations', { error: error.message });
      throw error;
    }
  },

  async exportPlatformRevenue(query) {
    try {
      const dateFilter = buildDateFilter(query);

      const fees = await prisma.platformFee.findMany({
        where: {
          collectedAt: { gte: dateFilter.gte, lte: dateFilter.lte },
        },
        include: {
          organization: { select: { name: true } },
        },
        orderBy: { collectedAt: 'desc' },
      });

      const headers = [
        'Organization', 'Premium', 'Fee Amount', 'Fee Percentage',
        'TX Hash', 'Collected At',
      ];

      const rows = fees.map((f) => [
        f.organization?.name || '',
        f.premium, f.feeAmount, f.feePercentage,
        f.txHash || '',
        f.collectedAt?.toISOString(),
      ]);

      return buildCsv(headers, rows);
    } catch (error) {
      logger.error('Failed to export platform revenue', { error: error.message });
      throw error;
    }
  },
};

export default exportService;
